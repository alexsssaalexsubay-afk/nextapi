package gateway

import "testing"

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
