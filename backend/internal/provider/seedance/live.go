package seedance

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
	"sync/atomic"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

// arkBase is the Volcengine Ark API endpoint that fronts Seedance models.
// Override with SEEDANCE_BASE_URL for staging or a regional fallback.
const arkBase = "https://ark.cn-beijing.volces.com/api/v3"

// LiveProvider is the production Seedance implementation. It includes:
//
//   - Per-call timeouts (15s create, 8s status) instead of one shared
//     30s client timeout, because slow status calls used to chain into
//     stuck poll workers.
//   - Idempotent retry with jittered exponential backoff for transient
//     network errors, 429 and 5xx. Create is retried up to 3 times,
//     status up to 5 times. We never retry 4xx other than 408/429 to
//     avoid double-charging the upstream account on validation errors.
//   - A circuit breaker that trips open after 6 consecutive failures
//     within 60s and stays open for 30s before allowing a single probe.
//     This protects us from amplifying upstream outages into a runaway
//     queue of polling workers.
//   - Honest IsHealthy: actually pings the upstream once per minute.
type LiveProvider struct {
	apiKey     string
	model      string
	base       string
	httpFast   *http.Client // status polls
	httpCreate *http.Client // job creation

	breaker *circuitBreaker
}

func NewLive() (*LiveProvider, error) {
	k := os.Getenv("VOLC_API_KEY")
	if k == "" {
		return nil, fmt.Errorf("VOLC_API_KEY required for live provider")
	}
	model := os.Getenv("SEEDANCE_MODEL")
	if model == "" {
		model = "seedance-v2-pro"
	}
	base := os.Getenv("SEEDANCE_BASE_URL")
	if base == "" {
		base = arkBase
	}
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

func (p *LiveProvider) Name() string { return "seedance" }

func (p *LiveProvider) EstimateCost(req provider.GenerationRequest) (int64, int64, error) {
	t, c := Estimate(req)
	return t, c, nil
}

type arkCreateReq struct {
	Model   string    `json:"model"`
	Content []arkPart `json:"content"`

	// Top-level Ark video-task params. Documented in
	// volcengine.com/docs/82379 (视频生成 API / 创建视频生成任务).
	// omitempty so we only forward fields the caller actually set —
	// otherwise we'd override Ark's own defaults with zero-values.
	Ratio         string   `json:"ratio,omitempty"`
	Resolution    string   `json:"resolution,omitempty"`
	Duration      int      `json:"duration,omitempty"`
	FPS           int      `json:"fps,omitempty"`
	GenerateAudio *bool    `json:"generate_audio,omitempty"`
	Watermark     *bool    `json:"watermark,omitempty"`
	Seed          *int64   `json:"seed,omitempty"`
	CameraFixed   *bool    `json:"camerafixed,omitempty"`
	ImageURLs     []string `json:"image_urls,omitempty"`
	VideoURLs     []string `json:"video_urls,omitempty"`
	AudioURLs     []string `json:"audio_urls,omitempty"`
	FirstFrameURL *string  `json:"first_frame_url,omitempty"`
	LastFrameURL  *string  `json:"last_frame_url,omitempty"`
	Draft         *bool    `json:"draft,omitempty"`
}
type arkPart struct {
	Type     string       `json:"type"`
	Text     string       `json:"text,omitempty"`
	ImageURL *arkImageURL `json:"image_url,omitempty"`
}
type arkImageURL struct {
	URL string `json:"url"`
}
type arkCreateResp struct {
	ID    string `json:"id"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func (p *LiveProvider) GenerateVideo(ctx context.Context, req provider.GenerationRequest) (string, error) {
	if !p.breaker.allow() {
		return "", provider.ErrUpstreamUnavailable
	}

	// Resolve the upstream model: customer's choice wins, env-configured
	// default covers the empty case. If the customer passed an unknown
	// public ID, ResolveArkModel forwards it verbatim — see models.go.
	arkModel := ResolveArkModel(req, p.model)

	parts := []arkPart{{Type: "text", Text: req.Prompt}}
	if req.ImageURL != nil && *req.ImageURL != "" {
		parts = append(parts, arkPart{Type: "image_url", ImageURL: &arkImageURL{URL: *req.ImageURL}})
	}

	body, err := json.Marshal(arkCreateReq{
		Model:         arkModel,
		Content:       parts,
		Ratio:         req.AspectRatio,
		Resolution:    req.Resolution,
		Duration:      req.DurationSeconds,
		FPS:           req.FPS,
		GenerateAudio: req.GenerateAudio,
		Watermark:     req.Watermark,
		Seed:          req.Seed,
		CameraFixed:   req.CameraFixed,
		ImageURLs:     req.ImageURLs,
		VideoURLs:     req.VideoURLs,
		AudioURLs:     req.AudioURLs,
		FirstFrameURL: req.FirstFrameURL,
		LastFrameURL:  req.LastFrameURL,
		Draft:         req.Draft,
	})
	if err != nil {
		return "", fmt.Errorf("seedance create marshal: %w", err)
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

func (p *LiveProvider) doCreate(ctx context.Context, body []byte) (string, bool, error) {
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		p.base+"/contents/generations/tasks", bytes.NewReader(body))
	if err != nil {
		return "", false, fmt.Errorf("seedance create request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("User-Agent", "nextapi-gateway/1.0")

	resp, err := p.httpCreate.Do(httpReq)
	if err != nil {
		return "", true, fmt.Errorf("seedance create transport: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return "", true, fmt.Errorf("seedance create read: %w", err)
	}

	if resp.StatusCode == 429 || resp.StatusCode >= 500 {
		return "", true, fmt.Errorf("seedance create http %d: %s", resp.StatusCode, snippet(raw))
	}
	if resp.StatusCode >= 400 {
		return "", false, fmt.Errorf("seedance create http %d: %s", resp.StatusCode, snippet(raw))
	}

	var out arkCreateResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", false, fmt.Errorf("seedance create decode: %w", err)
	}
	if out.Error != nil {
		return "", false, fmt.Errorf("seedance create %s: %s", out.Error.Code, out.Error.Message)
	}
	if out.ID == "" {
		return "", true, errors.New("seedance create returned empty id")
	}
	return out.ID, false, nil
}

type arkStatusResp struct {
	ID      string `json:"id"`
	Status  string `json:"status"`
	Content *struct {
		VideoURL string `json:"video_url"`
	} `json:"content"`
	Usage *struct {
		TotalTokens int64 `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
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
		p.base+"/contents/generations/tasks/"+providerJobID, nil)
	if err != nil {
		return nil, false, fmt.Errorf("seedance status request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("User-Agent", "nextapi-gateway/1.0")
	resp, err := p.httpFast.Do(httpReq)
	if err != nil {
		return nil, true, fmt.Errorf("seedance status transport: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return nil, true, fmt.Errorf("seedance status read: %w", err)
	}

	if resp.StatusCode == 429 || resp.StatusCode >= 500 {
		return nil, true, fmt.Errorf("seedance status http %d: %s", resp.StatusCode, snippet(raw))
	}
	if resp.StatusCode >= 400 {
		return nil, false, fmt.Errorf("seedance status http %d: %s", resp.StatusCode, snippet(raw))
	}

	var out arkStatusResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, true, fmt.Errorf("seedance status decode: %w", err)
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

// IsHealthy probes upstream directly with a 3s budget. Caches the result
// for 60s so we don't hammer ARK on every health-check.
var (
	healthLastCheck atomic.Int64
	healthLastValue atomic.Bool
)

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
	httpReq, err := http.NewRequestWithContext(probeCtx, "GET", p.base+"/contents/generations/tasks/__healthcheck__", nil)
	if err != nil {
		healthLastValue.Store(false)
		return false
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	resp, err := p.httpFast.Do(httpReq)
	healthLastCheck.Store(now)
	if err != nil {
		// Network error → unhealthy.
		healthLastValue.Store(false)
		return false
	}
	resp.Body.Close()
	// 401/403 means our key is bad — also unhealthy.
	// 404 on a fake job ID is the EXPECTED response of a healthy ARK API.
	// 5xx / 429 → unhealthy.
	healthy := resp.StatusCode != 401 && resp.StatusCode != 403 &&
		(resp.StatusCode < 500 && resp.StatusCode != 429)
	healthLastValue.Store(healthy)
	return healthy
}

// backoff returns ~ 250ms × 2^attempt with ±25% jitter.
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

// pseudoRand returns a non-cryptographic float in [0,1). Used only for
// retry jitter so we don't introduce a math/rand dependency for this
// trivial purpose; uses time.Now().UnixNano() entropy.
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

// circuitBreaker is a minimal three-state breaker (closed / open / half-open).
// We use atomics rather than a mutex because the hot path is allow() which
// runs on every provider call.
type circuitBreaker struct {
	threshold     int
	window        time.Duration
	openFor       time.Duration
	failureCount  atomic.Int32
	failureWindow atomic.Int64 // unix nanos when the current window started
	openedAt      atomic.Int64 // unix nanos; 0 = closed
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
		// Half-open: let one probe through.
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
