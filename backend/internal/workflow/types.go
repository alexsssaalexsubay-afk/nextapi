package workflow

import "encoding/json"

const (
	NodeImageInput    = "image.input"
	NodeVideoInput    = "video.input"
	NodeAudioInput    = "audio.input"
	NodePromptInput   = "prompt.input"
	NodeVideoParams   = "video.params"
	NodeDirectorLLM   = "director.llm"
	NodeSeedanceVideo = "seedance.video"
	NodeVideoMerge    = "video.merge"
	NodeOutputPreview = "output.preview"
)

type Definition struct {
	ID       string          `json:"id,omitempty"`
	Name     string          `json:"name,omitempty"`
	Model    string          `json:"model,omitempty"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
	Nodes    []Node          `json:"nodes"`
	Edges    []Edge          `json:"edges"`
}

type Node struct {
	ID       string          `json:"id"`
	Type     string          `json:"type"`
	Data     json.RawMessage `json:"data"`
	Position json.RawMessage `json:"position,omitempty"`
}

type Edge struct {
	ID     string `json:"id,omitempty"`
	Source string `json:"source"`
	Target string `json:"target"`
}

type ImageInputData struct {
	AssetID       string `json:"asset_id,omitempty"`
	ImageURL      string `json:"image_url,omitempty"`
	ImageType     string `json:"image_type,omitempty"`
	CharacterName string `json:"character_name,omitempty"`
	Label         string `json:"label,omitempty"`
}

type VideoInputData struct {
	AssetID   string `json:"asset_id,omitempty"`
	VideoURL  string `json:"video_url,omitempty"`
	VideoType string `json:"video_type,omitempty"`
	Label     string `json:"label,omitempty"`
}

type AudioInputData struct {
	AssetID   string `json:"asset_id,omitempty"`
	AudioURL  string `json:"audio_url,omitempty"`
	AudioType string `json:"audio_type,omitempty"`
	Label     string `json:"label,omitempty"`
}

type PromptInputData struct {
	Prompt string `json:"prompt,omitempty"`
}

type VideoParamsData struct {
	Duration        int    `json:"duration,omitempty"`
	AspectRatio     string `json:"aspect_ratio,omitempty"`
	Resolution      string `json:"resolution,omitempty"`
	CameraMotion    string `json:"camera_motion,omitempty"`
	ConsistencyMode string `json:"consistency_mode,omitempty"`
	NegativePrompt  string `json:"negative_prompt,omitempty"`
	Seed            *int64 `json:"seed,omitempty"`
	FPS             int    `json:"fps,omitempty"`
	GenerateAudio   *bool  `json:"generate_audio,omitempty"`
	Draft           *bool  `json:"draft,omitempty"`
}

type SeedanceVideoData struct {
	Model string `json:"model,omitempty"`
}

type ExistingVideoPayload struct {
	Model string                 `json:"model"`
	Input ExistingVideoInputData `json:"input"`
}

type ExistingVideoInputData struct {
	Prompt          string   `json:"prompt"`
	DurationSeconds int      `json:"duration_seconds"`
	Resolution      string   `json:"resolution"`
	Mode            string   `json:"mode"`
	AspectRatio     string   `json:"aspect_ratio,omitempty"`
	FPS             int      `json:"fps,omitempty"`
	GenerateAudio   *bool    `json:"generate_audio,omitempty"`
	Draft           *bool    `json:"draft,omitempty"`
	Seed            *int64   `json:"seed,omitempty"`
	FirstFrameURL   *string  `json:"first_frame_url,omitempty"`
	LastFrameURL    *string  `json:"last_frame_url,omitempty"`
	ImageURLs       []string `json:"image_urls,omitempty"`
	VideoURLs       []string `json:"video_urls,omitempty"`
	AudioURLs       []string `json:"audio_urls,omitempty"`
}
