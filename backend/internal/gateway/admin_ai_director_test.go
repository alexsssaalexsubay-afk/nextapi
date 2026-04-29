package gateway

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
)

func TestRuntimeVideoProviderStatusUsesSeedanceRelayEnv(t *testing.T) {
	t.Setenv("PROVIDER_MODE", "seedance_relay")
	t.Setenv("SEEDANCE_RELAY_API_KEY", "relay-key")
	t.Setenv("SEEDANCE_RELAY_MODEL", "")
	t.Setenv("UPTOKEN_API_KEY", "")
	t.Setenv("UPTOKEN_MODEL", "")

	configured, defaultID, model := runtimeVideoProviderStatus()
	if !configured {
		t.Fatal("expected runtime video provider to be configured")
	}
	if defaultID != "runtime:seedance-relay" {
		t.Fatalf("defaultID = %q, want runtime:seedance-relay", defaultID)
	}
	if model != "seedance-2.0-pro" {
		t.Fatalf("model = %q, want seedance-2.0-pro", model)
	}
}

func TestRuntimeVideoProviderStatusRejectsMockOrMissingKey(t *testing.T) {
	t.Setenv("PROVIDER_MODE", "mock")
	configured, _, _ := runtimeVideoProviderStatus()
	if configured {
		t.Fatal("mock provider must not be reported as live video")
	}

	t.Setenv("PROVIDER_MODE", "seedance_relay")
	t.Setenv("SEEDANCE_RELAY_API_KEY", "")
	t.Setenv("UPTOKEN_API_KEY", "")
	configured, _, _ = runtimeVideoProviderStatus()
	if configured {
		t.Fatal("seedance relay without a key must not be reported as configured")
	}
}

func TestAdminDirectorRuntimeConfigHidesSecretsAndUsesNextAPIPolicy(t *testing.T) {
	t.Setenv("VIMAX_RUNTIME_URL", "https://sidecar.internal")
	t.Setenv("DIRECTOR_SIDECAR_TOKEN", "sidecar-secret")
	t.Setenv("DIRECTOR_RUNTIME_CALLBACK_URL", "http://backend:8080/v1/internal/director-runtime")
	t.Setenv("DIRECTOR_RUNTIME_TOKEN", "callback-secret")
	t.Setenv("VIMAX_RUNTIME_ALLOW_FALLBACK", "true")

	cfg := adminDirectorRuntimeConfig()
	if !cfg.ReadyForSidecar {
		t.Fatal("expected sidecar to be ready when sidecar and callback credentials are present")
	}
	if len(cfg.MissingRequirements) != 0 {
		t.Fatalf("ready runtime should not report missing requirements: %#v", cfg.MissingRequirements)
	}
	if !cfg.FallbackEnabled || cfg.FailClosed {
		t.Fatalf("unexpected fallback flags: fallback=%v failClosed=%v", cfg.FallbackEnabled, cfg.FailClosed)
	}
	if cfg.Policy.ProductBrand != "NextAPI Director" || cfg.Policy.PublicEngine != "advanced" {
		t.Fatalf("unexpected runtime identity: %#v", cfg.Policy)
	}
	if cfg.Policy.ProviderKeysExposed || cfg.Policy.UpstreamExposed {
		t.Fatalf("runtime policy must not expose provider keys or upstream branding: %#v", cfg.Policy)
	}
	if cfg.Policy.BillingMode != "nextapi_billing" || cfg.Policy.TaskStatusMode != "nextapi_workflow_jobs" || cfg.Policy.StorageMode != "nextapi_assets" {
		t.Fatalf("runtime policy must stay on NextAPI rails: %#v", cfg.Policy)
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal config: %v", err)
	}
	payload := string(raw)
	for _, secret := range []string{"sidecar-secret", "callback-secret", "https://sidecar.internal", "http://backend:8080"} {
		if strings.Contains(payload, secret) {
			t.Fatalf("runtime config leaked secret or internal URL %q in %s", secret, payload)
		}
	}
}

func TestAdminDirectorRuntimeConfigReportsMissingRequirementsWithoutSecrets(t *testing.T) {
	t.Setenv("DIRECTOR_SIDECAR_TOKEN", "sidecar-secret")
	t.Setenv("VIMAX_RUNTIME_ALLOW_FALLBACK", "true")

	cfg := adminDirectorRuntimeConfig()
	if cfg.ReadyForSidecar {
		t.Fatal("runtime should not be ready without endpoint and callback config")
	}
	want := []string{"sidecar_endpoint", "callback_endpoint", "callback_auth"}
	if strings.Join(cfg.MissingRequirements, ",") != strings.Join(want, ",") {
		t.Fatalf("missing requirements = %#v, want %#v", cfg.MissingRequirements, want)
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal config: %v", err)
	}
	if strings.Contains(string(raw), "sidecar-secret") {
		t.Fatalf("runtime config leaked token in %s", string(raw))
	}
}

func TestAdminDirectorRuntimeConfigDisableFallbackWins(t *testing.T) {
	t.Setenv("VIMAX_RUNTIME_ALLOW_FALLBACK", "true")
	t.Setenv("VIMAX_RUNTIME_DISABLE_FALLBACK", "true")

	cfg := adminDirectorRuntimeConfig()
	if cfg.FallbackEnabled {
		t.Fatal("disable fallback must override allow fallback")
	}
	if !cfg.FailClosed {
		t.Fatal("runtime should be fail-closed when fallback is disabled")
	}
}

func TestDirectorJobEventIncludesStepInputEvidence(t *testing.T) {
	db := setupDirectorRunDB(t)
	now := time.Date(2026, 4, 29, 10, 0, 0, 0, time.UTC)
	directorJobID := "15151515-1515-1515-1515-151515151515"
	if err := db.Create(&domain.DirectorJob{
		ID:                   directorJobID,
		OrgID:                "25252525-2525-2525-2525-252525252525",
		Title:                "Provider evidence",
		Status:               "workflow_ready",
		SelectedCharacterIDs: json.RawMessage(`[]`),
		BudgetSnapshot:       json.RawMessage(`{}`),
		PlanSnapshot:         json.RawMessage(`{}`),
		CreatedAt:            now,
		UpdatedAt:            now,
	}).Error; err != nil {
		t.Fatalf("create director job: %v", err)
	}
	if err := db.Create(&domain.DirectorStep{
		ID:             "35353535-3535-3535-3535-353535353535",
		DirectorJobID:  directorJobID,
		OrgID:          "25252525-2525-2525-2525-252525252525",
		StepKey:        "storyboard",
		Status:         "succeeded",
		InputSnapshot:  json.RawMessage(`{"text_provider_id":" provider_text ","image_provider_id":"provider_image","shot_count":3,"max_parallel":2,"video_model":"seedance"}`),
		OutputSnapshot: json.RawMessage(`{}`),
		CreatedAt:      now,
		UpdatedAt:      now,
	}).Error; err != nil {
		t.Fatalf("create director step: %v", err)
	}

	event := (&AdminHandlers{DB: db}).directorJobEvent(context.Background(), domain.DirectorJob{ID: directorJobID, CreatedAt: now, UpdatedAt: now})
	if len(event.RecentSteps) != 1 {
		t.Fatalf("recent steps = %d, want 1", len(event.RecentSteps))
	}
	step := event.RecentSteps[0]
	if step.TextProviderID != "provider_text" || step.ImageProviderID != "provider_image" || step.VideoModel != "seedance" {
		t.Fatalf("unexpected provider evidence: %#v", step)
	}
	if step.ShotCount != 3 || step.MaxParallel != 2 {
		t.Fatalf("unexpected run shape evidence: %#v", step)
	}
}

func TestDirectorJobEventSeparatesEstimatedAndActualMetering(t *testing.T) {
	db := setupDirectorRunDB(t)
	now := time.Date(2026, 4, 29, 11, 0, 0, 0, time.UTC)
	directorJobID := "45454545-4545-4545-4545-454545454545"
	if err := db.Create(&domain.DirectorJob{
		ID:                   directorJobID,
		OrgID:                "55555555-5555-5555-5555-555555555555",
		Title:                "Metering evidence",
		Status:               "workflow_ready",
		SelectedCharacterIDs: json.RawMessage(`[]`),
		BudgetSnapshot:       json.RawMessage(`{}`),
		PlanSnapshot:         json.RawMessage(`{}`),
		CreatedAt:            now,
		UpdatedAt:            now,
	}).Error; err != nil {
		t.Fatalf("create director job: %v", err)
	}
	if err := db.Create(&[]domain.DirectorMetering{
		{OrgID: "55555555-5555-5555-5555-555555555555", DirectorJobID: &directorJobID, MeterType: "storyboard", Units: 1, EstimatedCents: 12, ActualCents: 10, Status: "succeeded", UsageJSON: json.RawMessage(`{}`), CreatedAt: now},
		{OrgID: "55555555-5555-5555-5555-555555555555", DirectorJobID: &directorJobID, MeterType: "video", Units: 1, EstimatedCents: 50, ActualCents: 64, Status: "succeeded", UsageJSON: json.RawMessage(`{}`), CreatedAt: now},
	}).Error; err != nil {
		t.Fatalf("create director metering: %v", err)
	}

	event := (&AdminHandlers{DB: db}).directorJobEvent(context.Background(), domain.DirectorJob{ID: directorJobID, CreatedAt: now, UpdatedAt: now})
	if event.MeteringCalls != 2 {
		t.Fatalf("metering calls = %d, want 2", event.MeteringCalls)
	}
	if event.EstimatedCents != 62 || event.ActualCents != 74 || event.MeteringCents != 74 {
		t.Fatalf("unexpected metering totals: estimated=%d actual=%d legacy=%d", event.EstimatedCents, event.ActualCents, event.MeteringCents)
	}
}
