package director

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/aiprovider"
)

type fakeText struct {
	responses []string
	err       error
	calls     int
}

func (f *fakeText) GenerateTextWithProvider(ctx context.Context, providerID string, messages []aiprovider.Message, options aiprovider.TextOptions) (aiprovider.TextResult, error) {
	f.calls++
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

func TestBuildWorkflowFromShots(t *testing.T) {
	def, err := BuildWorkflowFromShots(Storyboard{Title: "T", Shots: []Shot{{ShotIndex: 1, Title: "A", Duration: 4, VideoPrompt: "p", NegativePrompt: "n"}}}, WorkflowOptions{})
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
	foundVideo, foundOutput, foundMerge := false, false, false
	for _, n := range parsed.Nodes {
		foundVideo = foundVideo || n.Type == "seedance.video"
		foundOutput = foundOutput || n.Type == "output.preview"
		foundMerge = foundMerge || n.Type == "video.merge"
	}
	if !foundVideo || !foundOutput || foundMerge || len(parsed.Edges) == 0 {
		t.Fatalf("missing expected workflow nodes/edges: %+v", parsed)
	}
}
