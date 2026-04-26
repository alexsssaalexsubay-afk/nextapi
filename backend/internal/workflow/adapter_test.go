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
			name: "missing prompt connection",
			def: Definition{
				Nodes: []Node{
					node(t, "image", NodeImageInput, ImageInputData{ImageURL: "https://cdn.nextapi.top/a.png"}),
					node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
				},
				Edges: []Edge{{Source: "image", Target: "video"}},
			},
		},
		{
			name: "missing image connection",
			def: Definition{
				Nodes: []Node{
					node(t, "prompt", NodePromptInput, PromptInputData{Prompt: "x"}),
					node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
				},
				Edges: []Edge{{Source: "prompt", Target: "video"}},
			},
		},
		{
			name: "blank prompt",
			def: Definition{
				Nodes: []Node{
					node(t, "prompt", NodePromptInput, PromptInputData{Prompt: "   "}),
					node(t, "image", NodeImageInput, ImageInputData{ImageURL: "https://cdn.nextapi.top/a.png"}),
					node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
				},
				Edges: []Edge{{Source: "prompt", Target: "video"}, {Source: "image", Target: "video"}},
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
