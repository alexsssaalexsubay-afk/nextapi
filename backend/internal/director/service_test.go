package director

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/aiprovider"
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
	def, err := BuildWorkflowFromShots(Storyboard{Title: "T", Shots: []Shot{{ShotIndex: 1, Title: "A", Duration: 4, VideoPrompt: "p", NegativePrompt: "n", ReferenceAssets: []string{"https://cdn.nextapi.test/ref.png"}}}}, WorkflowOptions{})
	if err != nil {
		t.Fatalf("BuildWorkflowFromShots: %v", err)
	}
	var parsed struct {
		Nodes []struct {
			Type string `json:"type"`
		} `json:"nodes"`
		Edges []json.RawMessage `json:"edges"`
	}
	if err := json.Unmarshal(def, &parsed); err != nil {
		t.Fatalf("json: %v", err)
	}
	foundVideo, foundOutput, foundMerge, foundImage := false, false, false, false
	for _, n := range parsed.Nodes {
		foundVideo = foundVideo || n.Type == "seedance.video"
		foundOutput = foundOutput || n.Type == "output.preview"
		foundMerge = foundMerge || n.Type == "video.merge"
		foundImage = foundImage || n.Type == "image.input"
	}
	if !foundVideo || !foundOutput || foundMerge || !foundImage || len(parsed.Edges) == 0 {
		t.Fatalf("missing expected workflow nodes/edges: %+v", parsed)
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
