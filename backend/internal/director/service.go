package director

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/aiprovider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/workflow"
)

var (
	ErrInvalidInput          = errors.New("invalid_director_input")
	ErrInvalidStoryboard     = errors.New("invalid_storyboard")
	ErrPlannerUnavailable    = errors.New("director_planner_unavailable")
	ErrImageGenerationFailed = errors.New("director_image_generation_failed")
)

type TextGenerator interface {
	GenerateTextWithProvider(ctx context.Context, providerID string, messages []aiprovider.Message, options aiprovider.TextOptions) (aiprovider.TextResult, error)
}

type ImageGenerator interface {
	GenerateImageWithProvider(ctx context.Context, providerID string, prompt string, options aiprovider.ImageOptions) (aiprovider.ImageResult, error)
}

type Service struct {
	text    TextGenerator
	image   ImageGenerator
	planner StoryPlanner
}

func NewService(text TextGenerator) *Service {
	return &Service{text: text}
}

func (s *Service) SetImageGenerator(image ImageGenerator) { s.image = image }

type StoryPlanner interface {
	GenerateStoryboard(ctx context.Context, in GenerateShotsInput, deps PlannerDeps) (*Storyboard, error)
}

type RuntimeInspector interface {
	RuntimeStatus(ctx context.Context) EngineStatus
}

type PlannerDeps struct {
	Text  TextGenerator
	Image ImageGenerator
}

func (s *Service) SetStoryPlanner(planner StoryPlanner) { s.planner = planner }

func (s *Service) GenerateShots(ctx context.Context, in GenerateShotsInput) (*Storyboard, error) {
	normalized, err := normalizeInput(in)
	if err != nil {
		return nil, err
	}
	if normalized.Engine == "advanced" {
		if s.planner == nil {
			return nil, ErrPlannerUnavailable
		}
		out, err := s.planner.GenerateStoryboard(ctx, normalized, PlannerDeps{Text: s.text, Image: s.image})
		if err != nil {
			return nil, err
		}
		return applyEngineDefaults(out, normalized.Engine), nil
	}
	messages := []aiprovider.Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt(normalized)},
	}
	res, err := s.text.GenerateTextWithProvider(ctx, normalized.TextProviderID, messages, aiprovider.TextOptions{JSONMode: true})
	if err != nil {
		return nil, err
	}
	out, err := parseStoryboard(res.Text, normalized)
	if err == nil {
		return applyEngineDefaults(out, normalized.Engine), nil
	}
	repairMessages := append(messages, aiprovider.Message{
		Role:    "user",
		Content: "The previous response was invalid JSON or failed schema validation. Repair it and return only strict JSON matching the schema. Previous response:\n" + res.Text,
	})
	repaired, repairErr := s.text.GenerateTextWithProvider(ctx, normalized.TextProviderID, repairMessages, aiprovider.TextOptions{JSONMode: true})
	if repairErr != nil {
		return nil, repairErr
	}
	repairedOut, err := parseStoryboard(repaired.Text, normalized)
	if err != nil {
		return nil, err
	}
	return applyEngineDefaults(repairedOut, normalized.Engine), nil
}

func (s *Service) RuntimeStatus(ctx context.Context) EngineStatus {
	if inspector, ok := s.planner.(RuntimeInspector); ok {
		return inspector.RuntimeStatus(ctx)
	}
	return EngineStatus{
		RequestedEngine:   EngineAdvancedRequested,
		EngineUsed:        EngineAdvancedFallback,
		FallbackUsed:      true,
		FallbackEnabled:   true,
		SidecarConfigured: false,
		SidecarHealthy:    false,
		Reason:            "runtime_inspector_not_configured",
	}
}

func BuildWorkflowFromShots(storyboard Storyboard, options WorkflowOptions) (json.RawMessage, error) {
	if len(storyboard.Shots) == 0 {
		return nil, ErrInvalidStoryboard
	}
	name := strings.TrimSpace(options.Name)
	if name == "" {
		name = storyboard.Title
	}
	if name == "" {
		name = "AI Director workflow"
	}
	ratio := strings.TrimSpace(options.Ratio)
	if ratio == "" {
		ratio = "9:16"
	}
	resolution := strings.TrimSpace(options.Resolution)
	if resolution == "" {
		resolution = "1080p"
	}
	model := strings.TrimSpace(options.Model)
	if model == "" {
		model = "seedance-2.0-pro"
	}
	maxParallel := normalizeWorkflowMaxParallel(options.MaxParallel, len(storyboard.Shots))
	totalDuration := 0
	nodes := make([]workflow.Node, 0, len(storyboard.Shots)*4+2)
	edges := make([]workflow.Edge, 0, len(storyboard.Shots)*4)
	for i, shot := range storyboard.Shots {
		totalDuration += shot.Duration
		col := i * 360
		promptID := fmt.Sprintf("shot_%d_prompt", shot.ShotIndex)
		paramsID := fmt.Sprintf("shot_%d_params", shot.ShotIndex)
		videoID := fmt.Sprintf("shot_%d_video", shot.ShotIndex)
		promptData, _ := json.Marshal(map[string]any{"label": shot.Title, "prompt": shot.VideoPrompt})
		paramsData, _ := json.Marshal(map[string]any{"label": "Video params", "duration": shot.Duration, "aspect_ratio": ratio, "resolution": resolution, "generate_audio": options.GenerateAudio, "negative_prompt": shot.NegativePrompt})
		videoData, _ := json.Marshal(map[string]any{"label": "Seedance video", "model": model})
		nodes = append(nodes,
			workflow.Node{ID: promptID, Type: workflow.NodePromptInput, Position: position(col, 80), Data: promptData},
			workflow.Node{ID: paramsID, Type: workflow.NodeVideoParams, Position: position(col, 240), Data: paramsData},
			workflow.Node{ID: videoID, Type: workflow.NodeSeedanceVideo, Position: position(col+320, 160), Data: videoData},
		)
		edges = append(edges,
			workflow.Edge{ID: "edge_" + promptID + "_" + videoID, Source: promptID, Target: videoID},
			workflow.Edge{ID: "edge_" + paramsID + "_" + videoID, Source: paramsID, Target: videoID},
		)
		for refIndex, ref := range referenceImageInputs(shot, options.Characters) {
			imageID := fmt.Sprintf("shot_%d_image_%d", shot.ShotIndex, refIndex+1)
			imageData, _ := json.Marshal(map[string]any{
				"label":          ref.Label,
				"asset_id":       ref.AssetID,
				"image_url":      ref.URL,
				"image_type":     ref.ImageType,
				"character_name": ref.CharacterName,
			})
			nodes = append(nodes, workflow.Node{ID: imageID, Type: workflow.NodeImageInput, Position: position(col, 400+refIndex*120), Data: imageData})
			edges = append(edges, workflow.Edge{ID: "edge_" + imageID + "_" + videoID, Source: imageID, Target: videoID})
		}
	}
	outputData, _ := json.Marshal(map[string]any{"label": "Output preview"})
	outputID := "output"
	if options.EnableMerge {
		mergeData, _ := json.Marshal(map[string]any{"label": "Merge", "mode": "auto"})
		mergeID := "merge"
		nodes = append(nodes,
			workflow.Node{ID: mergeID, Type: workflow.NodeVideoMerge, Position: position(len(storyboard.Shots)*360+260, 180), Data: mergeData},
			workflow.Node{ID: outputID, Type: workflow.NodeOutputPreview, Position: position(len(storyboard.Shots)*360+580, 180), Data: outputData},
		)
		for _, shot := range storyboard.Shots {
			videoID := fmt.Sprintf("shot_%d_video", shot.ShotIndex)
			edges = append(edges, workflow.Edge{ID: "edge_" + videoID + "_merge", Source: videoID, Target: mergeID})
		}
		edges = append(edges, workflow.Edge{ID: "edge_merge_output", Source: mergeID, Target: outputID})
	} else {
		nodes = append(nodes, workflow.Node{ID: outputID, Type: workflow.NodeOutputPreview, Position: position(len(storyboard.Shots)*360+260, 180), Data: outputData})
		for _, shot := range storyboard.Shots {
			videoID := fmt.Sprintf("shot_%d_video", shot.ShotIndex)
			edges = append(edges, workflow.Edge{ID: "edge_" + videoID + "_output", Source: videoID, Target: outputID})
		}
	}
	metadata, _ := json.Marshal(map[string]any{
		"source":               "director",
		"engine_used":          storyboard.EngineUsed,
		"engine_status":        storyboard.EngineStatus,
		"shot_count":           len(storyboard.Shots),
		"total_duration":       totalDuration,
		"merge_enabled":        options.EnableMerge,
		"max_parallel":         maxParallel,
		"fallback_visible":     storyboard.EngineStatus != nil && storyboard.EngineStatus.FallbackUsed,
		"provider_video_model": model,
	})
	def := workflow.Definition{Name: name, Model: model, Metadata: metadata, Nodes: nodes, Edges: edges}
	return json.Marshal(def)
}

func normalizeWorkflowMaxParallel(value int, shotCount int) int {
	if shotCount <= 0 {
		return 1
	}
	if value <= 0 {
		value = 5
	}
	if value > shotCount {
		value = shotCount
	}
	if value > 20 {
		value = 20
	}
	if value < 1 {
		return 1
	}
	return value
}

func StoryboardToDirectorPlan(storyboard Storyboard, characters []CharacterInput) DirectorPlan {
	scenes := make([]DirectorScene, 0, len(storyboard.Shots))
	for _, shot := range storyboard.Shots {
		scenes = append(scenes, DirectorScene{
			ID:          fmt.Sprintf("scene_%d", shot.ShotIndex),
			Title:       shot.Scene,
			Description: shot.Action,
		})
	}
	return DirectorPlan{
		Title:        storyboard.Title,
		Summary:      storyboard.Summary,
		Characters:   characters,
		Scenes:       scenes,
		Shots:        storyboard.Shots,
		EngineUsed:   storyboard.EngineUsed,
		EngineStatus: storyboard.EngineStatus,
	}
}

func DirectorPlanToStoryboard(plan DirectorPlan) Storyboard {
	return Storyboard{
		Title:        plan.Title,
		Summary:      plan.Summary,
		Shots:        plan.Shots,
		EngineUsed:   plan.EngineUsed,
		EngineStatus: plan.EngineStatus,
	}
}

func (s *Service) GenerateShotImages(ctx context.Context, in GenerateShotImagesInput) ([]Shot, error) {
	if s.image == nil {
		return nil, ErrInvalidInput
	}
	out := make([]Shot, len(in.Shots))
	copy(out, in.Shots)
	for i := range out {
		prompt := strings.TrimSpace(out[i].ImagePrompt)
		if prompt == "" {
			continue
		}
		img, err := s.image.GenerateImageWithProvider(ctx, in.ImageProviderID, prompt, aiprovider.ImageOptions{
			Resolution: in.Resolution,
			Style:      in.Style,
		})
		if err != nil {
			return nil, fmt.Errorf("%w: image generation failed", ErrImageGenerationFailed)
		}
		out[i].ReferenceImageURL = img.ImageURL
	}
	return out, nil
}

func position(x, y int) json.RawMessage {
	b, _ := json.Marshal(map[string]int{"x": x, "y": y})
	return b
}

type workflowImageInput struct {
	URL           string
	AssetID       string
	Label         string
	ImageType     string
	CharacterName string
}

func referenceImageInputs(shot Shot, characters []CharacterInput) []workflowImageInput {
	out := make([]workflowImageInput, 0, len(shot.ReferenceAssets)+len(characters)+1)
	seen := map[string]struct{}{}
	add := func(raw string, assetID string, label string, imageType string, characterName string) {
		raw = strings.TrimSpace(raw)
		if !isWorkflowImageReference(raw) {
			return
		}
		if _, ok := seen[raw]; ok {
			return
		}
		seen[raw] = struct{}{}
		if label == "" {
			label = "Reference image"
		}
		if imageType == "" {
			imageType = "reference"
		}
		out = append(out, workflowImageInput{URL: raw, AssetID: strings.TrimSpace(assetID), Label: label, ImageType: imageType, CharacterName: strings.TrimSpace(characterName)})
	}
	add(shot.ReferenceImageURL, shot.ReferenceImageAssetID, "Reference image", "reference", "")
	for _, ref := range shot.ReferenceAssets {
		add(ref, "", "Reference image", "reference", "")
	}
	for _, character := range characters {
		name := strings.TrimSpace(character.Name)
		label := "Character reference"
		if name != "" {
			label = "Character: " + name
		}
		for _, ref := range character.ReferenceImages {
			add(ref, character.AssetID, label, "character", name)
		}
	}
	return out
}

func isWorkflowImageReference(raw string) bool {
	return strings.HasPrefix(raw, "https://") || strings.HasPrefix(raw, "asset://ut-asset-")
}

func applyEngineDefaults(out *Storyboard, requestedEngine string) *Storyboard {
	if out == nil {
		return nil
	}
	requestedEngine = strings.TrimSpace(requestedEngine)
	if requestedEngine == "" {
		requestedEngine = EngineNextAPI
	}
	if out.EngineUsed == "" {
		out.EngineUsed = requestedEngine
	}
	if out.EngineStatus == nil {
		out.EngineStatus = &EngineStatus{
			RequestedEngine: requestedEngine,
			EngineUsed:      out.EngineUsed,
		}
	}
	return out
}

func normalizeInput(in GenerateShotsInput) (GenerateShotsInput, error) {
	in.Story = strings.TrimSpace(in.Story)
	if in.Story == "" {
		return in, ErrInvalidInput
	}
	in.Engine = strings.TrimSpace(in.Engine)
	if in.Engine == "" {
		in.Engine = EngineNextAPI
	}
	if in.Engine != EngineNextAPI && in.Engine != EngineAdvancedRequested {
		return in, ErrInvalidInput
	}
	if in.ShotCount <= 0 {
		in.ShotCount = 3
	}
	if in.ShotCount > 12 {
		in.ShotCount = 12
	}
	if in.DurationPerShot <= 0 {
		in.DurationPerShot = 5
	}
	if in.DurationPerShot < 4 {
		in.DurationPerShot = 4
	}
	if in.DurationPerShot > 15 {
		in.DurationPerShot = 15
	}
	return in, nil
}

func parseStoryboard(raw string, in GenerateShotsInput) (*Storyboard, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	var out Storyboard
	if err := json.Unmarshal([]byte(strings.TrimSpace(raw)), &out); err != nil {
		return nil, ErrInvalidStoryboard
	}
	if strings.TrimSpace(out.Title) == "" || len(out.Shots) == 0 {
		return nil, ErrInvalidStoryboard
	}
	if len(out.Shots) > in.ShotCount {
		out.Shots = out.Shots[:in.ShotCount]
	}
	for i := range out.Shots {
		if out.Shots[i].ShotIndex <= 0 {
			out.Shots[i].ShotIndex = i + 1
		}
		if out.Shots[i].Duration <= 0 {
			out.Shots[i].Duration = in.DurationPerShot
		}
		if out.Shots[i].Duration < 4 {
			out.Shots[i].Duration = 4
		}
		if out.Shots[i].Duration > 15 {
			out.Shots[i].Duration = 15
		}
		if strings.TrimSpace(out.Shots[i].VideoPrompt) == "" || strings.TrimSpace(out.Shots[i].ImagePrompt) == "" {
			return nil, ErrInvalidStoryboard
		}
		out.Shots[i].VideoPrompt = ensurePromptTerms(out.Shots[i].VideoPrompt)
		if out.Shots[i].ReferenceAssets == nil {
			out.Shots[i].ReferenceAssets = []string{}
		}
	}
	return &out, nil
}

func ensurePromptTerms(prompt string) string {
	required := "cinematic quality, stable face, same character, consistent clothing, natural body proportions, no distortion, stable camera movement"
	if strings.Contains(prompt, "stable face") {
		return prompt
	}
	return strings.TrimSpace(prompt) + ", " + required
}

func userPrompt(in GenerateShotsInput) string {
	b, _ := json.Marshal(in)
	return string(b)
}

const systemPrompt = `你是一个专业短剧导演、分镜师和 AI 视频提示词工程师。
你的任务是把用户输入的剧情拆解成可用于 AI 视频生成的多镜头分镜。
你必须输出严格 JSON，不要输出 Markdown。
每个镜头都要有明确的画面、动作、情绪、镜头语言和可直接用于视频模型的 prompt。
你要保证角色一致性、服装一致性、场景连续性、情绪递进。
每个 videoPrompt 应该适合 Seedance/UpToken 视频生成，包含 cinematic quality, stable face, same character, consistent clothing, natural body proportions, no distortion, stable camera movement。
每个 imagePrompt 应该适合图像生成，作为该镜头的高清参考图。

输出 JSON schema：
{
  "title": string,
  "summary": string,
  "shots": [
    {
      "shotIndex": number,
      "title": string,
      "duration": number,
      "scene": string,
      "camera": string,
      "emotion": string,
      "action": string,
      "videoPrompt": string,
      "imagePrompt": string,
      "negativePrompt": string,
      "referenceAssets": string[]
    }
  ]
}`
