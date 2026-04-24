package seedance

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

func TestMockProviderLifecycle(t *testing.T) {
	p := NewMock()
	ctx := context.Background()
	req := provider.GenerationRequest{
		Prompt:          "a cat walking",
		DurationSeconds: 5,
		Resolution:      "720p",
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
	// Wait for mock to resolve (mockRunDuration = 3s).
	time.Sleep(4 * time.Second)
	st, _ = p.GetJobStatus(ctx, id)
	if st.Status != "succeeded" {
		t.Fatalf("expected succeeded, got %s", st.Status)
	}
	if st.VideoURL == nil || *st.VideoURL == "" {
		t.Fatal("missing video url")
	}
}

// ── Submit-phase sandbox keywords ──

func TestMockSubmit400(t *testing.T) {
	p := NewMock()
	_, err := p.GenerateVideo(context.Background(), provider.GenerationRequest{
		Prompt: "a cat __test_submit_400",
	})
	if err == nil {
		t.Fatal("expected error for __test_submit_400")
	}
	if !strings.Contains(err.Error(), "pixel count") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMockSubmitModeration(t *testing.T) {
	p := NewMock()
	_, err := p.GenerateVideo(context.Background(), provider.GenerationRequest{
		Prompt: "a cat __test_submit_moderation",
	})
	if err == nil {
		t.Fatal("expected error for __test_submit_moderation")
	}
	if !strings.Contains(err.Error(), "moderation") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMockSubmitUnavailable(t *testing.T) {
	p := NewMock()
	_, err := p.GenerateVideo(context.Background(), provider.GenerationRequest{
		Prompt: "a cat __test_submit_unavailable",
	})
	if err == nil {
		t.Fatal("expected error for __test_submit_unavailable")
	}
	if err != provider.ErrUpstreamUnavailable {
		t.Fatalf("expected ErrUpstreamUnavailable, got: %v", err)
	}
}

// ── Poll-phase sandbox keywords ──

func testPollKeyword(t *testing.T, keyword, expectCode, expectMsgFragment string) {
	t.Helper()
	p := NewMock()
	ctx := context.Background()
	id, err := p.GenerateVideo(ctx, provider.GenerationRequest{
		Prompt: "a cat " + keyword,
	})
	if err != nil {
		t.Fatalf("GenerateVideo should succeed for poll-phase keyword, got: %v", err)
	}
	// Immediately should be running.
	st, _ := p.GetJobStatus(ctx, id)
	if st.Status != "running" {
		t.Fatalf("expected running, got %s", st.Status)
	}
	// Wait for resolution.
	time.Sleep(4 * time.Second)
	st, _ = p.GetJobStatus(ctx, id)
	if st.Status != "failed" {
		t.Fatalf("expected failed for %s, got %s", keyword, st.Status)
	}
	if st.ErrorCode == nil || *st.ErrorCode != expectCode {
		t.Fatalf("expected error code %q, got %v", expectCode, st.ErrorCode)
	}
	if st.ErrorMessage == nil || !strings.Contains(*st.ErrorMessage, expectMsgFragment) {
		t.Fatalf("expected error message containing %q, got %v", expectMsgFragment, st.ErrorMessage)
	}
}

func TestMockPoll502(t *testing.T) {
	testPollKeyword(t, "__test_poll_502", "error-502", "unavailable")
}

func TestMockPollModeration(t *testing.T) {
	testPollKeyword(t, "__test_poll_moderation", "error-303", "content filter")
}

func TestMockPollTimeout(t *testing.T) {
	testPollKeyword(t, "__test_poll_timeout", "error-timeout", "timed out")
}

func TestMockPollFailed(t *testing.T) {
	testPollKeyword(t, "__test_poll_failed", "error-500", "failed")
}

func TestMockUnknownJob(t *testing.T) {
	p := NewMock()
	st, err := p.GetJobStatus(context.Background(), "nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	if st.Status != "failed" {
		t.Fatalf("expected failed, got %s", st.Status)
	}
	if st.ErrorCode == nil || *st.ErrorCode != "not_found" {
		t.Fatalf("expected not_found error code, got %v", st.ErrorCode)
	}
}
