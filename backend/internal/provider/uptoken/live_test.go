package uptoken

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

// UpToken's documented POST body uses `content[]` + top-level `ratio`,
// `resolution`, `duration`, `generate_audio`, `seed`. Make sure all
// customer-paid fields actually hit the wire (regression: if any of these
// get silently dropped the customer gets a cheap / default generation).
func TestLiveProvider_GenerateVideo_SendsAllParamsToUpstream(t *testing.T) {
	var (
		captured     []byte
		capturedPath string
		authHeader   string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		authHeader = r.Header.Get("Authorization")
		captured, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"ut-task-123"}`))
	}))
	defer srv.Close()

	t.Setenv("UPTOKEN_API_KEY", "ut-test")
	t.Setenv("UPTOKEN_BASE_URL", srv.URL)
	t.Setenv("UPTOKEN_MODEL", "fallback-should-not-be-used")

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}

	img := "https://cdn.example.com/cat.jpg"
	trueP := true
	var seed int64 = 42
	id, err := p.GenerateVideo(context.Background(), provider.GenerationRequest{
		Model:           "seedance-2.0-pro",
		Prompt:          "a cat playing piano",
		ImageURL:        &img,
		DurationSeconds: 5,
		Resolution:      "720p",
		AspectRatio:     "16:9",
		GenerateAudio:   &trueP,
		Seed:            &seed,
	})
	if err != nil {
		t.Fatalf("GenerateVideo: %v", err)
	}
	if id != "ut-task-123" {
		t.Fatalf("expected ut-task-123, got %q", id)
	}
	if capturedPath != "/video/generations" {
		t.Errorf("wrong path: %s", capturedPath)
	}
	if authHeader != "Bearer ut-test" {
		t.Errorf("wrong Authorization: %q", authHeader)
	}

	var got map[string]any
	if err := json.Unmarshal(captured, &got); err != nil {
		t.Fatalf("unmarshal captured body: %v", err)
	}

	if got["model"] != uptokenSeedance20Pro {
		t.Errorf("model not mapped: got %v want %q", got["model"], uptokenSeedance20Pro)
	}
	if _, mixed := got["prompt"]; mixed {
		t.Fatalf("content[] request must not also include flat prompt: %v", got)
	}

	for k, want := range map[string]any{
		"ratio":          "16:9",
		"resolution":     "720p",
		"duration":       float64(5),
		"generate_audio": true,
		"seed":           float64(42),
	} {
		if got[k] != want {
			t.Errorf("field %q: got %v, want %v", k, got[k], want)
		}
	}

	// content[] must be text + image_url with role=reference_image.
	content, ok := got["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("content shape wrong: %v", got["content"])
	}
	imgPart, _ := content[1].(map[string]any)
	if imgPart["role"] != "reference_image" {
		t.Errorf("image role wrong: %v", imgPart["role"])
	}
	imgObj, _ := imgPart["image_url"].(map[string]any)
	if imgObj == nil || imgObj["url"] != img {
		t.Errorf("image_url shape wrong: %v", imgPart)
	}
}

func TestLiveProvider_GenerateVideo_SendsRichContentArrayWithoutPrompt(t *testing.T) {
	var captured []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, _ = io.ReadAll(r.Body)
		_, _ = w.Write([]byte(`{"id":"ut-flat"}`))
	}))
	defer srv.Close()

	t.Setenv("UPTOKEN_API_KEY", "ut-test")
	t.Setenv("UPTOKEN_BASE_URL", srv.URL)

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	videoURL := "https://cdn.example.com/ref.mp4"
	audioURL := "https://cdn.example.com/ref.mp3"
	_, err = p.GenerateVideo(context.Background(), provider.GenerationRequest{
		ImageURLs:       []string{"https://cdn.example.com/ref.png"},
		VideoURLs:       []string{videoURL},
		AudioURLs:       []string{audioURL},
		DurationSeconds: 5,
		Resolution:      "1080p",
	})
	if err != nil {
		t.Fatalf("GenerateVideo: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(captured, &got); err != nil {
		t.Fatalf("unmarshal captured body: %v", err)
	}
	if _, mixed := got["prompt"]; mixed {
		t.Fatalf("content[] request must not also include flat prompt: %v", got)
	}
	content, ok := got["content"].([]any)
	if !ok || len(content) != 3 {
		t.Fatalf("content shape wrong: %v", got["content"])
	}
	partsByRole := map[string]map[string]any{}
	for _, raw := range content {
		part, _ := raw.(map[string]any)
		role, _ := part["role"].(string)
		partsByRole[role] = part
	}
	if imgPart := partsByRole["reference_image"]; imgPart == nil {
		t.Fatalf("missing reference_image part: %v", content)
	} else if imgObj, _ := imgPart["image_url"].(map[string]any); imgObj == nil || imgObj["url"] != "https://cdn.example.com/ref.png" {
		t.Fatalf("reference image shape wrong: %v", imgPart)
	}
	if videoPart := partsByRole["reference_video"]; videoPart == nil {
		t.Fatalf("missing reference_video part: %v", content)
	} else if videoObj, _ := videoPart["video_url"].(map[string]any); videoObj == nil || videoObj["url"] != videoURL {
		t.Fatalf("reference video shape wrong: %v", videoPart)
	}
	if audioPart := partsByRole["reference_audio"]; audioPart == nil {
		t.Fatalf("missing reference_audio part: %v", content)
	} else if audioObj, _ := audioPart["audio_url"].(map[string]any); audioObj == nil || audioObj["url"] != audioURL {
		t.Fatalf("reference audio shape wrong: %v", audioPart)
	}
}

func TestLiveProvider_GenerateVideo_SendsFirstAndLastFrameRoles(t *testing.T) {
	var captured []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, _ = io.ReadAll(r.Body)
		_, _ = w.Write([]byte(`{"id":"ut-frames"}`))
	}))
	defer srv.Close()

	t.Setenv("UPTOKEN_API_KEY", "ut-test")
	t.Setenv("UPTOKEN_BASE_URL", srv.URL)

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	firstFrame := "https://cdn.example.com/first.png"
	lastFrame := "https://cdn.example.com/last.png"
	_, err = p.GenerateVideo(context.Background(), provider.GenerationRequest{
		FirstFrameURL:   &firstFrame,
		LastFrameURL:    &lastFrame,
		DurationSeconds: 5,
		Resolution:      "720p",
	})
	if err != nil {
		t.Fatalf("GenerateVideo: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(captured, &got); err != nil {
		t.Fatalf("unmarshal captured body: %v", err)
	}
	content, ok := got["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("content shape wrong: %v", got["content"])
	}
	firstPart, _ := content[0].(map[string]any)
	lastPart, _ := content[1].(map[string]any)
	if firstPart["role"] != "first_frame" {
		t.Fatalf("first frame role wrong: %v", firstPart)
	}
	if lastPart["role"] != "last_frame" {
		t.Fatalf("last frame role wrong: %v", lastPart)
	}
}

// Unset fields must be omitted entirely so we don't override upstream
// defaults (e.g. silently force generate_audio=false for every customer).
func TestLiveProvider_GenerateVideo_OmitsUnsetFields(t *testing.T) {
	var captured []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, _ = io.ReadAll(r.Body)
		_, _ = w.Write([]byte(`{"id":"ut-x"}`))
	}))
	defer srv.Close()

	t.Setenv("UPTOKEN_API_KEY", "ut-test")
	t.Setenv("UPTOKEN_BASE_URL", srv.URL)

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	_, err = p.GenerateVideo(context.Background(), provider.GenerationRequest{Prompt: "hi"})
	if err != nil {
		t.Fatalf("GenerateVideo: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(captured, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	for _, k := range []string{"ratio", "resolution", "duration", "generate_audio", "seed"} {
		if _, present := got[k]; present {
			t.Errorf("field %q leaked into upstream body: %v", k, got[k])
		}
	}
}

func TestLiveProvider_GenerateVideo_DoesNotApplyLegacyPromptCharacterLimit(t *testing.T) {
	var captured []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, _ = io.ReadAll(r.Body)
		_, _ = w.Write([]byte(`{"id":"ut-long-prompt"}`))
	}))
	defer srv.Close()

	t.Setenv("UPTOKEN_API_KEY", "ut-test")
	t.Setenv("UPTOKEN_BASE_URL", srv.URL)

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	prompt := strings.Repeat("cinematic camera movement ", 160)
	if len(prompt) <= 2000 {
		t.Fatalf("test prompt must exceed legacy 2000-character cap, got %d", len(prompt))
	}
	id, err := p.GenerateVideo(context.Background(), provider.GenerationRequest{Prompt: prompt})
	if err != nil {
		t.Fatalf("GenerateVideo should not enforce a local legacy prompt character cap: %v", err)
	}
	if id != "ut-long-prompt" {
		t.Fatalf("id = %q; want ut-long-prompt", id)
	}

	var got map[string]any
	if err := json.Unmarshal(captured, &got); err != nil {
		t.Fatalf("unmarshal captured body: %v", err)
	}
	content, ok := got["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("content shape wrong: %v", got["content"])
	}
	textPart, _ := content[0].(map[string]any)
	if textPart["text"] != strings.TrimSpace(prompt) {
		t.Fatalf("prompt text not forwarded intact")
	}
}

// UpToken's status response nests video_url under content and tokens under
// usage; mis-decoding any of these breaks billing reconciliation and
// customer download links at the same time.
func TestLiveProvider_GetJobStatus_SucceededShape(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{
			"id": "ut-task-123",
			"status": "succeeded",
			"content": {"video_url": "https://cdn.example.com/out.mp4"},
			"usage": {"total_tokens": 97605}
		}`))
	}))
	defer srv.Close()

	t.Setenv("UPTOKEN_API_KEY", "ut-test")
	t.Setenv("UPTOKEN_BASE_URL", srv.URL)

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	st, err := p.GetJobStatus(context.Background(), "ut-task-123")
	if err != nil {
		t.Fatalf("GetJobStatus: %v", err)
	}
	if st.Status != "succeeded" {
		t.Errorf("status: %v", st.Status)
	}
	if st.VideoURL == nil || *st.VideoURL != "https://cdn.example.com/out.mp4" {
		t.Errorf("video_url: %+v", st.VideoURL)
	}
	if st.ActualTokensUsed == nil || *st.ActualTokensUsed != 97605 {
		t.Errorf("total_tokens: %+v", st.ActualTokensUsed)
	}
}

func TestLiveProvider_GetJobStatus_FailedShape(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{
			"id": "ut-task-failed",
			"status": "failed",
			"error": {"code":"error-301","message":"moderation blocked","type":"content_policy"}
		}`))
	}))
	defer srv.Close()

	t.Setenv("UPTOKEN_API_KEY", "ut-test")
	t.Setenv("UPTOKEN_BASE_URL", srv.URL)

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	st, err := p.GetJobStatus(context.Background(), "ut-task-failed")
	if err != nil {
		t.Fatalf("GetJobStatus: %v", err)
	}
	if st.Status != "failed" {
		t.Fatalf("status: got %q", st.Status)
	}
	if st.ErrorCode == nil || *st.ErrorCode != "error-301" {
		t.Fatalf("error code: %+v", st.ErrorCode)
	}
}

// error-2xx/3xx/4xx come back as HTTP 4xx with {error:{code,message,type}}.
// We should surface error.code + message without a retry — otherwise we'd
// replay doomed requests three times and pile up spend reservations.
func TestLiveProvider_GenerateVideo_Failure_DoesNotRetry(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"code":"error-205","message":"Invalid resolution","type":"invalid_request"}}`))
	}))
	defer srv.Close()

	t.Setenv("UPTOKEN_API_KEY", "ut-test")
	t.Setenv("UPTOKEN_BASE_URL", srv.URL)

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	_, err = p.GenerateVideo(context.Background(), provider.GenerationRequest{Prompt: "x", Resolution: "1080p"})
	if err == nil {
		t.Fatal("expected error")
	}
	var upstreamErr *provider.UpstreamError
	if !errors.As(err, &upstreamErr) || upstreamErr.Code != "error-205" {
		t.Fatalf("expected UpstreamError error-205, got %T %v", err, err)
	}
	if hits != 1 {
		t.Errorf("expected exactly 1 upstream hit, got %d", hits)
	}
}

func TestLiveProvider_GenerateVideo_RetryableBodyErrorRetries(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		if hits == 1 {
			_, _ = w.Write([]byte(`{"error":{"code":"error-603","message":"provider overloaded","type":"provider_error"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":"ut-after-retry"}`))
	}))
	defer srv.Close()

	t.Setenv("UPTOKEN_API_KEY", "ut-test")
	t.Setenv("UPTOKEN_BASE_URL", srv.URL)

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	id, err := p.GenerateVideo(context.Background(), provider.GenerationRequest{Prompt: "x", Resolution: "1080p"})
	if err != nil {
		t.Fatalf("GenerateVideo should retry body error: %v", err)
	}
	if id != "ut-after-retry" {
		t.Fatalf("id = %q; want ut-after-retry", id)
	}
	if hits != 2 {
		t.Fatalf("hits = %d; want 2", hits)
	}
}

func TestLiveProvider_GenerateVideo_DuplicatePromptCooldownDoesNotRetry(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":{"code":"error-503","message":"Same prompt submitted too many times in a short period. Please wait before retrying.","type":"provider_error"}}`))
	}))
	defer srv.Close()

	t.Setenv("UPTOKEN_API_KEY", "ut-test")
	t.Setenv("UPTOKEN_BASE_URL", srv.URL)

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	_, err = p.GenerateVideo(context.Background(), provider.GenerationRequest{Prompt: "x", Resolution: "720p"})
	if err == nil {
		t.Fatal("expected duplicate prompt cooldown error")
	}
	var upstreamErr *provider.UpstreamError
	if !errors.As(err, &upstreamErr) || upstreamErr.Code != "error-503" || upstreamErr.Retryable {
		t.Fatalf("expected non-retryable error-503, got %T %v", err, err)
	}
	if hits != 1 {
		t.Fatalf("duplicate prompt cooldown should fail fast, hits=%d", hits)
	}
}

func TestLiveProvider_ResolutionFollowsProviderConfig(t *testing.T) {
	t.Setenv("UPTOKEN_API_KEY", "ut-test")
	t.Setenv("UPTOKEN_ALLOWED_RESOLUTIONS", "480p,720p")

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	_, _, err = p.EstimateCost(provider.GenerationRequest{Prompt: "x", Resolution: "1080p"})
	if err == nil {
		t.Fatal("expected 1080p to be rejected by provider config")
	}
	var upstreamErr *provider.UpstreamError
	if !errors.As(err, &upstreamErr) || upstreamErr.Code != "error-205" {
		t.Fatalf("expected error-205, got %T %v", err, err)
	}
}

func TestLiveProvider_EstimateCost_AllowsVisualMediaWithoutPrompt(t *testing.T) {
	t.Setenv("UPTOKEN_API_KEY", "ut-test")

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	firstFrame := "https://cdn.example.com/first.png"
	if _, _, err := p.EstimateCost(provider.GenerationRequest{
		FirstFrameURL:   &firstFrame,
		DurationSeconds: 5,
		Resolution:      "720p",
	}); err != nil {
		t.Fatalf("EstimateCost should allow visual-only request: %v", err)
	}
}

func TestLiveProvider_EstimateCost_RejectsEmptyPromptWithoutVisualMedia(t *testing.T) {
	t.Setenv("UPTOKEN_API_KEY", "ut-test")

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	_, _, err = p.EstimateCost(provider.GenerationRequest{DurationSeconds: 5, Resolution: "720p"})
	if err == nil {
		t.Fatal("expected empty request to be rejected")
	}
	var upstreamErr *provider.UpstreamError
	if !errors.As(err, &upstreamErr) || upstreamErr.Code != "error-202" {
		t.Fatalf("expected UpstreamError error-202, got %T %v", err, err)
	}
}

func TestLiveProvider_MediaURLMustBeHTTPS(t *testing.T) {
	t.Setenv("UPTOKEN_API_KEY", "ut-test")

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	u := "http://cdn.example.com/ref.png"
	_, _, err = p.EstimateCost(provider.GenerationRequest{Prompt: "x", ImageURL: &u})
	if err == nil {
		t.Fatal("expected http media url to be rejected")
	}
	var upstreamErr *provider.UpstreamError
	if !errors.As(err, &upstreamErr) || upstreamErr.Code != "error-401" {
		t.Fatalf("expected error-401, got %T %v", err, err)
	}
}

func TestLiveProvider_GetJobStatus_HTTP502Retryable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":{"code":"error-603","message":"upstream unavailable","type":"provider_error"}}`))
	}))
	defer srv.Close()

	t.Setenv("UPTOKEN_API_KEY", "ut-test")
	t.Setenv("UPTOKEN_BASE_URL", srv.URL)

	p, err := NewLive()
	if err != nil {
		t.Fatalf("NewLive: %v", err)
	}
	_, err = p.GetJobStatus(context.Background(), "ut-task")
	if err == nil {
		t.Fatal("expected retryable provider error")
	}
	var upstreamErr *provider.UpstreamError
	if !errors.As(err, &upstreamErr) || upstreamErr.Code != "error-603" || !upstreamErr.Retryable {
		t.Fatalf("expected retryable error-603, got %T %v", err, err)
	}
}

func TestLiveProvider_GetJobStatus_SandboxFailedCodes(t *testing.T) {
	cases := []struct {
		name string
		code string
	}{
		{"poll moderation", "error-301"},
		{"poll timeout", "error-702"},
		{"poll failed", "error-701"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(`{"status":"failed","error":{"code":"` + tc.code + `","message":"sandbox failure","type":"mock"}}`))
			}))
			defer srv.Close()

			t.Setenv("UPTOKEN_API_KEY", "ut-test")
			t.Setenv("UPTOKEN_BASE_URL", srv.URL)

			p, err := NewLive()
			if err != nil {
				t.Fatalf("NewLive: %v", err)
			}
			st, err := p.GetJobStatus(context.Background(), "ut-task")
			if err != nil {
				t.Fatalf("GetJobStatus: %v", err)
			}
			if st.Status != "failed" || st.ErrorCode == nil || *st.ErrorCode != tc.code {
				t.Fatalf("failed status decode mismatch: %+v", st)
			}
		})
	}
}

func TestResolveUpstreamModel(t *testing.T) {
	cases := []struct {
		name   string
		public string
		want   string
	}{
		{"empty falls back", "", "fallback-model"},
		{"seedance-2.0 maps to pro", "seedance-2.0", uptokenSeedance20Pro},
		{"seedance-2.0-pro maps to pro", "seedance-2.0-pro", uptokenSeedance20Pro},
		{"seedance-2.0-fast passes through as fast", "seedance-2.0-fast", uptokenSeedance20Fast},
		{"unknown id passes through verbatim", "my-experimental-v99", "my-experimental-v99"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ResolveUpstreamModel(provider.GenerationRequest{Model: tc.public}, "fallback-model")
			if got != tc.want {
				t.Errorf("got %q want %q", got, tc.want)
			}
		})
	}
}
