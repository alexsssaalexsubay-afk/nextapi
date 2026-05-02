package gateway

import (
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

func TestValidateVideoParamsAllowsDefault1080p(t *testing.T) {
	t.Setenv("UPTOKEN_ALLOWED_RESOLUTIONS", "")
	if err := validateVideoParams("9:16", 0, 5, "1080p"); err != nil {
		t.Fatalf("expected default 1080p to pass: %v", err)
	}
}

func TestValidateVideoParamsUsesConfiguredResolutions(t *testing.T) {
	t.Setenv("UPTOKEN_ALLOWED_RESOLUTIONS", "480p,720p")
	if err := validateVideoParams("9:16", 0, 5, "1080p"); err == nil {
		t.Fatal("expected 1080p to be rejected when provider config does not allow it")
	}
	if err := validateVideoParams("9:16", 0, 5, "720p"); err != nil {
		t.Fatalf("expected configured 720p to pass: %v", err)
	}
}

func TestValidatePromptOrMediaInput_AllowsFirstFrameWithoutPrompt(t *testing.T) {
	firstFrame := "https://cdn.example.com/first.png"
	if err := validatePromptOrMediaInput(provider.GenerationRequest{FirstFrameURL: &firstFrame}); err != nil {
		t.Fatalf("expected first_frame_url to satisfy prompt-or-media validation: %v", err)
	}
}

func TestValidatePromptOrMediaInput_RejectsEmptyPromptWithoutVisualMedia(t *testing.T) {
	if err := validatePromptOrMediaInput(provider.GenerationRequest{}); err == nil {
		t.Fatal("expected empty request to be rejected")
	}
}

func TestNormalizeVideoInputAcceptsRatioAlias(t *testing.T) {
	input := videoInput{Ratio: "9:16"}
	if err := normalizeVideoInput(&input); err != nil {
		t.Fatalf("normalizeVideoInput: %v", err)
	}
	if input.AspectRatio != "9:16" {
		t.Fatalf("aspect_ratio = %q; want ratio alias", input.AspectRatio)
	}
}

func TestNormalizeVideoInputRejectsConflictingRatioAlias(t *testing.T) {
	input := videoInput{AspectRatio: "16:9", Ratio: "9:16"}
	if err := normalizeVideoInput(&input); err == nil {
		t.Fatal("expected conflicting ratio/aspect_ratio to be rejected")
	}
}

func TestNormalizeVideoInputMapsUpTokenContentArray(t *testing.T) {
	input := videoInput{
		Content: []videoContentPart{
			{Type: "text", Text: "  Character walks forward.  "},
			{
				Type:     "image_url",
				Role:     "first_frame",
				ImageURL: &videoContentMediaURL{URL: "https://cdn.example.com/first.png"},
			},
			{
				Type:     "image_url",
				Role:     "last_frame",
				ImageURL: &videoContentMediaURL{URL: "https://cdn.example.com/last.png"},
			},
			{
				Type:     "video_url",
				Role:     "reference_video",
				VideoURL: &videoContentMediaURL{URL: "https://cdn.example.com/motion.mp4"},
			},
			{
				Type:     "audio_url",
				Role:     "reference_audio",
				AudioURL: &videoContentMediaURL{URL: "https://cdn.example.com/voice.mp3"},
			},
		},
	}
	if err := normalizeVideoInput(&input); err != nil {
		t.Fatalf("normalizeVideoInput: %v", err)
	}
	if input.Prompt != "Character walks forward." {
		t.Fatalf("prompt = %q", input.Prompt)
	}
	if input.FirstFrameURL == nil || *input.FirstFrameURL != "https://cdn.example.com/first.png" {
		t.Fatalf("first_frame_url = %v", input.FirstFrameURL)
	}
	if input.LastFrameURL == nil || *input.LastFrameURL != "https://cdn.example.com/last.png" {
		t.Fatalf("last_frame_url = %v", input.LastFrameURL)
	}
	if len(input.VideoURLs) != 1 || input.VideoURLs[0] != "https://cdn.example.com/motion.mp4" {
		t.Fatalf("video_urls = %#v", input.VideoURLs)
	}
	if len(input.AudioURLs) != 1 || input.AudioURLs[0] != "https://cdn.example.com/voice.mp3" {
		t.Fatalf("audio_urls = %#v", input.AudioURLs)
	}
}

func TestNormalizeVideoInputRejectsContentMixedWithFlatFields(t *testing.T) {
	input := videoInput{
		Prompt: "flat prompt",
		Content: []videoContentPart{
			{Type: "text", Text: "content prompt"},
		},
	}
	if err := normalizeVideoInput(&input); err == nil {
		t.Fatal("expected content[] plus flat prompt to be rejected")
	}
}

func TestNormalizeGenerateReqAcceptsReferenceImageContent(t *testing.T) {
	req := generateReq{
		Content: []videoContentPart{
			{
				Type:     "image_url",
				Role:     "reference_image",
				ImageURL: &videoContentMediaURL{URL: "asset://ut-asset-person"},
			},
		},
	}
	if err := normalizeGenerateReq(&req); err != nil {
		t.Fatalf("normalizeGenerateReq: %v", err)
	}
	if len(req.ImageURLs) != 1 || req.ImageURLs[0] != "asset://ut-asset-person" {
		t.Fatalf("image_urls = %#v", req.ImageURLs)
	}
}
