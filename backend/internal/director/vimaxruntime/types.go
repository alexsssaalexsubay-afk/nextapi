package vimaxruntime

import "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/director"

const (
	EngineName         = PublicEngineName
	PublicEngineName   = "advanced"
	SidecarProductName = "nextapi-director"
)

type RunnerConfig struct {
	EndpointURL     string
	RuntimeToken    string
	CallbackBaseURL string
	CallbackToken   string
	AllowFallback   bool
}

type RunRequest struct {
	Engine          string                    `json:"engine"`
	Story           string                    `json:"story"`
	Genre           string                    `json:"genre,omitempty"`
	Style           string                    `json:"style,omitempty"`
	Scene           string                    `json:"scene,omitempty"`
	ShotCount       int                       `json:"shot_count"`
	DurationPerShot int                       `json:"duration_per_shot"`
	Characters      []director.CharacterInput `json:"characters,omitempty"`
	TextProviderID  string                    `json:"text_provider_id,omitempty"`
	ImageProviderID string                    `json:"image_provider_id,omitempty"`
	Callback        CallbackConfig            `json:"callback"`
	Policy          ProviderPolicy            `json:"policy"`
}

type CallbackConfig struct {
	BaseURL       string `json:"base_url"`
	Token         string `json:"token"`
	TextEndpoint  string `json:"text_endpoint"`
	ImageEndpoint string `json:"image_endpoint"`
}

type ProviderPolicy struct {
	NoExternalKeys       bool     `json:"no_external_keys"`
	AllowedModelExits    []string `json:"allowed_model_exits"`
	StorageMode          string   `json:"storage_mode"`
	TaskStatusMode       string   `json:"task_status_mode"`
	BillingMode          string   `json:"billing_mode"`
	ProductBrand         string   `json:"product_brand"`
	DoNotExposeUpstream  bool     `json:"do_not_expose_upstream"`
	WorkflowOutputSchema string   `json:"workflow_output_schema"`
}

type RunResponse struct {
	Storyboard director.Storyboard `json:"storyboard"`
	Audit      AuditReport         `json:"audit,omitempty"`
}

type AuditReport struct {
	Source              string   `json:"source"`
	ReusableModules     []string `json:"reusable_modules"`
	ReplacedModelExits  []string `json:"replaced_model_exits"`
	BlockedDirectKeys   []string `json:"blocked_direct_keys"`
	WorkflowDestination string   `json:"workflow_destination"`
}
