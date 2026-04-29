package aiprovider

import "encoding/json"

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type TextOptions struct {
	Model       string   `json:"model,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	MaxTokens   *int     `json:"max_tokens,omitempty"`
	JSONMode    bool     `json:"json_mode,omitempty"`
}

type TextResult struct {
	Text  string          `json:"text"`
	Raw   json.RawMessage `json:"raw,omitempty"`
	Usage json.RawMessage `json:"usage,omitempty"`
}

type ImageOptions struct {
	Model      string `json:"model,omitempty"`
	Resolution string `json:"resolution,omitempty"`
	Style      string `json:"style,omitempty"`
}

type ImageResult struct {
	ImageURL string          `json:"image_url"`
	Raw      json.RawMessage `json:"raw,omitempty"`
	Usage    json.RawMessage `json:"usage,omitempty"`
}

type ProviderInput struct {
	Name       string          `json:"name"`
	Type       string          `json:"type"`
	Provider   string          `json:"provider"`
	BaseURL    string          `json:"base_url"`
	APIKey     string          `json:"api_key"`
	Model      string          `json:"model"`
	Enabled    bool            `json:"enabled"`
	IsDefault  bool            `json:"is_default"`
	ConfigJSON json.RawMessage `json:"config_json"`
}

type ProviderConfig struct {
	APIStyle              string `json:"api_style,omitempty"`
	AnthropicVersion      string `json:"anthropic_version,omitempty"`
	DirectorRole          string `json:"director_role,omitempty"`
	TaskStatusMode        string `json:"task_status_mode,omitempty"`
	BillingMode           string `json:"billing_mode,omitempty"`
	ProviderKeysExposed   *bool  `json:"provider_keys_exposed,omitempty"`
	UpstreamExposed       *bool  `json:"upstream_exposed,omitempty"`
	MeterCentsPer1KTokens int64  `json:"meter_cents_per_1k_tokens,omitempty"`
	MeterCentsPerImage    int64  `json:"meter_cents_per_image,omitempty"`
}
