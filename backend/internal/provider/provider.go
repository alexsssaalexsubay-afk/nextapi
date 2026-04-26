package provider

import (
	"context"
	"errors"
)

// ErrUpstreamUnavailable is returned by providers when they are
// circuit-broken or otherwise refuse a call without trying the network
// (used to surface a meaningful 503 to the caller instead of a generic
// "internal error" or burning a job retry).
var ErrUpstreamUnavailable = errors.New("provider upstream unavailable")

type GenerationRequest struct {
	// Model is the public NextAPI model ID (e.g. "seedance-1.5-pro").
	// Providers translate this to their own upstream model ID.
	// Empty string means "use provider default".
	Model           string
	Prompt          string
	ImageURL        *string
	DurationSeconds int
	Resolution      string // "480p" | "720p" | "1080p"
	Mode            string // "fast" | "normal"

	// The following map 1:1 onto Volcengine Ark / Seedance task params.
	// Zero-value means "let the provider decide" rather than "off".
	// See docs.volcengine.com/docs/82379 (video generation API).
	AspectRatio   string // "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9" | "adaptive"
	FPS           int    // 24 | 30; 0 = provider default
	GenerateAudio *bool  // only supported on doubao-seedance-1-5-pro and newer
	Watermark     *bool
	Seed          *int64 // [-1, 2^32-1]; -1 or omitted = random
	CameraFixed   *bool  // lock the camera to reduce motion

	// Managed Seedance relay extended parameters.
	// Providers that don't support these fields silently ignore them.
	Draft         *bool    // fast preview, lower quality
	ImageURLs     []string // reference images, max 9 (mutually exclusive with FirstFrameURL)
	VideoURLs     []string // reference videos, max 3
	AudioURLs     []string // reference audios, max 3 (requires image or video)
	FirstFrameURL *string  // first frame image (mutually exclusive with ImageURLs)
	LastFrameURL  *string  // last frame image (requires FirstFrameURL)
	TempMediaKeys []string // internal R2 keys to delete after the task reaches terminal state
}

type JobStatus struct {
	Status           string // "queued" | "running" | "succeeded" | "failed"
	VideoURL         *string
	ErrorCode        *string
	ErrorMessage     *string
	ActualTokensUsed *int64
}

type Provider interface {
	Name() string
	// EstimateCost is pure: no network. Returns tokens + product cents
	// (100 cents = 1 displayed point).
	EstimateCost(req GenerationRequest) (tokens int64, credits int64, err error)
	GenerateVideo(ctx context.Context, req GenerationRequest) (providerJobID string, err error)
	GetJobStatus(ctx context.Context, providerJobID string) (*JobStatus, error)
	IsHealthy(ctx context.Context) bool
}
