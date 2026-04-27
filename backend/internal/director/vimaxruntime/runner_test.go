package vimaxruntime

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/director"
)

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
}
