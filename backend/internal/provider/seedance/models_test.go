package seedance

import (
	"sync"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

func TestResolveArkModel_KnownPublicID(t *testing.T) {
	got := ResolveArkModel(provider.GenerationRequest{Model: "seedance-1.0-pro"}, "fallback-should-not-be-used")
	want := "doubao-seedance-1-0-pro-250528"
	if got != want {
		t.Fatalf("seedance-1.0-pro: got %q, want %q", got, want)
	}
}

func TestResolveArkModel_PassthroughForUnknownPublicID(t *testing.T) {
	got := ResolveArkModel(provider.GenerationRequest{Model: "doubao-seedance-some-new-preview-260101"}, "fallback")
	if got != "doubao-seedance-some-new-preview-260101" {
		t.Fatalf("expected passthrough, got %q", got)
	}
}

func TestResolveArkModel_EmptyUsesFallback(t *testing.T) {
	got := ResolveArkModel(provider.GenerationRequest{}, "doubao-seedance-1-5-pro-251215")
	if got != "doubao-seedance-1-5-pro-251215" {
		t.Fatalf("empty model should use fallback, got %q", got)
	}
}

func TestResolveArkModel_Seedance20_DreaminaFourWay(t *testing.T) {
	img := "https://cdn.example.com/a.jpg"
	cases := []struct {
		name   string
		req    provider.GenerationRequest
		wantID string
	}{
		{
			"2.0 text",
			provider.GenerationRequest{Model: "seedance-2.0", Prompt: "hi"},
			"Dreamina-Seedance-2.0-inference-non-video-in",
		},
		{
			"2.0-pro text (alias)",
			provider.GenerationRequest{Model: "seedance-2.0-pro", Prompt: "hi"},
			"Dreamina-Seedance-2.0-inference-non-video-in",
		},
		{
			"2.0 image",
			provider.GenerationRequest{Model: "seedance-2.0", Prompt: "hi", ImageURL: &img},
			"Dreamina-Seedance-2.0-inference-video-in",
		},
		{
			"2.0-pro image (alias)",
			provider.GenerationRequest{Model: "seedance-2.0-pro", Prompt: "hi", ImageURL: &img},
			"Dreamina-Seedance-2.0-inference-video-in",
		},
		{
			"2.0-fast text",
			provider.GenerationRequest{Model: "seedance-2.0-fast", Prompt: "hi"},
			"Dreamina-Seedance-2.0-fast-inference-non-video-in",
		},
		{
			"2.0-fast image",
			provider.GenerationRequest{Model: "seedance-2.0-fast", Prompt: "hi", ImageURL: &img},
			"Dreamina-Seedance-2.0-fast-inference-video-in",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := ResolveArkModel(c.req, "fallback")
			if got != c.wantID {
				t.Fatalf("got %q, want %q", got, c.wantID)
			}
		})
	}
}

func TestResolveArkModel_EnvOverride(t *testing.T) {
	t.Setenv("SEEDANCE_MODEL_MAP", "seedance-1.0-pro:overridden-pro-id,seedance-custom:custom-ark-id")
	modelMapOnce = sync.Once{}
	modelMap = nil

	if got := ResolveArkModel(provider.GenerationRequest{Model: "seedance-1.0-pro"}, "fallback"); got != "overridden-pro-id" {
		t.Errorf("env override for seedance-1.0-pro failed: got %q", got)
	}
	if got := ResolveArkModel(provider.GenerationRequest{Model: "seedance-custom"}, "fallback"); got != "custom-ark-id" {
		t.Errorf("env-added entry failed: got %q", got)
	}
}
