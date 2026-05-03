package workflow

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/videomerge"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestMergeEnabledReflectsServiceWiring(t *testing.T) {
	svc := NewService(nil, nil)
	if svc.MergeEnabled() {
		t.Fatal("merge should be disabled before merge service is wired")
	}
	svc.SetMergeService(videomerge.NewService(nil))
	t.Setenv("VIDEO_MERGE_ENABLED", "false")
	if svc.MergeEnabled() {
		t.Fatal("merge should stay disabled while VIDEO_MERGE_ENABLED is false")
	}
	t.Setenv("VIDEO_MERGE_ENABLED", "true")
	if svc.MergeEnabled() {
		t.Fatal("merge should stay disabled until a merge executor is explicitly enabled")
	}
	t.Setenv("VIDEO_MERGE_EXECUTOR_ENABLED", "true")
	if !svc.MergeEnabled() {
		t.Fatal("merge should be enabled after merge service and executor are wired")
	}
}

func TestWorkflowBatchMaxParallelFromMetadata(t *testing.T) {
	raw, err := json.Marshal(Definition{
		Metadata: json.RawMessage(`{"source":"director","max_parallel":3}`),
		Nodes:    []Node{},
		Edges:    []Edge{},
	})
	if err != nil {
		t.Fatalf("marshal workflow: %v", err)
	}
	got := workflowBatchMaxParallel(raw)
	if got == nil || *got != 3 {
		t.Fatalf("max_parallel=%v want 3", got)
	}
}

func TestWorkflowBatchMaxParallelClampsUnsafeValues(t *testing.T) {
	raw, err := json.Marshal(Definition{
		Metadata: json.RawMessage(`{"source":"director","max_parallel":99}`),
		Nodes:    []Node{},
		Edges:    []Edge{},
	})
	if err != nil {
		t.Fatalf("marshal workflow: %v", err)
	}
	got := workflowBatchMaxParallel(raw)
	if got == nil || *got != 20 {
		t.Fatalf("max_parallel=%v want 20", got)
	}
}

func TestWorkflowRequiresDirectorEntitlement(t *testing.T) {
	raw := mustJSON(t, Definition{
		Metadata: json.RawMessage(`{"source":"comfyui_import","requires_director_entitlement":true}`),
		Nodes: []Node{
			node(t, "director", NodeDirectorLLM, map[string]any{"script": "story"}),
			node(t, "prompt", NodePromptInput, PromptInputData{Prompt: "prompt"}),
			node(t, "params", NodeVideoParams, VideoParamsData{Duration: 5, AspectRatio: "16:9", Resolution: "1080p"}),
			node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
		},
		Edges: []Edge{{Source: "prompt", Target: "video"}, {Source: "params", Target: "video"}},
	})
	if !WorkflowRequiresDirectorEntitlement(raw) {
		t.Fatal("imported Director workflow should require AI Director entitlement")
	}
}

func TestServiceRunBlocksDirectorWorkflowWithoutEntitlement(t *testing.T) {
	db := setupServiceTestDB(t)
	svc := NewService(db, nil)
	ctx := context.Background()
	raw := mustJSON(t, Definition{
		Metadata: json.RawMessage(`{"requires_director_entitlement":true}`),
		Nodes: []Node{
			node(t, "director", NodeDirectorLLM, map[string]any{"script": "story"}),
			node(t, "prompt", NodePromptInput, PromptInputData{Prompt: "prompt"}),
			node(t, "params", NodeVideoParams, VideoParamsData{Duration: 5, AspectRatio: "16:9", Resolution: "1080p"}),
			node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
		},
		Edges: []Edge{{Source: "prompt", Target: "video"}, {Source: "params", Target: "video"}},
	})
	row, err := svc.Create(ctx, CreateInput{OrgID: "org_1", Name: "Imported Director", WorkflowJSON: raw})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if _, err := svc.Run(ctx, row.ID, RunInput{OrgID: "org_1"}); !errors.Is(err, ErrDirectorEntitlementRequired) {
		t.Fatalf("Run error = %v; want ErrDirectorEntitlementRequired", err)
	}
}

func TestServiceVersioning(t *testing.T) {
	db := setupServiceTestDB(t)
	svc := NewService(db, nil)
	ctx := context.Background()
	raw := serviceWorkflowJSON(t, "first prompt")

	created, err := svc.Create(ctx, CreateInput{
		OrgID:        "org_1",
		Name:         "Canvas workflow",
		WorkflowJSON: raw,
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}

	versions, err := svc.ListVersions(ctx, "org_1", created.ID)
	if err != nil {
		t.Fatalf("ListVersions returned error: %v", err)
	}
	if len(versions) != 1 || versions[0].Version != 1 {
		t.Fatalf("versions after create = %#v; want one version 1", versions)
	}

	updatedRaw := serviceWorkflowJSON(t, "updated prompt")
	note := "changed prompt"
	if _, err := svc.Update(ctx, "org_1", created.ID, UpdateInput{WorkflowJSON: &updatedRaw, ChangeNote: &note}); err != nil {
		t.Fatalf("Update returned error: %v", err)
	}

	versions, err = svc.ListVersions(ctx, "org_1", created.ID)
	if err != nil {
		t.Fatalf("ListVersions after update returned error: %v", err)
	}
	if len(versions) != 2 || versions[0].Version != 2 {
		t.Fatalf("versions after update = %#v; want newest version 2", versions)
	}

	restored, err := svc.RestoreVersion(ctx, "org_1", created.ID, versions[1].ID)
	if err != nil {
		t.Fatalf("RestoreVersion returned error: %v", err)
	}
	if !strings.Contains(string(restored.WorkflowJSON), "first prompt") {
		t.Fatalf("restored workflow JSON = %s; want first prompt", restored.WorkflowJSON)
	}
	versions, err = svc.ListVersions(ctx, "org_1", created.ID)
	if err != nil {
		t.Fatalf("ListVersions after restore returned error: %v", err)
	}
	if len(versions) != 3 || versions[0].Version != 3 {
		t.Fatalf("versions after restore = %#v; want restore to create version 3", versions)
	}
}

func TestServiceTemplateAndExport(t *testing.T) {
	db := setupServiceTestDB(t)
	svc := NewService(db, nil)
	ctx := context.Background()

	workflow, err := svc.Create(ctx, CreateInput{
		OrgID:        "org_1",
		Name:         "Reusable canvas",
		WorkflowJSON: serviceWorkflowJSON(t, "template prompt"),
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}

	tmpl, err := svc.SaveAsTemplate(ctx, SaveAsTemplateInput{
		OrgID:      "org_1",
		WorkflowID: workflow.ID,
		Name:       "Reusable template",
		Category:   "canvas",
	})
	if err != nil {
		t.Fatalf("SaveAsTemplate returned error: %v", err)
	}
	if tmpl.OrgID == nil || *tmpl.OrgID != "org_1" {
		t.Fatalf("template org = %v; want org_1", tmpl.OrgID)
	}
	if len(tmpl.WorkflowJSON) == 0 {
		t.Fatalf("template workflow JSON was empty")
	}

	copy, err := svc.CreateFromTemplate(ctx, UseTemplateInput{
		OrgID:      "org_1",
		TemplateID: tmpl.ID,
		Name:       "Copied workflow",
	})
	if err != nil {
		t.Fatalf("CreateFromTemplate returned error: %v", err)
	}
	if copy.ID == workflow.ID {
		t.Fatalf("template use modified original workflow instead of creating a copy")
	}
	if copy.Name != "Copied workflow" {
		t.Fatalf("copy name = %q; want Copied workflow", copy.Name)
	}

	var refreshed domain.Template
	if err := db.First(&refreshed, "id = ?", tmpl.ID).Error; err != nil {
		t.Fatalf("reload template: %v", err)
	}
	if refreshed.UsageCount != 1 {
		t.Fatalf("template usage count = %d; want 1", refreshed.UsageCount)
	}

	exported, err := svc.ExportAPI(ctx, "org_1", workflow.ID)
	if err != nil {
		t.Fatalf("ExportAPI returned error: %v", err)
	}
	if exported.Payload.Model != "seedance-2.0-pro" {
		t.Fatalf("export model = %q; want seedance-2.0-pro", exported.Payload.Model)
	}
	for name, sample := range map[string]string{
		"curl":       exported.Curl,
		"javascript": exported.JavaScript,
		"python":     exported.Python,
	} {
		if !strings.Contains(sample, "https://api.nextapi.top/v1/videos") {
			t.Fatalf("%s export does not use /v1/videos: %s", name, sample)
		}
	}
}

func TestApplyTemplateInputsBuildsProductionWorkflow(t *testing.T) {
	raw := serviceProductionTemplateJSON(t, "female_image", "male_image")
	out, err := ApplyTemplateInputs(templateShortDrama, raw, map[string]any{
		"female_image": "https://cdn.nextapi.top/female.png",
		"male_image":   "https://cdn.nextapi.top/male.png",
		"scene":        "rainy neon street",
		"plot":         "the heroine discovers the betrayal",
		"duration":     json.Number("10"),
		"aspect_ratio": "16:9",
	})
	if err != nil {
		t.Fatalf("ApplyTemplateInputs returned error: %v", err)
	}

	payload, _, _, err := WorkflowToExistingVideoPayload(out)
	if err != nil {
		t.Fatalf("compiled production workflow returned error: %v", err)
	}
	if payload.Input.DurationSeconds != 10 {
		t.Fatalf("duration = %d; want 10", payload.Input.DurationSeconds)
	}
	if payload.Input.AspectRatio != "16:9" {
		t.Fatalf("aspect ratio = %q; want 16:9", payload.Input.AspectRatio)
	}
	if len(payload.Input.ImageURLs) != 2 {
		t.Fatalf("image urls = %#v; want two reference images", payload.Input.ImageURLs)
	}
	if !strings.Contains(payload.Input.Prompt, "rainy neon street") {
		t.Fatalf("prompt = %q; want scene injected", payload.Input.Prompt)
	}
}

func TestApplyTemplateInputsGenericSavedTemplate(t *testing.T) {
	raw := serviceProductionTemplateJSON(t, "hero_image")
	out, err := ApplyTemplateInputs("custom-saved-template", raw, map[string]any{
		"hero_image":   "https://cdn.nextapi.top/hero.png",
		"prompt":       "custom saved workflow prompt",
		"duration":     json.Number("5"),
		"aspect_ratio": "1:1",
		"resolution":   "720p",
	})
	if err != nil {
		t.Fatalf("ApplyTemplateInputs returned error: %v", err)
	}
	payload, _, _, err := WorkflowToExistingVideoPayload(out)
	if err != nil {
		t.Fatalf("compiled generic template returned error: %v", err)
	}
	if len(payload.Input.ImageURLs) != 1 || payload.Input.ImageURLs[0] != "https://cdn.nextapi.top/hero.png" {
		t.Fatalf("image urls = %#v; want generic image input", payload.Input.ImageURLs)
	}
	if payload.Input.Prompt != "custom saved workflow prompt" {
		t.Fatalf("prompt = %q", payload.Input.Prompt)
	}
	if payload.Input.Resolution != "720p" || payload.Input.AspectRatio != "1:1" {
		t.Fatalf("params = %#v", payload.Input)
	}
}

func TestExpandTemplateInputs(t *testing.T) {
	base := map[string]any{"scene": "city"}
	variants, err := expandTemplateInputs(base, map[string][]any{
		"plot": []any{"betrayal", "reunion"},
		"tone": []any{"tense", "warm"},
	}, "cartesian")
	if err != nil {
		t.Fatalf("expandTemplateInputs returned error: %v", err)
	}
	if len(variants) != 4 {
		t.Fatalf("cartesian variants = %d; want 4", len(variants))
	}

	variants, err = expandTemplateInputs(base, map[string][]any{
		"plot": []any{"betrayal", "reunion"},
		"tone": []any{"tense", "warm"},
	}, "zip")
	if err != nil {
		t.Fatalf("zip expandTemplateInputs returned error: %v", err)
	}
	if len(variants) != 2 {
		t.Fatalf("zip variants = %d; want 2", len(variants))
	}
}

func setupServiceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	statements := []string{
		`CREATE TABLE workflows (
			id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
			org_id TEXT NOT NULL,
			project_id TEXT,
			name TEXT NOT NULL,
			description TEXT,
			workflow_json JSON NOT NULL,
			created_at DATETIME,
			updated_at DATETIME
		)`,
		`CREATE TABLE workflow_versions (
			id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
			workflow_id TEXT NOT NULL,
			version INTEGER NOT NULL,
			workflow_json JSON NOT NULL,
			change_note TEXT,
			created_by TEXT,
			created_at DATETIME,
			UNIQUE (workflow_id, version)
		)`,
		`CREATE TABLE templates (
			id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
			org_id TEXT,
			name TEXT NOT NULL,
			slug TEXT NOT NULL UNIQUE,
			description TEXT,
			cover_image_url TEXT,
			category TEXT NOT NULL DEFAULT 'general',
			default_model TEXT NOT NULL DEFAULT 'seedance-2.0-pro',
			default_resolution TEXT NOT NULL DEFAULT '1080p',
			default_duration INTEGER NOT NULL DEFAULT 5,
			default_aspect_ratio TEXT NOT NULL DEFAULT '16:9',
			default_max_parallel INTEGER NOT NULL DEFAULT 5,
			input_schema JSON NOT NULL DEFAULT '[]',
			workflow_json JSON,
			recommended_inputs_schema JSON NOT NULL DEFAULT '[]',
			default_prompt_template TEXT,
			visibility TEXT NOT NULL DEFAULT 'private',
			pricing_multiplier NUMERIC NOT NULL DEFAULT 1.00,
			preview_video_url TEXT,
			estimated_cost_cents INTEGER,
			usage_count INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME,
			updated_at DATETIME
		)`,
		`CREATE TABLE ai_director_entitlements (
			org_id TEXT PRIMARY KEY,
			tier TEXT NOT NULL DEFAULT 'vip',
			enabled BOOLEAN NOT NULL DEFAULT true,
			expires_at DATETIME,
			note TEXT NOT NULL DEFAULT '',
			updated_by TEXT NOT NULL DEFAULT '',
			created_at DATETIME,
			updated_at DATETIME
		)`,
	}
	for _, stmt := range statements {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("create test schema: %v", err)
		}
	}
	return db
}

func serviceWorkflowJSON(t *testing.T, prompt string) json.RawMessage {
	t.Helper()
	return mustJSON(t, Definition{
		Model: "seedance-2.0-pro",
		Nodes: []Node{
			node(t, "image", NodeImageInput, ImageInputData{
				ImageURL:  "https://cdn.nextapi.top/character.png",
				ImageType: "character",
			}),
			node(t, "prompt", NodePromptInput, PromptInputData{Prompt: prompt}),
			node(t, "params", NodeVideoParams, VideoParamsData{
				Duration:    5,
				AspectRatio: "9:16",
				Resolution:  "1080p",
			}),
			node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
		},
		Edges: []Edge{
			{Source: "image", Target: "video"},
			{Source: "prompt", Target: "video"},
			{Source: "params", Target: "video"},
		},
	})
}

func serviceProductionTemplateJSON(t *testing.T, imageKeys ...string) json.RawMessage {
	t.Helper()
	nodes := make([]Node, 0, len(imageKeys)+3)
	edges := make([]Edge, 0, len(imageKeys)+2)
	for _, key := range imageKeys {
		nodes = append(nodes, node(t, key, NodeImageInput, map[string]any{
			"template_key": key,
			"image_type":   "reference",
		}))
		edges = append(edges, Edge{Source: key, Target: "video"})
	}
	nodes = append(nodes,
		node(t, "prompt", NodePromptInput, map[string]any{"template_key": "prompt"}),
		node(t, "params", NodeVideoParams, map[string]any{
			"template_key": "params",
			"duration":     5,
			"aspect_ratio": "9:16",
			"resolution":   "1080p",
		}),
		node(t, "video", NodeSeedanceVideo, SeedanceVideoData{}),
	)
	edges = append(edges,
		Edge{Source: "prompt", Target: "video"},
		Edge{Source: "params", Target: "video"},
	)
	return mustJSON(t, Definition{
		Model: "seedance-2.0-pro",
		Nodes: nodes,
		Edges: edges,
	})
}
