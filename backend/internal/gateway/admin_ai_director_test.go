package gateway

import (
	"encoding/json"
	"strings"
	"testing"
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
