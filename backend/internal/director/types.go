package director

type CharacterInput struct {
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	AssetID         string   `json:"asset_id"`
	ReferenceImages []string `json:"reference_images,omitempty"`
}

type GenerateShotsInput struct {
	OrgID           string           `json:"-"`
	Engine          string           `json:"engine,omitempty"`
	Story           string           `json:"story"`
	Genre           string           `json:"genre"`
	Style           string           `json:"style"`
	ShotCount       int              `json:"shot_count"`
	DurationPerShot int              `json:"duration_per_shot"`
	Characters      []CharacterInput `json:"characters"`
	Scene           string           `json:"scene"`
	TextProviderID  string           `json:"text_provider_id"`
	ImageProviderID string           `json:"image_provider_id"`
}

const (
	EngineNextAPI           = "nextapi"
	EngineAdvancedRequested = "advanced"
	EngineAdvancedSidecar   = "advanced_sidecar"
	EngineAdvancedFallback  = "advanced_fallback"
)

type EngineStatus struct {
	RequestedEngine   string `json:"requested_engine"`
	EngineUsed        string `json:"engine_used"`
	FallbackUsed      bool   `json:"fallback_used"`
	FallbackEnabled   bool   `json:"fallback_enabled"`
	SidecarConfigured bool   `json:"sidecar_configured"`
	SidecarHealthy    bool   `json:"sidecar_healthy"`
	Reason            string `json:"reason,omitempty"`
}

type PromptEnhancement struct {
	Continuity      string   `json:"continuity,omitempty"`
	CameraPlan      string   `json:"camera_plan,omitempty"`
	SubjectLock     string   `json:"subject_lock,omitempty"`
	ReferencePolicy string   `json:"reference_policy,omitempty"`
	QualityTerms    []string `json:"quality_terms,omitempty"`
	AudioCue        string   `json:"audio_cue,omitempty"`
}

type Shot struct {
	ShotIndex             int                `json:"shotIndex"`
	Title                 string             `json:"title"`
	Duration              int                `json:"duration"`
	Scene                 string             `json:"scene"`
	Camera                string             `json:"camera"`
	Emotion               string             `json:"emotion"`
	Action                string             `json:"action"`
	VideoPrompt           string             `json:"videoPrompt"`
	ImagePrompt           string             `json:"imagePrompt"`
	NegativePrompt        string             `json:"negativePrompt"`
	PromptEnhancement     *PromptEnhancement `json:"promptEnhancement,omitempty"`
	ReferenceAssets       []string           `json:"referenceAssets"`
	ReferenceImageAssetID string             `json:"referenceImageAssetId,omitempty"`
	ReferenceImageURL     string             `json:"referenceImageUrl,omitempty"`
}

type Storyboard struct {
	Title        string        `json:"title"`
	Summary      string        `json:"summary"`
	Shots        []Shot        `json:"shots"`
	EngineUsed   string        `json:"engine_used,omitempty"`
	EngineStatus *EngineStatus `json:"engine_status,omitempty"`
}

type DirectorPlan struct {
	Title        string           `json:"title"`
	Summary      string           `json:"summary"`
	Characters   []CharacterInput `json:"characters"`
	Scenes       []DirectorScene  `json:"scenes"`
	Shots        []Shot           `json:"shots"`
	EngineUsed   string           `json:"engine_used,omitempty"`
	EngineStatus *EngineStatus    `json:"engine_status,omitempty"`
}

type DirectorScene struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

type GenerateShotImagesInput struct {
	OrgID           string `json:"-"`
	ImageProviderID string `json:"imageProviderId"`
	Style           string `json:"style"`
	Resolution      string `json:"resolution"`
	Shots           []Shot `json:"shots"`
}

type WorkflowOptions struct {
	Name          string           `json:"name"`
	Ratio         string           `json:"ratio"`
	Resolution    string           `json:"resolution"`
	GenerateAudio bool             `json:"generate_audio"`
	Model         string           `json:"model"`
	EnableMerge   bool             `json:"enable_merge"`
	MaxParallel   int              `json:"max_parallel"`
	Characters    []CharacterInput `json:"characters,omitempty"`
}
