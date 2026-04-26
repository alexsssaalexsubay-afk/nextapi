package job

import (
	"context"
	"errors"
	"fmt"
	"net"
	"testing"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

// ---------------------------------------------------------------------------
// ClassifyError — network errors (always retryable)
// ---------------------------------------------------------------------------

func TestClassifyError_Nil_ReturnsNil(t *testing.T) {
	if ClassifyError(nil) != nil {
		t.Fatal("ClassifyError(nil) should return nil")
	}
}

func TestClassifyError_NetworkTimeout_Retryable(t *testing.T) {
	err := &net.DNSError{Name: "mock", IsTimeout: true}
	r := ClassifyError(err)
	if !r.Retryable {
		t.Fatalf("net timeout should be retryable, code=%s", r.Code)
	}
	if r.Code != "network_error" {
		t.Fatalf("want code=network_error, got %s", r.Code)
	}
}

func TestClassifyError_ConnectionRefused_Retryable(t *testing.T) {
	err := errors.New("connection refused")
	r := ClassifyError(err)
	if !r.Retryable {
		t.Fatalf("connection refused should be retryable")
	}
	if r.Code != "network_error" {
		t.Fatalf("want network_error, got %s", r.Code)
	}
}

func TestClassifyError_DeadlineExceeded_Retryable(t *testing.T) {
	r := ClassifyError(context.DeadlineExceeded)
	if !r.Retryable {
		t.Fatal("deadline exceeded should be retryable")
	}
}

// ---------------------------------------------------------------------------
// ClassifyError — HTTP status codes in error messages
// ---------------------------------------------------------------------------

func TestClassifyError_HTTP429_RateLimit_Retryable(t *testing.T) {
	r := ClassifyError(fmt.Errorf("provider returned 429 Too Many Requests"))
	if !r.Retryable {
		t.Fatal("429 should be retryable")
	}
	if r.Code != "rate_limit" {
		t.Fatalf("want rate_limit, got %s", r.Code)
	}
}

func TestClassifyError_HTTP500_Retryable(t *testing.T) {
	r := ClassifyError(fmt.Errorf("seedance returned 500 Internal Server Error"))
	if !r.Retryable {
		t.Fatal("500 should be retryable")
	}
	if r.Code != "provider_server_error" {
		t.Fatalf("want provider_server_error, got %s", r.Code)
	}
}

func TestClassifyError_HTTP503_Retryable(t *testing.T) {
	r := ClassifyError(fmt.Errorf("upstream 503 Service Unavailable"))
	if !r.Retryable {
		t.Fatal("503 should be retryable")
	}
}

func TestClassifyError_HTTP502_Retryable(t *testing.T) {
	r := ClassifyError(fmt.Errorf("bad gateway 502"))
	if !r.Retryable {
		t.Fatal("502 should be retryable")
	}
}

// ---------------------------------------------------------------------------
// ClassifyError — non-retryable errors
// ---------------------------------------------------------------------------

func TestClassifyError_HTTP400_InvalidRequest_NonRetryable(t *testing.T) {
	r := ClassifyError(fmt.Errorf("bad request 400: prompt too long"))
	if r.Retryable {
		t.Fatal("400 should NOT be retryable")
	}
	if r.Code != "invalid_request" {
		t.Fatalf("want invalid_request, got %s", r.Code)
	}
}

func TestClassifyError_ProviderUpstreamErrorPreservesCode(t *testing.T) {
	r := ClassifyError(&provider.UpstreamError{
		Code:      "error-205",
		Message:   "invalid resolution",
		Type:      "invalid_request",
		Retryable: false,
	})
	if r.Retryable {
		t.Fatal("provider validation errors should not be retryable")
	}
	if r.Code != "error-205" {
		t.Fatalf("want provider code error-205, got %s", r.Code)
	}
}

func TestClassifyError_HTTP401_Unauthorized_NonRetryable(t *testing.T) {
	r := ClassifyError(fmt.Errorf("401 unauthorized"))
	if r.Retryable {
		t.Fatal("401 should NOT be retryable")
	}
	if r.Code != "provider_auth_error" {
		t.Fatalf("want provider_auth_error, got %s", r.Code)
	}
}

func TestClassifyError_HTTP403_Forbidden_NonRetryable(t *testing.T) {
	r := ClassifyError(fmt.Errorf("403 forbidden"))
	if r.Retryable {
		t.Fatal("403 should NOT be retryable")
	}
}

func TestClassifyError_ContentPolicy_NonRetryable(t *testing.T) {
	r := ClassifyError(fmt.Errorf("content policy violation: explicit material detected"))
	if r.Retryable {
		t.Fatal("content policy should NOT be retryable")
	}
	if r.Code != "content_policy_provider" {
		t.Fatalf("want content_policy_provider, got %s", r.Code)
	}
}

func TestClassifyError_InvalidKeyword_NonRetryable(t *testing.T) {
	r := ClassifyError(fmt.Errorf("invalid aspect ratio"))
	if r.Retryable {
		t.Fatal("invalid parameter error should NOT be retryable")
	}
}

// ---------------------------------------------------------------------------
// ClassifyError — unknown errors default to retryable (safe assumption)
// ---------------------------------------------------------------------------

func TestClassifyError_UnknownError_DefaultRetryable(t *testing.T) {
	r := ClassifyError(fmt.Errorf("some mysterious provider error"))
	if !r.Retryable {
		t.Fatal("unknown errors should default to retryable to avoid losing jobs")
	}
	if r.Code != "provider_error" {
		t.Fatalf("want provider_error, got %s", r.Code)
	}
}

// ---------------------------------------------------------------------------
// RetryPolicy.DelayFor — exponential backoff
// ---------------------------------------------------------------------------

func TestDelayFor_Attempt1_EqualToBase(t *testing.T) {
	p := RetryPolicy{
		MaxAttempts:    5,
		BaseDelay:      2 * time.Second,
		MaxDelay:       60 * time.Second,
		JitterFraction: 0, // no jitter for deterministic test
	}
	d := p.DelayFor(1)
	// Without jitter: 2s * 2^0 = 2s
	want := 2 * time.Second
	if d != want {
		t.Fatalf("attempt 1: want %v, got %v", want, d)
	}
}

func TestDelayFor_Attempt2_DoubledDelay(t *testing.T) {
	p := RetryPolicy{
		MaxAttempts:    5,
		BaseDelay:      2 * time.Second,
		MaxDelay:       60 * time.Second,
		JitterFraction: 0,
	}
	d := p.DelayFor(2)
	// 2s * 2^1 = 4s
	want := 4 * time.Second
	if d != want {
		t.Fatalf("attempt 2: want %v, got %v", want, d)
	}
}

func TestDelayFor_Attempt3_QuadrupleDelay(t *testing.T) {
	p := RetryPolicy{
		MaxAttempts:    5,
		BaseDelay:      2 * time.Second,
		MaxDelay:       60 * time.Second,
		JitterFraction: 0,
	}
	d := p.DelayFor(3)
	// 2s * 2^2 = 8s
	want := 8 * time.Second
	if d != want {
		t.Fatalf("attempt 3: want %v, got %v", want, d)
	}
}

func TestDelayFor_NeverExceedsMax(t *testing.T) {
	p := RetryPolicy{
		BaseDelay:      2 * time.Second,
		MaxDelay:       10 * time.Second,
		JitterFraction: 0,
	}
	for attempt := 1; attempt <= 20; attempt++ {
		d := p.DelayFor(attempt)
		if d > 10*time.Second {
			t.Fatalf("attempt %d: delay %v exceeds max 10s", attempt, d)
		}
	}
}

func TestDelayFor_AttemptZeroOrNegative_TreatedAsOne(t *testing.T) {
	p := RetryPolicy{
		BaseDelay:      2 * time.Second,
		MaxDelay:       60 * time.Second,
		JitterFraction: 0,
	}
	d0 := p.DelayFor(0)
	d1 := p.DelayFor(1)
	// Both should produce the base delay.
	if d0 != d1 {
		t.Fatalf("attempt 0 and 1 should produce same delay: %v vs %v", d0, d1)
	}
}

func TestDelayFor_WithJitter_AlwaysNonNegative(t *testing.T) {
	p := RetryPolicy{
		BaseDelay:      100 * time.Millisecond,
		MaxDelay:       60 * time.Second,
		JitterFraction: 0.5, // ±50% jitter
	}
	for attempt := 1; attempt <= 10; attempt++ {
		for run := 0; run < 50; run++ {
			d := p.DelayFor(attempt)
			if d < 0 {
				t.Fatalf("attempt %d: delay must be ≥ 0, got %v", attempt, d)
			}
		}
	}
}

func TestDelayFor_DefaultPolicy_Sane(t *testing.T) {
	// Verify DefaultRetryPolicy produces a sane schedule.
	p := DefaultRetryPolicy

	// Attempt 1 should be between 0.5x and 2x of BaseDelay (with jitter).
	d1 := p.DelayFor(1)
	if d1 <= 0 || d1 > 10*time.Second {
		t.Fatalf("attempt 1 delay out of expected range: %v", d1)
	}

	// Higher attempts should never exceed MaxDelay+jitter.
	for attempt := 1; attempt <= p.MaxAttempts; attempt++ {
		d := p.DelayFor(attempt)
		maxWithJitter := time.Duration(float64(p.MaxDelay) * (1 + p.JitterFraction))
		if d > maxWithJitter {
			t.Fatalf("attempt %d delay %v exceeds max+jitter %v", attempt, d, maxWithJitter)
		}
	}
}
