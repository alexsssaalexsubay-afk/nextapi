package seedance

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sanidg/nextapi/backend/internal/provider"
)

// Capture the request body Ark receives so we can assert we didn't
// silently drop the fields the customer paid for.
func TestLiveProvider_GenerateVideo_SendsAllParamsToArk(t *testing.T) {
	var captured []byte
	var capturedPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		captured, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"task_abc"}`))
	}))
	defer srv.Close()

	t.Setenv("VOLC_API_KEY", "sk-test")
	t.Setenv("SEEDANCE_BASE_URL", srv.URL)
	t.Setenv("SEEDANCE_MODEL", "fallback-model-should-not-be-used")

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}

	img := "https://cdn.example.com/cat.jpg"
	trueP := true
	falseP := false
	var seed int64 = 42

	id, err := p.GenerateVideo(context.Background(), provider.GenerationRequest{
		Model:           "seedance-1.0-pro",
		Prompt:          "a cat playing piano",
		ImageURL:        &img,
		DurationSeconds: 5,
		Resolution:      "720p",
		Mode:            "normal",
		AspectRatio:     "16:9",
		FPS:             24,
		GenerateAudio:   &trueP,
		Watermark:       &falseP,
		Seed:            &seed,
		CameraFixed:     &falseP,
	})
	if err != nil {
		t.Fatalf("GenerateVideo: %v", err)
	}
	if id != "task_abc" {
		t.Fatalf("expected task_abc, got %q", id)
	}

	if capturedPath != "/contents/generations/tasks" {
		t.Errorf("wrong path: %s", capturedPath)
	}

	var got map[string]any
	if err := json.Unmarshal(captured, &got); err != nil {
		t.Fatalf("unmarshal captured body: %v", err)
	}

	// 1. Customer-selected model must win over the env fallback.
	if got["model"] != "doubao-seedance-1-0-pro-250528" {
		t.Errorf("model not resolved to Ark ID: %v", got["model"])
	}

	// 2. Every optional field the customer paid for must be on the wire.
	for k, want := range map[string]any{
		"ratio":          "16:9",
		"resolution":     "720p",
		"duration":       float64(5), // JSON numbers are float64 by default
		"fps":            float64(24),
		"generate_audio": true,
		"watermark":      false,
		"seed":           float64(42),
		"camerafixed":    false,
	} {
		if got[k] != want {
			t.Errorf("field %q: got %v, want %v", k, got[k], want)
		}
	}

	// 3. Content array must include text + image_url as an object (not string).
	content, ok := got["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("content shape wrong: %v", got["content"])
	}
	imgPart, _ := content[1].(map[string]any)
	imgObj, _ := imgPart["image_url"].(map[string]any)
	if imgObj == nil || imgObj["url"] != img {
		t.Errorf("image_url shape wrong: %v", imgPart)
	}
}

// Unset fields must be omitted, not forwarded as empty strings / zeros.
// Otherwise we'd silently override upstream defaults (e.g. force audio
// off for every customer who just didn't pass generate_audio).
func TestLiveProvider_GenerateVideo_OmitsUnsetFields(t *testing.T) {
	var captured []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, _ = io.ReadAll(r.Body)
		_, _ = w.Write([]byte(`{"id":"t"}`))
	}))
	defer srv.Close()

	t.Setenv("VOLC_API_KEY", "sk-test")
	t.Setenv("SEEDANCE_BASE_URL", srv.URL)

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	_, err = p.GenerateVideo(context.Background(), provider.GenerationRequest{
		Prompt: "hi",
	})
	if err != nil {
		t.Fatalf("GenerateVideo: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(captured, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	for _, k := range []string{"ratio", "resolution", "duration", "fps", "generate_audio", "watermark", "seed", "camerafixed"} {
		if _, present := got[k]; present {
			t.Errorf("field %q leaked into upstream body: %v", k, got[k])
		}
	}
}

func TestLiveProvider_GenerateVideo_Seedance20_UsesDreaminaEndpoint(t *testing.T) {
	var captured []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, _ = io.ReadAll(r.Body)
		_, _ = w.Write([]byte(`{"id":"t2"}`))
	}))
	defer srv.Close()

	t.Setenv("VOLC_API_KEY", "sk-test")
	t.Setenv("SEEDANCE_BASE_URL", srv.URL)
	t.Setenv("SEEDANCE_MODEL", "should-not-apply-when-model-set")

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	img := "https://cdn.example.com/x.png"
	_, err = p.GenerateVideo(context.Background(), provider.GenerationRequest{
		Model:  "seedance-2.0-fast",
		Prompt: "move",
		ImageURL: &img,
	})
	if err != nil {
		t.Fatalf("GenerateVideo: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(captured, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	want := "Dreamina-Seedance-2.0-fast-inference-video-in"
	if got["model"] != want {
		t.Fatalf("model: got %v, want %q", got["model"], want)
	}
}
