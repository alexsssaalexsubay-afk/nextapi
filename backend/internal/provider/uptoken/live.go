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
	"os"
	"strings"
	"sync/atomic"
	"time"

	"github.com/sanidg/nextapi/backend/internal/provider"
)

// uptokenBase is the default UpToken gateway endpoint.
// See https://uptoken.cc/docs for the full API surface.
// Override with UPTOKEN_BASE_URL for staging / on-prem deployments.
const uptokenBase = "https://uptoken.cc/v1"

// LiveProvider talks to UpToken (https://uptoken.cc), a hosted AI gateway
// that relays Seedance-family video generations on our behalf.
//
// The contract mirrors Volcengine Ark but uses slightly different paths and
// a `ut-*` bearer key:
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

// NewLive reads UpToken credentials from the environment and constructs a
// production-ready provider. Returns an error if no API key is set so the
// process fails fast on misconfiguration instead of silently 401'ing every
// customer request.
func NewLive() (*LiveProvider, error) {
	k := strings.TrimSpace(os.Getenv("UPTOKEN_API_KEY"))
	if k == "" {
		return nil, fmt.Errorf("UPTOKEN_API_KEY required for uptoken provider")
	}
	model := strings.TrimSpace(os.Getenv("UPTOKEN_MODEL"))
	if model == "" {
		model = uptokenSeedance20Pro
	}
	base := strings.TrimSpace(os.Getenv("UPTOKEN_BASE_URL"))
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

func (p *LiveProvider) Name() string { return "uptoken" }

func (p *LiveProvider) EstimateCost(req provider.GenerationRequest) (int64, int64, error) {
	t, c := Estimate(req)
	return t, c, nil
}

// Upstream payload shapes. UpToken accepts both flat fields (prompt,
// image_urls, first_frame_url…) and the content[] array; we use content[]
// exclusively so there's no risk of hitting error-211 (mixed formats).
type uptokenPart struct {
	Type     string          `json:"type"`
	Text     string          `json:"text,omitempty"`
	Role     string          `json:"role,omitempty"`
	ImageURL *uptokenMediaURL `json:"image_url,omitempty"`
	VideoURL *uptokenMediaURL `json:"video_url,omitempty"`
	AudioURL *uptokenMediaURL `json:"audio_url,omitempty"`
}

type uptokenMediaURL struct {
	URL string `json:"url"`
}

type uptokenCreateReq struct {
	Model         string        `json:"model"`
	Content       []uptokenPart `json:"content"`
	Ratio         string        `json:"ratio,omitempty"`
	Resolution    string        `json:"resolution,omitempty"`
	Duration      int           `json:"duration,omitempty"`
	GenerateAudio *bool         `json:"generate_audio,omitempty"`
	Seed          *int64        `json:"seed,omitempty"`
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

	model := ResolveUpstreamModel(req, p.model)

	parts := []uptokenPart{{Type: "text", Text: req.Prompt}}
	if req.ImageURL != nil {
		if u := strings.TrimSpace(*req.ImageURL); u != "" {
			parts = append(parts, uptokenPart{
				Type:     "image_url",
				Role:     "reference_image",
				ImageURL: &uptokenMediaURL{URL: u},
			})
		}
	}

	body, _ := json.Marshal(uptokenCreateReq{
		Model:         model,
		Content:       parts,
		Ratio:         req.AspectRatio,
		Resolution:    req.Resolution,
		Duration:      req.DurationSeconds,
		GenerateAudio: req.GenerateAudio,
		Seed:          req.Seed,
	})

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

func (p *LiveProvider) doCreate(ctx context.Context, body []byte) (string, bool, error) {
	httpReq, _ := http.NewRequestWithContext(ctx, "POST",
		p.base+"/video/generations", bytes.NewReader(body))
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("User-Agent", "nextapi-gateway/1.0")

	resp, err := p.httpCreate.Do(httpReq)
	if err != nil {
		return "", true, fmt.Errorf("uptoken create transport: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))

	// 408/429/5xx are retryable; 4xx parameter errors fail fast so we don't
	// double-charge for prompts upstream already rejected.
	if resp.StatusCode == 408 || resp.StatusCode == 429 || resp.StatusCode >= 500 {
		return "", true, fmt.Errorf("uptoken create http %d: %s", resp.StatusCode, snippet(raw))
	}
	if resp.StatusCode >= 400 {
		return "", false, fmt.Errorf("uptoken create http %d: %s", resp.StatusCode, snippet(raw))
	}

	var out uptokenCreateResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", false, fmt.Errorf("uptoken create decode: %w", err)
	}
	if out.Error != nil {
		return "", false, fmt.Errorf("uptoken create %s: %s", out.Error.Code, out.Error.Message)
	}
	if out.ID == "" {
		return "", true, errors.New("uptoken create returned empty id")
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
	httpReq, _ := http.NewRequestWithContext(ctx, "GET",
		p.base+"/video/generations/"+providerJobID, nil)
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("User-Agent", "nextapi-gateway/1.0")

	resp, err := p.httpFast.Do(httpReq)
	if err != nil {
		return nil, true, fmt.Errorf("uptoken status transport: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))

	if resp.StatusCode == 408 || resp.StatusCode == 429 || resp.StatusCode >= 500 {
		return nil, true, fmt.Errorf("uptoken status http %d: %s", resp.StatusCode, snippet(raw))
	}
	if resp.StatusCode >= 400 {
		return nil, false, fmt.Errorf("uptoken status http %d: %s", resp.StatusCode, snippet(raw))
	}

	var out uptokenStatusResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, true, fmt.Errorf("uptoken status decode: %w", err)
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

var (
	healthLastCheck atomic.Int64
	healthLastValue atomic.Bool
)

// IsHealthy pings upstream with a 3s budget. Caches the result for 60s so we
// don't thrash UpToken on every health probe. We treat 401/403 as "our key
// is bad → unhealthy" because silent auth rot is a common ops failure mode;
// a 404 on a fake job ID is the expected response of a healthy UpToken API
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
	httpReq, _ := http.NewRequestWithContext(probeCtx, "GET",
		p.base+"/video/generations/__healthcheck__", nil)
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
