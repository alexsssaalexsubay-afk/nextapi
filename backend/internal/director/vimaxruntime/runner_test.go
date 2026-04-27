package vimaxruntime

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/aiprovider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/director"
)

type fakePlannerText struct {
	response string
}

func (f *fakePlannerText) GenerateTextWithProvider(ctx context.Context, providerID string, messages []aiprovider.Message, options aiprovider.TextOptions) (aiprovider.TextResult, error) {
	return aiprovider.TextResult{Text: f.response}, nil
}

func TestRunnerSendsManagedCallbackAndToken(t *testing.T) {
	var got RunRequest
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Director-Sidecar-Token") != "sidecar-token" {
			t.Fatalf("missing sidecar token")
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		_ = json.NewEncoder(w).Encode(RunResponse{Storyboard: director.Storyboard{
			Title:   "Plan",
			Summary: "Summary",
			Shots: []director.Shot{{
				ShotIndex:       1,
				Title:           "Shot",
				Duration:        4,
				VideoPrompt:     "video",
				ImagePrompt:     "image",
				ReferenceAssets: []string{},
			}},
		}})
	}))
	defer ts.Close()

	runner := NewRunner(RunnerConfig{
		EndpointURL:     ts.URL,
		RuntimeToken:    "sidecar-token",
		CallbackBaseURL: "http://127.0.0.1:8080/v1/internal/director-runtime",
		CallbackToken:   "runtime-token",
		AllowFallback:   false,
	})
	out, err := runner.GenerateStoryboard(context.Background(), director.GenerateShotsInput{
		Engine:          "advanced",
		Story:           "story",
		ShotCount:       1,
		DurationPerShot: 4,
		TextProviderID:  "provider_text",
	}, director.PlannerDeps{})
	if err != nil {
		t.Fatalf("GenerateStoryboard: %v", err)
	}
	if out.Title != "Plan" {
		t.Fatalf("out.Title=%q", out.Title)
	}
	if got.Engine != SidecarProductName {
		t.Fatalf("got.Engine=%q", got.Engine)
	}
	if got.TextProviderID != "provider_text" {
		t.Fatalf("got.TextProviderID=%q", got.TextProviderID)
	}
	if got.Callback.BaseURL == "" || got.Callback.Token != "runtime-token" {
		t.Fatalf("callback not passed: %+v", got.Callback)
	}
	if !got.Policy.NoExternalKeys || got.Policy.ProductBrand != "NextAPI Director" {
		t.Fatalf("policy not enforced: %+v", got.Policy)
	}
	if out.EngineUsed != director.EngineAdvancedSidecar || out.EngineStatus == nil || out.EngineStatus.FallbackUsed {
		t.Fatalf("sidecar engine status not exposed: used=%q status=%+v", out.EngineUsed, out.EngineStatus)
	}
}

func TestRunnerMarksFallbackWhenSidecarMissing(t *testing.T) {
	text := &fakePlannerText{response: `{"title":"Plan","summary":"Summary","shots":[{"shotIndex":1,"title":"Shot","duration":4,"videoPrompt":"video","imagePrompt":"image","referenceAssets":[]}]}`}
	runner := NewRunner(RunnerConfig{AllowFallback: true})
	out, err := runner.GenerateStoryboard(context.Background(), director.GenerateShotsInput{
		Engine:          "advanced",
		Story:           "story",
		ShotCount:       1,
		DurationPerShot: 4,
	}, director.PlannerDeps{Text: text})
	if err != nil {
		t.Fatalf("GenerateStoryboard: %v", err)
	}
	if out.EngineUsed != director.EngineAdvancedFallback || out.EngineStatus == nil || !out.EngineStatus.FallbackUsed || out.EngineStatus.Reason != "sidecar_not_configured" {
		t.Fatalf("fallback engine status not exposed: used=%q status=%+v", out.EngineUsed, out.EngineStatus)
	}
}

func TestRuntimeStatusFailClosedWhenFallbackDisabled(t *testing.T) {
	runner := NewRunner(RunnerConfig{AllowFallback: false})
	status := runner.RuntimeStatus(context.Background())
	if status.FallbackUsed || status.FallbackEnabled {
		t.Fatalf("fallback should be disabled: %+v", status)
	}
	if status.EngineUsed != director.EngineAdvancedRequested || status.Reason != "sidecar_not_configured" {
		t.Fatalf("runtime should expose missing sidecar without pretending fallback ran: %+v", status)
	}
}
