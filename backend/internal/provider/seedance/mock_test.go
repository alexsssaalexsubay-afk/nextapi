package seedance

import (
	"context"
	"testing"
	"time"

	"github.com/sanidg/nextapi/backend/internal/provider"
)

func TestMockProviderLifecycle(t *testing.T) {
	p := NewMock()
	ctx := context.Background()
	req := provider.GenerationRequest{
		Prompt:          "test",
		DurationSeconds: 5,
		Resolution:      "1080p",
		Mode:            "normal",
	}
	id, err := p.GenerateVideo(ctx, req)
	if err != nil {
		t.Fatal(err)
	}
	st, _ := p.GetJobStatus(ctx, id)
	if st.Status != "running" {
		t.Fatalf("expected running, got %s", st.Status)
	}
	time.Sleep(11 * time.Second)
	st, _ = p.GetJobStatus(ctx, id)
	if st.Status != "succeeded" {
		t.Fatalf("expected succeeded, got %s", st.Status)
	}
	if st.VideoURL == nil || *st.VideoURL == "" {
		t.Fatal("missing video url")
	}
}
