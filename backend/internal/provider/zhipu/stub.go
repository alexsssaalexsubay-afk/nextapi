package zhipu

import (
	"context"
	"errors"

	"github.com/sanidg/nextapi/backend/internal/provider"
)

type Stub struct{}

func (Stub) Name() string { return "zhipu" }
func (Stub) EstimateCost(provider.GenerationRequest) (int64, int64, error) {
	return 0, 0, errors.New("zhipu not implemented in v1")
}
func (Stub) GenerateVideo(context.Context, provider.GenerationRequest) (string, error) {
	return "", errors.New("zhipu not implemented in v1")
}
func (Stub) GetJobStatus(context.Context, string) (*provider.JobStatus, error) {
	return nil, errors.New("zhipu not implemented in v1")
}
func (Stub) IsHealthy(context.Context) bool { return false }
