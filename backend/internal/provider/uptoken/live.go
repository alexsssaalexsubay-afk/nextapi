package uptoken

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

// uptokenBase is the default managed Seedance relay endpoint.
// Override with SEEDANCE_RELAY_BASE_URL for staging / on-prem deployments.
const uptokenBase = "https://uptoken.cc/v1"

// LiveProvider talks to a managed Seedance relay on our behalf.
//
// The contract mirrors Volcengine Ark but uses slightly different paths and
// an internal upstream bearer key:
//
//	POST /v1/video/generations       -> { "id": "ut-…" }
//	GET  /v1/video/generations/:id   -> { "id", "status", "content.video_url", "usage.total_tokens", "error{code,message,type}" }
//
// Status flow: queued → running → succeeded / failed.
//
// We reuse the same transport hardening we built for the Ark direct path:
//   - Split clients for create (15s) vs poll (8s) so slow polls can't starve
//     creation latency.
//   - Idempotent retry on transient errors (network, 429, 5xx): 3 attempts
//     for create, 5 for status. 4xx (other than 408/429) fail fast so we
//     don't double-charge the upstream for a bad request.
//   - A lightweight circuit breaker that trips after 6 consecutive failures
//     inside a 60s window and allows a single probe after 30s. This mirrors
//     the seedance breaker — see provider/seedance/live.go.
//   - Honest IsHealthy: pings upstream and caches the result for 60s.
type LiveProvider struct {
	apiKey     string
	model      string
	base       string
	httpFast   *http.Client
	httpCreate *http.Client

	breaker *circuitBreaker
}

// NewLive reads managed Seedance relay credentials from the environment and constructs a
// production-ready provider. Returns an error if no API key is set so the
// process fails fast on misconfiguration instead of silently 401'ing every
// customer request.
func NewLive() (*LiveProvider, error) {
	k := getenvAny("SEEDANCE_RELAY_API_KEY", "UPTOKEN_API_KEY")
	if k == "" {
		return nil, fmt.Errorf("SEEDANCE_RELAY_API_KEY required for seedance relay provider")
	}
	model := getenvAny("SEEDANCE_RELAY_MODEL", "UPTOKEN_MODEL")
	if model == "" {
		model = uptokenSeedance20Pro
	}
	base := getenvAny("SEEDANCE_RELAY_BASE_URL", "UPTOKEN_BASE_URL")
	if base == "" {
		base = uptokenBase
	}
	base = strings.TrimRight(base, "/")

	transport := &http.Transport{
		MaxIdleConnsPerHost:   16,
		MaxConnsPerHost:       64,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ResponseHeaderTimeout: 8 * time.Second,
		DialContext: (&net.Dialer{
			Timeout:   3 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	}
	return &LiveProvider{
		apiKey:     k,
		model:      model,
		base:       base,
		httpFast:   &http.Client{Timeout: 8 * time.Second, Transport: transport},
		httpCreate: &http.Client{Timeout: 15 * time.Second, Transport: transport},
		breaker:    newCircuitBreaker(6, 60*time.Second, 30*time.Second),
	}, nil
}

func (p *LiveProvider) Name() string { return "seedance-relay" }

func (p *LiveProvider) EstimateCost(req provider.GenerationRequest) (int64, int64, error) {
	if err := validateUpTokenPayload(req); err != nil {
		return 0, 0, err
	}
	t, c := Estimate(req)
	return t, c, nil
}

// Upstream payload shapes. The Seedance relay accepts both flat fields
// (prompt, image_urls, first_frame_url…) and the content[] array; we emit the
// richer content[] representation exclusively so reference roles stay explicit
// and we never hit error-211 by mixing formats.
type uptokenPart struct {
	Type     string           `json:"type"`
	Text     string           `json:"text,omitempty"`
	Role     string           `json:"role,omitempty"`
	ImageURL *uptokenMediaURL `json:"image_url,omitempty"`
	VideoURL *uptokenMediaURL `json:"video_url,omitempty"`
	AudioURL *uptokenMediaURL `json:"audio_url,omitempty"`
}

type uptokenMediaURL struct {
	URL string `json:"url"`
}

type uptokenCreateReq struct {
	Model   string        `json:"model"`
	Content []uptokenPart `json:"content,omitempty"`
	// Shared params.
	Ratio         string `json:"ratio,omitempty"`
	Resolution    string `json:"resolution,omitempty"`
	Duration      int    `json:"duration,omitempty"`
	GenerateAudio *bool  `json:"generate_audio,omitempty"`
	Draft         *bool  `json:"draft,omitempty"`
	Seed          *int64 `json:"seed,omitempty"`
}

type uptokenCreateResp struct {
	ID    string `json:"id"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

func (p *LiveProvider) GenerateVideo(ctx context.Context, req provider.GenerationRequest) (string, error) {
	if !p.breaker.allow() {
		return "", provider.ErrUpstreamUnavailable
	}
	if err := validateUpTokenPayload(req); err != nil {
		return "", err
	}

	model := ResolveUpstreamModel(req, p.model)

	body, err := json.Marshal(uptokenCreateReq{
		Model:         model,
		Content:       buildUpTokenContent(req),
		Ratio:         req.AspectRatio,
		Resolution:    req.Resolution,
		Duration:      req.DurationSeconds,
		GenerateAudio: req.GenerateAudio,
		Draft:         req.Draft,
		Seed:          req.Seed,
	})
	if err != nil {
		return "", fmt.Errorf("seedance relay create marshal: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			if !sleepCtx(ctx, backoff(attempt)) {
				return "", ctx.Err()
			}
		}
		id, retryable, err := p.doCreate(ctx, body)
		if err == nil {
			p.breaker.recordSuccess()
			return id, nil
		}
		lastErr = err
		if !retryable {
			p.breaker.recordFailure()
			return "", err
		}
	}
	p.breaker.recordFailure()
	return "", lastErr
}

func buildUpTokenContent(req provider.GenerationRequest) []uptokenPart {
	parts := make([]uptokenPart, 0, 1+len(req.ImageURLs)+len(req.VideoURLs)+len(req.AudioURLs)+3)
	if prompt := strings.TrimSpace(req.Prompt); prompt != "" {
		parts = append(parts, uptokenPart{Type: "text", Text: prompt})
	}
	if req.ImageURL != nil {
		if u := strings.TrimSpace(*req.ImageURL); u != "" {
			parts = append(parts, uptokenPart{
				Type:     "image_url",
				Role:     "reference_image",
				ImageURL: &uptokenMediaURL{URL: u},
			})
		}
	}
	for _, raw := range req.ImageURLs {
		if u := strings.TrimSpace(raw); u != "" {
			parts = append(parts, uptokenPart{
				Type:     "image_url",
				Role:     "reference_image",
				ImageURL: &uptokenMediaURL{URL: u},
			})
		}
	}
	if req.FirstFrameURL != nil {
		if u := strings.TrimSpace(*req.FirstFrameURL); u != "" {
			parts = append(parts, uptokenPart{
				Type:     "image_url",
				Role:     "first_frame",
				ImageURL: &uptokenMediaURL{URL: u},
			})
		}
	}
	if req.LastFrameURL != nil {
		if u := strings.TrimSpace(*req.LastFrameURL); u != "" {
			parts = append(parts, uptokenPart{
				Type:     "image_url",
				Role:     "last_frame",
				ImageURL: &uptokenMediaURL{URL: u},
			})
		}
	}
	for _, raw := range req.VideoURLs {
		if u := strings.TrimSpace(raw); u != "" {
			parts = append(parts, uptokenPart{
				Type:     "video_url",
				Role:     "reference_video",
				VideoURL: &uptokenMediaURL{URL: u},
			})
		}
	}
	for _, raw := range req.AudioURLs {
		if u := strings.TrimSpace(raw); u != "" {
			parts = append(parts, uptokenPart{
				Type:     "audio_url",
				Role:     "reference_audio",
				AudioURL: &uptokenMediaURL{URL: u},
			})
		}
	}
	return parts
}

func (p *LiveProvider) doCreate(ctx context.Context, body []byte) (string, bool, error) {
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		p.base+"/video/generations", bytes.NewReader(body))
	if err != nil {
		return "", false, fmt.Errorf("seedance relay create request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("User-Agent", "nextapi-gateway/1.0")

	resp, err := p.httpCreate.Do(httpReq)
	if err != nil {
		return "", true, fmt.Errorf("seedance relay create transport: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return "", true, fmt.Errorf("seedance relay create read: %w", err)
	}

	// 408/429/5xx are retryable; 4xx parameter errors fail fast so we don't
	// double-charge for prompts upstream already rejected.
	if resp.StatusCode == 408 || resp.StatusCode == 429 || resp.StatusCode >= 500 {
		if upstreamErr := decodeUpTokenError(raw, resp.StatusCode); upstreamErr != nil {
			return "", true, upstreamErr
		}
		return "", true, fmt.Errorf("seedance relay create http %d: %s", resp.StatusCode, snippet(raw))
	}
	if resp.StatusCode >= 400 {
		if upstreamErr := decodeUpTokenError(raw, resp.StatusCode); upstreamErr != nil {
			return "", false, upstreamErr
		}
		return "", false, fmt.Errorf("seedance relay create http %d: %s", resp.StatusCode, snippet(raw))
	}

	var out uptokenCreateResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", false, fmt.Errorf("seedance relay create decode: %w", err)
	}
	if out.Error != nil {
		retryable := uptokenErrorRetryable(out.Error.Code, resp.StatusCode)
		return "", retryable, &provider.UpstreamError{
			Code:      out.Error.Code,
			Message:   out.Error.Message,
			Type:      out.Error.Type,
			Retryable: retryable,
		}
	}
	if out.ID == "" {
		return "", true, errors.New("seedance relay create returned empty id")
	}
	return out.ID, false, nil
}

type uptokenStatusResp struct {
	ID      string `json:"id"`
	Status  string `json:"status"`
	Content *struct {
		VideoURL string `json:"video_url"`
	} `json:"content,omitempty"`
	Usage *struct {
		TotalTokens int64 `json:"total_tokens"`
	} `json:"usage,omitempty"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

var allowedAspectRatios = map[string]struct{}{
	"16:9": {}, "9:16": {}, "1:1": {}, "4:3": {}, "3:4": {}, "21:9": {}, "adaptive": {},
}

func (p *LiveProvider) GetJobStatus(ctx context.Context, providerJobID string) (*provider.JobStatus, error) {
	if !p.breaker.allow() {
		return nil, provider.ErrUpstreamUnavailable
	}
	var lastErr error
	for attempt := 0; attempt < 5; attempt++ {
		if attempt > 0 {
			if !sleepCtx(ctx, backoff(attempt)) {
				return nil, ctx.Err()
			}
		}
		js, retryable, err := p.doStatus(ctx, providerJobID)
		if err == nil {
			p.breaker.recordSuccess()
			return js, nil
		}
		lastErr = err
		if !retryable {
			p.breaker.recordFailure()
			return nil, err
		}
	}
	p.breaker.recordFailure()
	return nil, lastErr
}

func (p *LiveProvider) doStatus(ctx context.Context, providerJobID string) (*provider.JobStatus, bool, error) {
	httpReq, err := http.NewRequestWithContext(ctx, "GET",
		p.base+"/video/generations/"+providerJobID, nil)
	if err != nil {
		return nil, false, fmt.Errorf("seedance relay status request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("User-Agent", "nextapi-gateway/1.0")

	resp, err := p.httpFast.Do(httpReq)
	if err != nil {
		return nil, true, fmt.Errorf("seedance relay status transport: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return nil, true, fmt.Errorf("seedance relay status read: %w", err)
	}

	if resp.StatusCode == 408 || resp.StatusCode == 429 || resp.StatusCode >= 500 {
		if upstreamErr := decodeUpTokenError(raw, resp.StatusCode); upstreamErr != nil {
			return nil, true, upstreamErr
		}
		return nil, true, fmt.Errorf("seedance relay status http %d: %s", resp.StatusCode, snippet(raw))
	}
	if resp.StatusCode >= 400 {
		if upstreamErr := decodeUpTokenError(raw, resp.StatusCode); upstreamErr != nil {
			return nil, false, upstreamErr
		}
		return nil, false, fmt.Errorf("seedance relay status http %d: %s", resp.StatusCode, snippet(raw))
	}

	var out uptokenStatusResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, true, fmt.Errorf("seedance relay status decode: %w", err)
	}
	js := &provider.JobStatus{Status: out.Status}
	if out.Content != nil && out.Content.VideoURL != "" {
		js.VideoURL = &out.Content.VideoURL
	}
	if out.Usage != nil {
		t := out.Usage.TotalTokens
		js.ActualTokensUsed = &t
	}
	if out.Error != nil {
		js.ErrorCode = &out.Error.Code
		js.ErrorMessage = &out.Error.Message
	}
	return js, false, nil
}

func validateUpTokenPayload(req provider.GenerationRequest) error {
	if req.Resolution != "" {
		if _, ok := provider.AllowedResolutions()[strings.TrimSpace(req.Resolution)]; !ok {
			return &provider.UpstreamError{Code: "error-205", Message: "resolution is not allowed by provider config", Type: "invalid_request"}
		}
	}
	if req.AspectRatio != "" {
		if _, ok := allowedAspectRatios[req.AspectRatio]; !ok {
			return &provider.UpstreamError{Code: "error-201", Message: "aspect_ratio is unsupported", Type: "invalid_request"}
		}
	}
	if req.DurationSeconds != 0 && (req.DurationSeconds < 4 || req.DurationSeconds > 15) {
		return &provider.UpstreamError{Code: "error-204", Message: "duration is unsupported", Type: "invalid_request"}
	}
	referenceImageCount := len(req.ImageURLs)
	if req.ImageURL != nil && strings.TrimSpace(*req.ImageURL) != "" {
		referenceImageCount++
	}
	if referenceImageCount > 9 {
		return &provider.UpstreamError{Code: "error-206", Message: "too many image_urls", Type: "invalid_request"}
	}
	if len(req.VideoURLs) > 3 {
		return &provider.UpstreamError{Code: "error-207", Message: "too many video_urls", Type: "invalid_request"}
	}
	if len(req.AudioURLs) > 3 {
		return &provider.UpstreamError{Code: "error-208", Message: "too many audio_urls", Type: "invalid_request"}
	}
	hasFirstFrame := req.FirstFrameURL != nil && strings.TrimSpace(*req.FirstFrameURL) != ""
	hasReferenceImages := referenceImageCount > 0
	if hasFirstFrame && hasReferenceImages {
		return &provider.UpstreamError{Code: "error-209", Message: "first_frame_url and image_urls are mutually exclusive", Type: "invalid_request"}
	}
	if req.LastFrameURL != nil && strings.TrimSpace(*req.LastFrameURL) != "" && !hasFirstFrame {
		return &provider.UpstreamError{Code: "error-201", Message: "last_frame_url requires first_frame_url", Type: "invalid_request"}
	}
	if len(req.AudioURLs) > 0 && !hasReferenceImages && len(req.VideoURLs) == 0 && !hasFirstFrame {
		return &provider.UpstreamError{Code: "error-210", Message: "audio_urls requires image or video input", Type: "invalid_request"}
	}
	if strings.TrimSpace(req.Prompt) == "" && !provider.HasVisualInput(req) {
		return &provider.UpstreamError{Code: "error-202", Message: "prompt or visual media input is required", Type: "invalid_request"}
	}
	if err := validateUpTokenMediaURL(req.ImageURL); err != nil {
		return err
	}
	for i := range req.ImageURLs {
		if err := validateUpTokenMediaURL(&req.ImageURLs[i]); err != nil {
			return err
		}
	}
	for i := range req.VideoURLs {
		if err := validateUpTokenMediaURL(&req.VideoURLs[i]); err != nil {
			return err
		}
	}
	for i := range req.AudioURLs {
		if err := validateUpTokenMediaURL(&req.AudioURLs[i]); err != nil {
			return err
		}
	}
	if err := validateUpTokenMediaURL(req.FirstFrameURL); err != nil {
		return err
	}
	if err := validateUpTokenMediaURL(req.LastFrameURL); err != nil {
		return err
	}
	return nil
}

func validateUpTokenMediaURL(raw *string) error {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil
	}
	parsed, err := url.Parse(strings.TrimSpace(*raw))
	if err != nil || parsed.Host == "" {
		return &provider.UpstreamError{Code: "error-401", Message: "media url is invalid", Type: "invalid_request"}
	}
	if strings.ToLower(parsed.Scheme) == "asset" {
		if strings.HasPrefix(strings.ToLower(parsed.Host), "ut-asset-") {
			return nil
		}
		return &provider.UpstreamError{Code: "error-401", Message: "asset url is invalid", Type: "invalid_request"}
	}
	if strings.ToLower(parsed.Scheme) != "https" {
		return &provider.UpstreamError{Code: "error-401", Message: "media url must be public https", Type: "invalid_request"}
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return &provider.UpstreamError{Code: "error-401", Message: "media url must be public https", Type: "invalid_request"}
	}
	if ip := net.ParseIP(host); ip != nil && !isPublicIPLite(ip) {
		return &provider.UpstreamError{Code: "error-401", Message: "media url must be public https", Type: "invalid_request"}
	}
	return nil
}

func decodeUpTokenError(raw []byte, statusCode int) *provider.UpstreamError {
	var out struct {
		Error *struct {
			Code    string `json:"code"`
			Message string `json:"message"`
			Type    string `json:"type"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || out.Error == nil {
		return nil
	}
	return &provider.UpstreamError{
		Code:      out.Error.Code,
		Message:   out.Error.Message,
		Type:      out.Error.Type,
		Retryable: uptokenErrorRetryable(out.Error.Code, statusCode),
	}
}

func uptokenErrorRetryable(code string, statusCode int) bool {
	if statusCode == 408 || statusCode == 429 || statusCode >= 500 {
		return true
	}
	switch code {
	case "error-501", "error-505", "error-601", "error-603", "error-604":
		return true
	default:
		return false
	}
}

func isPublicIPLite(ip net.IP) bool {
	if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() ||
		ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	if v4 := ip.To4(); v4 != nil {
		switch {
		case v4[0] == 10,
			v4[0] == 127,
			v4[0] == 0,
			v4[0] == 169 && v4[1] == 254,
			v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31,
			v4[0] == 192 && v4[1] == 168,
			v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127:
			return false
		}
		return true
	}
	if ip[0]&0xfe == 0xfc {
		return false
	}
	return true
}

var (
	healthLastCheck atomic.Int64
	healthLastValue atomic.Bool
)

// IsHealthy pings upstream with a 3s budget. Caches the result for 60s so we
// don't thrash the Seedance relay on every health probe. We treat 401/403 as "our key
// is bad → unhealthy" because silent auth rot is a common ops failure mode;
// a 404 on a fake job ID is the expected response of a healthy upstream API
// (the task simply doesn't exist), so we treat it as healthy.
func (p *LiveProvider) IsHealthy(ctx context.Context) bool {
	if p.apiKey == "" {
		return false
	}
	now := time.Now().Unix()
	if last := healthLastCheck.Load(); now-last < 60 {
		return healthLastValue.Load()
	}
	probeCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(probeCtx, "GET",
		p.base+"/video/generations/__healthcheck__", nil)
	if err != nil {
		healthLastValue.Store(false)
		return false
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	resp, err := p.httpFast.Do(httpReq)
	healthLastCheck.Store(now)
	if err != nil {
		healthLastValue.Store(false)
		return false
	}
	resp.Body.Close()
	healthy := resp.StatusCode != 401 && resp.StatusCode != 403 &&
		(resp.StatusCode < 500 && resp.StatusCode != 429)
	healthLastValue.Store(healthy)
	return healthy
}

// backoff returns ~ 250ms × 2^attempt with ±25% jitter, capped at 4s.
func backoff(attempt int) time.Duration {
	base := 250 * time.Millisecond
	for i := 0; i < attempt; i++ {
		base *= 2
	}
	if base > 4*time.Second {
		base = 4 * time.Second
	}
	jitter := time.Duration(float64(base) * (0.75 + 0.5*pseudoRand()))
	return jitter
}

func pseudoRand() float64 {
	x := time.Now().UnixNano() & 0xffff
	return float64(x) / float64(0x10000)
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-ctx.Done():
		return false
	}
}

func snippet(b []byte) string {
	if len(b) > 256 {
		return string(b[:256]) + "…"
	}
	return string(b)
}

func getenvAny(keys ...string) string {
	for _, key := range keys {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return ""
}

// circuitBreaker is an atomics-only three-state breaker (closed / open /
// half-open). We avoid a mutex because allow() is on the hot path of every
// provider call.
type circuitBreaker struct {
	threshold     int
	window        time.Duration
	openFor       time.Duration
	failureCount  atomic.Int32
	failureWindow atomic.Int64
	openedAt      atomic.Int64
}

func newCircuitBreaker(threshold int, window, openFor time.Duration) *circuitBreaker {
	return &circuitBreaker{threshold: threshold, window: window, openFor: openFor}
}

func (b *circuitBreaker) allow() bool {
	if b == nil {
		return true
	}
	openedAt := b.openedAt.Load()
	if openedAt == 0 {
		return true
	}
	elapsed := time.Now().UnixNano() - openedAt
	if elapsed > b.openFor.Nanoseconds() {
		b.openedAt.Store(0)
		b.failureCount.Store(0)
		return true
	}
	return false
}

func (b *circuitBreaker) recordSuccess() {
	if b == nil {
		return
	}
	b.failureCount.Store(0)
	b.openedAt.Store(0)
}

func (b *circuitBreaker) recordFailure() {
	if b == nil {
		return
	}
	now := time.Now().UnixNano()
	winStart := b.failureWindow.Load()
	if winStart == 0 || now-winStart > b.window.Nanoseconds() {
		b.failureWindow.Store(now)
		b.failureCount.Store(1)
		return
	}
	count := b.failureCount.Add(1)
	if int(count) >= b.threshold && b.openedAt.Load() == 0 {
		b.openedAt.Store(now)
	}
}
