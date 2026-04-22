package seedance

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/sanidg/nextapi/backend/internal/provider"
)

// MockProvider returns a deterministic fake video URL ~10s after GenerateVideo.
type MockProvider struct {
	mu   sync.Mutex
	jobs map[string]mockJob
}

type mockJob struct {
	startedAt time.Time
	req       provider.GenerationRequest
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
	id := "mock_" + uuid.NewString()
	p.mu.Lock()
	p.jobs[id] = mockJob{startedAt: time.Now(), req: req}
	p.mu.Unlock()
	return id, nil
}

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
	if elapsed < 10*time.Second {
		return &provider.JobStatus{Status: "running"}, nil
	}
	url := "https://mock.nextapi.top/videos/" + id + ".mp4"
	tokens, _ := Estimate(j.req)
	return &provider.JobStatus{
		Status:           "succeeded",
		VideoURL:         &url,
		ActualTokensUsed: &tokens,
	}, nil
}

func (p *MockProvider) IsHealthy(ctx context.Context) bool { return true }
