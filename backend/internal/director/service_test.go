package director

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/aiprovider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/workflow"
)

type fakeText struct {
	responses      []string
	err            error
	calls          int
	lastProviderID string
}

func (f *fakeText) GenerateTextWithProvider(ctx context.Context, providerID string, messages []aiprovider.Message, options aiprovider.TextOptions) (aiprovider.TextResult, error) {
	f.calls++
	f.lastProviderID = providerID
	if f.err != nil {
		return aiprovider.TextResult{}, f.err
	}
	if len(f.responses) == 0 {
		return aiprovider.TextResult{}, errors.New("no response")
	}
	out := f.responses[0]
	f.responses = f.responses[1:]
	return aiprovider.TextResult{Text: out}, nil
}

type fakeImage struct {
	err            error
	calls          int
	lastProviderID string
}

func (f *fakeImage) GenerateImageWithProvider(ctx context.Context, providerID string, prompt string, options aiprovider.ImageOptions) (aiprovider.ImageResult, error) {
	f.calls++
	f.lastProviderID = providerID
	if f.err != nil {
		return aiprovider.ImageResult{}, f.err
	}
	return aiprovider.ImageResult{ImageURL: "https://cdn.nextapi.test/shot.png"}, nil
}

type fakePlanner struct {
	calls          int
	lastProviderID string
}

func (f *fakePlanner) GenerateStoryboard(ctx context.Context, in GenerateShotsInput, deps PlannerDeps) (*Storyboard, error) {
	f.calls++
	f.lastProviderID = in.TextProviderID
	if deps.Text == nil {
		return nil, ErrPlannerUnavailable
	}
	return &Storyboard{Title: "Planned", Summary: "ViMax-managed plan", Shots: []Shot{{ShotIndex: 1, Title: "A", Duration: 4, Scene: "S", Camera: "push", Emotion: "calm", Action: "act", VideoPrompt: "video", ImagePrompt: "image", ReferenceAssets: []string{}}}}, nil
}

func TestGenerateShotsValidatesAndRepairs(t *testing.T) {
	valid := `{"title":"Launch","summary":"A quick launch","shots":[{"shotIndex":1,"title":"Open","duration":4,"scene":"studio","camera":"push in","emotion":"hopeful","action":"founder looks at prototype","videoPrompt":"founder in studio","imagePrompt":"founder portrait","negativePrompt":"blur","referenceAssets":[]}]}`
	ft := &fakeText{responses: []string{"not json", valid}}
	svc := NewService(ft)
	out, err := svc.GenerateShots(context.Background(), GenerateShotsInput{Story: "build a launch film", ShotCount: 1, DurationPerShot: 4})
	if err != nil {
		t.Fatalf("GenerateShots: %v", err)
	}
	if ft.calls != 2 {
		t.Fatalf("calls=%d want 2", ft.calls)
	}
	if len(out.Shots) != 1 || out.Shots[0].VideoPrompt == "founder in studio" {
		t.Fatalf("shot was not validated/enriched: %+v", out.Shots)
	}
	if out.Shots[0].PromptEnhancement == nil || out.Shots[0].PromptEnhancement.CameraPlan == "" {
		t.Fatalf("prompt enhancement missing: %+v", out.Shots[0])
	}
}

func TestGenerateShotsAddsDirectorPromptEnhancement(t *testing.T) {
	valid := `{"title":"Portrait","summary":"A short portrait","shots":[{"shotIndex":1,"title":"Open","duration":5,"scene":"forest","camera":"slow push-in","emotion":"quiet confidence","action":"Lin walks toward camera","videoPrompt":"Lin walks through the forest","imagePrompt":"Lin portrait in forest","referenceAssets":["asset://ut-asset-approved"]}]}`
	svc := NewService(&fakeText{responses: []string{valid}})
	out, err := svc.GenerateShots(context.Background(), GenerateShotsInput{
		Story:           "Lin walks through a forest",
		Scene:           "sunlit forest",
		Style:           "cinematic realistic",
		ShotCount:       1,
		DurationPerShot: 5,
		Characters:      []CharacterInput{{Name: "Lin", AssetID: "lin", ReferenceImages: []string{"asset://ut-asset-approved"}}},
	})
	if err != nil {
		t.Fatalf("GenerateShots: %v", err)
	}
	shot := out.Shots[0]
	if shot.NegativePrompt == "" {
		t.Fatal("negative prompt was not filled")
	}
	if shot.PromptEnhancement == nil {
		t.Fatalf("prompt enhancement missing: %+v", shot)
	}
	if shot.PromptEnhancement.SubjectLock == "" || shot.PromptEnhancement.ReferencePolicy == "" || len(shot.PromptEnhancement.QualityTerms) == 0 {
		t.Fatalf("prompt enhancement incomplete: %+v", shot.PromptEnhancement)
	}
	if !strings.Contains(shot.VideoPrompt, "camera plan: slow push-in") || !strings.Contains(shot.VideoPrompt, "same character") {
		t.Fatalf("video prompt was not director-enriched: %q", shot.VideoPrompt)
	}
}

func TestGenerateShotsProviderFailure(t *testing.T) {
	svc := NewService(&fakeText{err: errors.New("provider down")})
	if _, err := svc.GenerateShots(context.Background(), GenerateShotsInput{Story: "x"}); err == nil {
		t.Fatal("expected provider error")
	}
}

func TestGenerateShotsVimaxEngineUsesPlanner(t *testing.T) {
	ft := &fakeText{}
	planner := &fakePlanner{}
	svc := NewService(ft)
	svc.SetStoryPlanner(planner)
	out, err := svc.GenerateShots(context.Background(), GenerateShotsInput{Engine: "advanced", Story: "make a short film", ShotCount: 1, DurationPerShot: 4, TextProviderID: "provider_text"})
	if err != nil {
		t.Fatalf("GenerateShots: %v", err)
	}
	if planner.calls != 1 || ft.calls != 0 {
		t.Fatalf("planner/text calls = %d/%d, want 1/0", planner.calls, ft.calls)
	}
	if planner.lastProviderID != "provider_text" || out.Title != "Planned" {
		t.Fatalf("planner did not receive provider or output: provider=%q out=%+v", planner.lastProviderID, out)
	}
	if out.EngineUsed != EngineAdvancedRequested || out.EngineStatus == nil || out.EngineStatus.EngineUsed != EngineAdvancedRequested {
		t.Fatalf("engine status was not applied: used=%q status=%+v", out.EngineUsed, out.EngineStatus)
	}
}

func TestGenerateShotImagesReturnsProviderError(t *testing.T) {
	img := &fakeImage{err: errors.New("image provider down")}
	svc := NewService(&fakeText{})
	svc.SetImageGenerator(img)
	_, err := svc.GenerateShotImages(context.Background(), GenerateShotImagesInput{
		ImageProviderID: "provider_image",
		Shots:           []Shot{{ShotIndex: 1, ImagePrompt: "reference image"}},
	})
	if !errors.Is(err, ErrImageGenerationFailed) {
		t.Fatalf("err=%v want ErrImageGenerationFailed", err)
	}
	if img.lastProviderID != "provider_image" {
		t.Fatalf("provider=%q want provider_image", img.lastProviderID)
	}
}

func TestBuildWorkflowFromShots(t *testing.T) {
	def, err := BuildWorkflowFromShots(Storyboard{Title: "T", Shots: []Shot{{ShotIndex: 1, Title: "A", Duration: 4, VideoPrompt: "p", NegativePrompt: "n", PromptEnhancement: &PromptEnhancement{CameraPlan: "push"}, ReferenceAssets: []string{"https://cdn.nextapi.test/ref.png"}}}}, WorkflowOptions{})
	if err != nil {
		t.Fatalf("BuildWorkflowFromShots: %v", err)
	}
	var parsed struct {
		Metadata struct {
			MaxParallel int `json:"max_parallel"`
		} `json:"metadata"`
		Nodes []struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		} `json:"nodes"`
		Edges []json.RawMessage `json:"edges"`
	}
	if err := json.Unmarshal(def, &parsed); err != nil {
		t.Fatalf("json: %v", err)
	}
	foundVideo, foundOutput, foundMerge, foundImage, foundPromptEnhancement := false, false, false, false, false
	for _, n := range parsed.Nodes {
		foundVideo = foundVideo || n.Type == "seedance.video"
		foundOutput = foundOutput || n.Type == "output.preview"
		foundMerge = foundMerge || n.Type == "video.merge"
		foundImage = foundImage || n.Type == "image.input"
		if n.Type == "prompt.input" {
			var data struct {
				NegativePrompt    string             `json:"negative_prompt"`
				PromptEnhancement *PromptEnhancement `json:"prompt_enhancement"`
			}
			if err := json.Unmarshal(n.Data, &data); err != nil {
				t.Fatalf("prompt node data: %v", err)
			}
			foundPromptEnhancement = data.NegativePrompt == "n" && data.PromptEnhancement != nil
		}
	}
	if !foundVideo || !foundOutput || foundMerge || !foundImage || len(parsed.Edges) == 0 {
		t.Fatalf("missing expected workflow nodes/edges: %+v", parsed)
	}
	if !foundPromptEnhancement {
		t.Fatalf("prompt enhancement not embedded in prompt node: %+v", parsed.Nodes)
	}
	if parsed.Metadata.MaxParallel != 1 {
		t.Fatalf("max_parallel=%d want 1", parsed.Metadata.MaxParallel)
	}
}

func TestBuildWorkflowFromShotsAddsCharacterMemoryRefs(t *testing.T) {
	def, err := BuildWorkflowFromShots(
		Storyboard{
			Title: "T",
			Shots: []Shot{{
				ShotIndex:      1,
				Title:          "A",
				Duration:       4,
				VideoPrompt:    "p",
				NegativePrompt: "n",
			}},
		},
		WorkflowOptions{
			Characters: []CharacterInput{{
				Name:            "Lin",
				AssetID:         "char_lin",
				ReferenceImages: []string{"https://cdn.nextapi.test/lin.png"},
			}},
		},
	)
	if err != nil {
		t.Fatalf("BuildWorkflowFromShots: %v", err)
	}
	var parsed struct {
		Nodes []struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(def, &parsed); err != nil {
		t.Fatalf("json: %v", err)
	}
	var found bool
	for _, n := range parsed.Nodes {
		if n.Type != "image.input" {
			continue
		}
		var data struct {
			AssetID       string `json:"asset_id"`
			CharacterName string `json:"character_name"`
			ImageType     string `json:"image_type"`
			ImageURL      string `json:"image_url"`
			Label         string `json:"label"`
		}
		if err := json.Unmarshal(n.Data, &data); err != nil {
			t.Fatalf("node data: %v", err)
		}
		if data.AssetID == "char_lin" &&
			data.CharacterName == "Lin" &&
			data.ImageType == "character" &&
			data.ImageURL == "https://cdn.nextapi.test/lin.png" &&
			data.Label == "Character: Lin" {
			found = true
		}
	}
	if !found {
		t.Fatalf("character memory image node not found: %+v", parsed.Nodes)
	}
	payload, _, _, err := workflow.WorkflowToExistingVideoPayload(def)
	if err != nil {
		t.Fatalf("WorkflowToExistingVideoPayload: %v", err)
	}
	if payload.Input.FirstFrameURL == nil || *payload.Input.FirstFrameURL != "https://cdn.nextapi.test/lin.png" {
		t.Fatalf("first_frame_url = %v", payload.Input.FirstFrameURL)
	}
}

func TestGenerateShotsClampsDurationsForVideoProvider(t *testing.T) {
	valid := `{"title":"Launch","summary":"A quick launch","shots":[{"shotIndex":1,"title":"Open","duration":99,"scene":"studio","camera":"push in","emotion":"hopeful","action":"founder looks at prototype","videoPrompt":"founder in studio","imagePrompt":"founder portrait","negativePrompt":"blur","referenceAssets":[]}]}`
	svc := NewService(&fakeText{responses: []string{valid}})
	out, err := svc.GenerateShots(context.Background(), GenerateShotsInput{Story: "build a launch film", ShotCount: 1, DurationPerShot: 99})
	if err != nil {
		t.Fatalf("GenerateShots: %v", err)
	}
	if out.Shots[0].Duration != 15 {
		t.Fatalf("duration=%d want 15", out.Shots[0].Duration)
	}
}
