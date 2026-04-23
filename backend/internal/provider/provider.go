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
	Prompt          string
	ImageURL        *string
	DurationSeconds int
	Resolution      string // "480p" | "720p" | "1080p"
	Mode            string // "fast" | "normal"
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
	// EstimateCost is pure: no network. Returns tokens + credits (1 credit = 1/1000 USD = 0.1¢).
	EstimateCost(req GenerationRequest) (tokens int64, credits int64, err error)
	GenerateVideo(ctx context.Context, req GenerationRequest) (providerJobID string, err error)
	GetJobStatus(ctx context.Context, providerJobID string) (*JobStatus, error)
	IsHealthy(ctx context.Context) bool
}
