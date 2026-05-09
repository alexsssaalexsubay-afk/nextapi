package workflow

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestWorkflowToExistingVideoPayload(t *testing.T) {
	seed := int64(123)
	raw := mustJSON(t, Definition{
		Model: "seedance-2.0-fast",
		Nodes: []Node{
			node(t, "img-character", NodeImageInput, ImageInputData{
				ImageURL:  "https://cdn.nextapi.top/character.png",
				ImageType: "character",
			}),
			node(t, "img-scene", NodeImageInput, ImageInputData{
				ImageURL:  "https://cdn.nextapi.top/scene.png",
				ImageType: "scene",
			}),
			node(t, "prompt", NodePromptInput, PromptInputData{
				Prompt: "A cinematic character continuity shot",
			}),
			node(t, "params", NodeVideoParams, VideoParamsData{
				Duration:    6,
				AspectRatio: "9:16",
				Resolution:  "720p",
				Seed:        &seed,
			}),
			node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
			node(t, "preview", NodeOutputPreview, map[string]string{}),
		},
		Edges: []Edge{
			{Source: "img-character", Target: "video"},
			{Source: "img-scene", Target: "video"},
			{Source: "prompt", Target: "video"},
			{Source: "params", Target: "video"},
			{Source: "video", Target: "preview"},
		},
	})

	payload, req, inputJSON, err := WorkflowToExistingVideoPayload(raw)
	if err != nil {
		t.Fatalf("WorkflowToExistingVideoPayload returned error: %v", err)
	}

	if payload.Model != "seedance-2.0-fast" {
		t.Fatalf("model = %q; want seedance-2.0-fast", payload.Model)
	}
	if payload.Input.Prompt != "A cinematic character continuity shot" {
		t.Fatalf("prompt = %q", payload.Input.Prompt)
	}
	if payload.Input.DurationSeconds != 6 {
		t.Fatalf("duration_seconds = %d; want 6", payload.Input.DurationSeconds)
	}
	if payload.Input.Resolution != "720p" {
		t.Fatalf("resolution = %q; want 720p", payload.Input.Resolution)
	}
	if payload.Input.AspectRatio != "9:16" {
		t.Fatalf("aspect_ratio = %q; want 9:16", payload.Input.AspectRatio)
	}
	if payload.Input.FirstFrameURL != nil {
		t.Fatalf("first_frame_url = %v; want nil when multiple references are connected", payload.Input.FirstFrameURL)
	}
	if len(payload.Input.ImageURLs) != 2 ||
		payload.Input.ImageURLs[0] != "https://cdn.nextapi.top/character.png" ||
		payload.Input.ImageURLs[1] != "https://cdn.nextapi.top/scene.png" {
		t.Fatalf("image_urls = %#v", payload.Input.ImageURLs)
	}
	if req.FirstFrameURL != nil {
		t.Fatalf("request first frame = %v; want nil", req.FirstFrameURL)
	}
	if req.Seed == nil || *req.Seed != seed {
		t.Fatalf("request seed = %v", req.Seed)
	}
	if !json.Valid(inputJSON) {
		t.Fatalf("inputJSON is not valid JSON: %s", inputJSON)
	}
}

func TestWorkflowToExistingVideoPayload_Validation(t *testing.T) {
	tests := []struct {
		name string
		def  Definition
	}{
		{
			name: "missing seedance node",
			def:  Definition{Nodes: []Node{node(t, "prompt", NodePromptInput, PromptInputData{Prompt: "x"})}},
		},
		{
			name: "missing prompt and visual media",
			def: Definition{
				Nodes: []Node{
					node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
				},
			},
		},
		{
			name: "blank prompt without visual media",
			def: Definition{
				Nodes: []Node{
					node(t, "prompt", NodePromptInput, PromptInputData{Prompt: "   "}),
					node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
				},
				Edges: []Edge{{Source: "prompt", Target: "video"}},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, _, err := WorkflowToExistingVideoPayload(mustJSON(t, tt.def))
			if !errors.Is(err, ErrInvalidWorkflow) {
				t.Fatalf("error = %v; want ErrInvalidWorkflow", err)
			}
		})
	}
}

func TestWorkflowToExistingVideoPayload_AllowsVisualMediaWithoutPromptNode(t *testing.T) {
	raw := mustJSON(t, Definition{
		Nodes: []Node{
			node(t, "img-character", NodeImageInput, ImageInputData{
				ImageURL:  "https://cdn.nextapi.top/character.png",
				ImageType: "character",
			}),
			node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
		},
		Edges: []Edge{{Source: "img-character", Target: "video"}},
	})

	payload, req, _, err := WorkflowToExistingVideoPayload(raw)
	if err != nil {
		t.Fatalf("WorkflowToExistingVideoPayload returned error: %v", err)
	}
	if payload.Input.Prompt != "" || req.Prompt != "" {
		t.Fatalf("expected empty prompt, got payload=%q req=%q", payload.Input.Prompt, req.Prompt)
	}
	if payload.Input.FirstFrameURL == nil || *payload.Input.FirstFrameURL != "https://cdn.nextapi.top/character.png" {
		t.Fatalf("first_frame_url = %v", payload.Input.FirstFrameURL)
	}
}

func TestWorkflowToExistingVideoPayload_SingleCharacterUsesFirstFrame(t *testing.T) {
	raw := mustJSON(t, Definition{
		Nodes: []Node{
			node(t, "img-character", NodeImageInput, ImageInputData{
				ImageURL:  "https://cdn.nextapi.top/character.png",
				ImageType: "character",
			}),
			node(t, "prompt", NodePromptInput, PromptInputData{Prompt: "A portrait video"}),
			node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
		},
		Edges: []Edge{
			{Source: "img-character", Target: "video"},
			{Source: "prompt", Target: "video"},
		},
	})

	payload, _, _, err := WorkflowToExistingVideoPayload(raw)
	if err != nil {
		t.Fatalf("WorkflowToExistingVideoPayload returned error: %v", err)
	}
	if payload.Input.FirstFrameURL == nil || *payload.Input.FirstFrameURL != "https://cdn.nextapi.top/character.png" {
		t.Fatalf("first_frame_url = %v", payload.Input.FirstFrameURL)
	}
	if len(payload.Input.ImageURLs) != 0 {
		t.Fatalf("image_urls = %#v; want none", payload.Input.ImageURLs)
	}
}

func TestWorkflowToExistingVideoPayload_FirstLastVideoAudioRefs(t *testing.T) {
	raw := mustJSON(t, Definition{
		Model: "seedance-2.0-pro",
		Nodes: []Node{
			node(t, "first", NodeImageInput, ImageInputData{
				ImageURL:  "https://cdn.nextapi.top/first.png",
				ImageType: "first_frame",
			}),
			node(t, "last", NodeImageInput, ImageInputData{
				ImageURL:  "https://cdn.nextapi.top/last.png",
				ImageType: "last_frame",
			}),
			node(t, "video-ref", NodeVideoInput, VideoInputData{
				VideoURL:  "https://cdn.nextapi.top/ref.mp4",
				VideoType: "reference",
			}),
			node(t, "audio-ref", NodeAudioInput, AudioInputData{
				AudioURL:  "https://cdn.nextapi.top/ref.wav",
				AudioType: "reference",
			}),
			node(t, "prompt", NodePromptInput, PromptInputData{Prompt: "A cinematic image-to-video shot"}),
			node(t, "params", NodeVideoParams, VideoParamsData{Duration: 5, Resolution: "720p", AspectRatio: "16:9"}),
			node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
		},
		Edges: []Edge{
			{Source: "first", Target: "video"},
			{Source: "last", Target: "video"},
			{Source: "video-ref", Target: "video"},
			{Source: "audio-ref", Target: "video"},
			{Source: "prompt", Target: "video"},
			{Source: "params", Target: "video"},
		},
	})

	payload, req, _, err := WorkflowToExistingVideoPayload(raw)
	if err != nil {
		t.Fatalf("WorkflowToExistingVideoPayload returned error: %v", err)
	}
	if payload.Input.FirstFrameURL == nil || *payload.Input.FirstFrameURL != "https://cdn.nextapi.top/first.png" {
		t.Fatalf("first_frame_url = %v", payload.Input.FirstFrameURL)
	}
	if payload.Input.LastFrameURL == nil || *payload.Input.LastFrameURL != "https://cdn.nextapi.top/last.png" {
		t.Fatalf("last_frame_url = %v", payload.Input.LastFrameURL)
	}
	if len(payload.Input.ImageURLs) != 0 {
		t.Fatalf("image_urls = %#v; want empty when first_frame_url is used", payload.Input.ImageURLs)
	}
	if len(payload.Input.VideoURLs) != 1 || payload.Input.VideoURLs[0] != "https://cdn.nextapi.top/ref.mp4" {
		t.Fatalf("video_urls = %#v", payload.Input.VideoURLs)
	}
	if len(payload.Input.AudioURLs) != 1 || payload.Input.AudioURLs[0] != "https://cdn.nextapi.top/ref.wav" {
		t.Fatalf("audio_urls = %#v", payload.Input.AudioURLs)
	}
	if req.LastFrameURL == nil || *req.LastFrameURL != "https://cdn.nextapi.top/last.png" || len(req.VideoURLs) != 1 || len(req.AudioURLs) != 1 {
		t.Fatalf("provider request missing media refs: %+v", req)
	}
}

func TestWorkflowToExistingVideoPayload_AllowsPromptOnly(t *testing.T) {
	raw := mustJSON(t, Definition{
		Nodes: []Node{
			node(t, "prompt", NodePromptInput, PromptInputData{Prompt: "A cinematic city shot"}),
			node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
		},
		Edges: []Edge{{Source: "prompt", Target: "video"}},
	})
	payload, req, _, err := WorkflowToExistingVideoPayload(raw)
	if err != nil {
		t.Fatalf("WorkflowToExistingVideoPayload: %v", err)
	}
	if payload.Input.FirstFrameURL != nil || len(payload.Input.ImageURLs) != 0 || len(req.ImageURLs) != 0 {
		t.Fatalf("expected prompt-only payload, got payload=%+v req=%+v", payload.Input, req)
	}
}

func TestWorkflowToGenerationRequests_MultipleVideos(t *testing.T) {
	raw := mustJSON(t, Definition{
		Nodes: []Node{
			node(t, "prompt-1", NodePromptInput, PromptInputData{Prompt: "shot one"}),
			node(t, "video-1", NodeSeedanceVideo, SeedanceVideoData{}),
			node(t, "prompt-2", NodePromptInput, PromptInputData{Prompt: "shot two"}),
			node(t, "video-2", NodeSeedanceVideo, SeedanceVideoData{}),
			node(t, "merge", NodeVideoMerge, map[string]string{"label": "merge"}),
		},
		Edges: []Edge{
			{Source: "prompt-1", Target: "video-1"},
			{Source: "prompt-2", Target: "video-2"},
			{Source: "video-1", Target: "merge"},
			{Source: "video-2", Target: "merge"},
		},
	})
	payloads, requests, _, err := WorkflowToGenerationRequests(raw)
	if err != nil {
		t.Fatalf("WorkflowToGenerationRequests: %v", err)
	}
	if len(payloads) != 2 || len(requests) != 2 {
		t.Fatalf("got payloads=%d requests=%d, want 2 each", len(payloads), len(requests))
	}
}

func node(t *testing.T, id string, typ string, data interface{}) Node {
	t.Helper()
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("marshal node data: %v", err)
	}
	return Node{ID: id, Type: typ, Data: raw}
}

func mustJSON(t *testing.T, v interface{}) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal JSON: %v", err)
	}
	return raw
}
