package director

type CharacterInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	AssetID     string `json:"asset_id"`
}

type GenerateShotsInput struct {
	OrgID           string           `json:"-"`
	Story           string           `json:"story"`
	Genre           string           `json:"genre"`
	Style           string           `json:"style"`
	ShotCount       int              `json:"shot_count"`
	DurationPerShot int              `json:"duration_per_shot"`
	Characters      []CharacterInput `json:"characters"`
	Scene           string           `json:"scene"`
	TextProviderID  string           `json:"text_provider_id"`
}

type Shot struct {
	ShotIndex             int      `json:"shotIndex"`
	Title                 string   `json:"title"`
	Duration              int      `json:"duration"`
	Scene                 string   `json:"scene"`
	Camera                string   `json:"camera"`
	Emotion               string   `json:"emotion"`
	Action                string   `json:"action"`
	VideoPrompt           string   `json:"videoPrompt"`
	ImagePrompt           string   `json:"imagePrompt"`
	NegativePrompt        string   `json:"negativePrompt"`
	ReferenceAssets       []string `json:"referenceAssets"`
	ReferenceImageAssetID string   `json:"referenceImageAssetId,omitempty"`
	ReferenceImageURL     string   `json:"referenceImageUrl,omitempty"`
}

type Storyboard struct {
	Title   string `json:"title"`
	Summary string `json:"summary"`
	Shots   []Shot `json:"shots"`
}

type DirectorPlan struct {
	Title      string           `json:"title"`
	Summary    string           `json:"summary"`
	Characters []CharacterInput `json:"characters"`
	Scenes     []DirectorScene  `json:"scenes"`
	Shots      []Shot           `json:"shots"`
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
	Name          string `json:"name"`
	Ratio         string `json:"ratio"`
	Resolution    string `json:"resolution"`
	GenerateAudio bool   `json:"generate_audio"`
	Model         string `json:"model"`
	EnableMerge   bool   `json:"enable_merge"`
}
