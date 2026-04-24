package seedance

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

// ── Sandbox test keywords ──────────────────────────────────────────
//
// Mirrors the UpToken sandbox contract so downstream users can test
// error handling with sandbox keys. Keywords are detected anywhere
// in the prompt string.
//
// Submit-phase errors (GenerateVideo returns error):
//   __test_submit_400         → invalid parameter (pixel count)
//   __test_submit_moderation  → content moderation rejection
//   __test_submit_unavailable → service unavailable
//
// Poll-phase errors (GenerateVideo succeeds, GetJobStatus returns failed):
//   __test_poll_502           → service 502 (service unavailable)
//   __test_poll_moderation    → content filter rejection
//   __test_poll_timeout       → task timeout (2 hours)
//   __test_poll_failed        → generic generation failure

// MockProvider returns deterministic results for testing. It supports
// sandbox keywords in the prompt to simulate upstream error scenarios.
type MockProvider struct {
	mu   sync.Mutex
	jobs map[string]mockJob
}

type mockJob struct {
	startedAt time.Time
	req       provider.GenerationRequest
	// pollError is set at submit time when a __test_poll_* keyword is detected.
	// GetJobStatus returns this error after the simulated "running" phase.
	pollError *mockPollError
}

type mockPollError struct {
	code    string
	message string
}

func NewMock() *MockProvider {
	return &MockProvider{jobs: make(map[string]mockJob)}
}

func (p *MockProvider) Name() string { return "seedance-mock" }

func (p *MockProvider) EstimateCost(req provider.GenerationRequest) (int64, int64, error) {
	t, c := Estimate(req)
	return t, c, nil
}

func (p *MockProvider) GenerateVideo(ctx context.Context, req provider.GenerationRequest) (string, error) {
	prompt := req.Prompt

	// ── Submit-phase errors: return error immediately ──
	if strings.Contains(prompt, "__test_submit_400") {
		return "", fmt.Errorf("invalid parameter: pixel count exceeds maximum (simulated)")
	}
	if strings.Contains(prompt, "__test_submit_moderation") {
		return "", fmt.Errorf("content moderation rejection: prompt violates content policy (simulated)")
	}
	if strings.Contains(prompt, "__test_submit_unavailable") {
		return "", provider.ErrUpstreamUnavailable
	}

	// ── Poll-phase errors: store for later ──
	var pe *mockPollError
	if strings.Contains(prompt, "__test_poll_502") {
		pe = &mockPollError{code: "error-502", message: "Service unavailable (simulated)"}
	} else if strings.Contains(prompt, "__test_poll_moderation") {
		pe = &mockPollError{code: "error-303", message: "Generated video rejected by content filter (simulated)"}
	} else if strings.Contains(prompt, "__test_poll_timeout") {
		pe = &mockPollError{code: "error-timeout", message: "Task timed out after 2 hours (simulated)"}
	} else if strings.Contains(prompt, "__test_poll_failed") {
		pe = &mockPollError{code: "error-500", message: "Generation failed (simulated)"}
	}

	id := "mock_" + uuid.NewString()
	p.mu.Lock()
	p.jobs[id] = mockJob{startedAt: time.Now(), req: req, pollError: pe}
	p.mu.Unlock()
	return id, nil
}

// mockRunDuration is how long a mock job stays in "running" before resolving.
// Short enough for tests, long enough for a human to see the transition.
const mockRunDuration = 3 * time.Second

func (p *MockProvider) GetJobStatus(ctx context.Context, id string) (*provider.JobStatus, error) {
	p.mu.Lock()
	j, ok := p.jobs[id]
	p.mu.Unlock()
	if !ok {
		msg := "unknown job"
		code := "not_found"
		return &provider.JobStatus{Status: "failed", ErrorCode: &code, ErrorMessage: &msg}, nil
	}

	elapsed := time.Since(j.startedAt)

	// Still "running" for the first few seconds.
	if elapsed < mockRunDuration {
		return &provider.JobStatus{Status: "running"}, nil
	}

	// Poll-phase error: return failed with the stored error.
	if j.pollError != nil {
		return &provider.JobStatus{
			Status:       "failed",
			ErrorCode:    &j.pollError.code,
			ErrorMessage: &j.pollError.message,
		}, nil
	}

	// Normal success.
	url := "https://mock.nextapi.top/videos/" + id + ".mp4"
	tokens, _ := Estimate(j.req)
	return &provider.JobStatus{
		Status:           "succeeded",
		VideoURL:         &url,
		ActualTokensUsed: &tokens,
	}, nil
}

func (p *MockProvider) IsHealthy(ctx context.Context) bool { return true }
