package job

import (
	"errors"
	"math"
	"math/rand"
	"net"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

// RetryPolicy governs how many times and at what cadence a provider call
// is retried before the job is moved to a terminal failed state.
type RetryPolicy struct {
	MaxAttempts    int
	BaseDelay      time.Duration
	MaxDelay       time.Duration
	JitterFraction float64 // 0–1; adds ±(jitter*delay) randomness
}

// DefaultRetryPolicy is the global policy for provider calls.
var DefaultRetryPolicy = RetryPolicy{
	MaxAttempts:    5,
	BaseDelay:      2 * time.Second,
	MaxDelay:       60 * time.Second,
	JitterFraction: 0.3,
}

// DelayFor returns the back-off delay for attempt n (1-indexed).
// Uses exponential back-off: delay = min(base * 2^(n-1), max) ± jitter.
func (p RetryPolicy) DelayFor(attempt int) time.Duration {
	if attempt <= 0 {
		attempt = 1
	}
	exp := math.Pow(2, float64(attempt-1))
	raw := p.BaseDelay.Seconds() * exp
	if raw > p.MaxDelay.Seconds() {
		raw = p.MaxDelay.Seconds()
	}
	if p.JitterFraction > 0 {
		jitter := raw * p.JitterFraction * (rand.Float64()*2 - 1)
		raw += jitter
		if raw < 0 {
			raw = 0
		}
	}
	return time.Duration(raw * float64(time.Second))
}

// RetryError wraps a provider error with the decoded error class.
type RetryError struct {
	Code      string
	Msg       string
	Retryable bool
}

func (e *RetryError) Error() string { return e.Code + ": " + e.Msg }

// ClassifyError determines whether an error from a provider call is
// retryable or a permanent failure.
//
// Retryable:
//   - network errors (DNS, connection refused, timeout)
//   - HTTP 429 Too Many Requests
//   - HTTP 5xx errors
//   - context deadline exceeded
//
// Non-retryable (fail immediately):
//   - invalid request / 4xx (except 429)
//   - authentication / authorization failures
//   - content policy violations
func ClassifyError(err error) *RetryError {
	if err == nil {
		return nil
	}
	var upstreamErr *provider.UpstreamError
	if errors.As(err, &upstreamErr) {
		code := strings.TrimSpace(upstreamErr.Code)
		if code == "" {
			code = "provider_error"
		}
		return &RetryError{Code: code, Msg: upstreamErr.Message, Retryable: upstreamErr.Retryable}
	}
	msg := err.Error()
	lower := strings.ToLower(msg)

	// Network errors — always retryable
	var netErr net.Error
	if errors.As(err, &netErr) || strings.Contains(lower, "connection refused") ||
		strings.Contains(lower, "no such host") || strings.Contains(lower, "timeout") ||
		strings.Contains(lower, "deadline exceeded") {
		return &RetryError{Code: "network_error", Msg: msg, Retryable: true}
	}

	// HTTP status codes embedded in error message by provider clients
	for _, code := range []string{"429", "500", "502", "503", "504"} {
		if strings.Contains(msg, code) {
			switch code {
			case "429":
				return &RetryError{Code: "rate_limit", Msg: msg, Retryable: true}
			default:
				return &RetryError{Code: "provider_server_error", Msg: msg, Retryable: true}
			}
		}
	}

	// Non-retryable provider / content errors
	if strings.Contains(lower, "invalid") || strings.Contains(lower, "bad request") ||
		strings.Contains(lower, "400") {
		return &RetryError{Code: "invalid_request", Msg: msg, Retryable: false}
	}
	if strings.Contains(lower, "401") || strings.Contains(lower, "403") ||
		strings.Contains(lower, "unauthorized") || strings.Contains(lower, "forbidden") {
		return &RetryError{Code: "provider_auth_error", Msg: msg, Retryable: false}
	}
	if strings.Contains(lower, "content") && strings.Contains(lower, "policy") {
		return &RetryError{Code: "content_policy_provider", Msg: msg, Retryable: false}
	}

	// Default: treat as retryable provider error
	return &RetryError{Code: "provider_error", Msg: msg, Retryable: true}
}
