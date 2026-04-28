package main

import "testing"

func TestDirectorRuntimeAllowFallbackDefaultsFailClosed(t *testing.T) {
	t.Setenv("VIMAX_RUNTIME_ALLOW_FALLBACK", "")
	t.Setenv("VIMAX_RUNTIME_DISABLE_FALLBACK", "")

	if directorRuntimeAllowFallback() {
		t.Fatal("director runtime fallback must default to disabled")
	}
}

func TestDirectorRuntimeAllowFallbackExplicitOptIn(t *testing.T) {
	t.Setenv("VIMAX_RUNTIME_ALLOW_FALLBACK", "true")
	t.Setenv("VIMAX_RUNTIME_DISABLE_FALLBACK", "")

	if !directorRuntimeAllowFallback() {
		t.Fatal("expected explicit allow env to enable fallback")
	}
}

func TestDirectorRuntimeDisableFallbackWins(t *testing.T) {
	t.Setenv("VIMAX_RUNTIME_ALLOW_FALLBACK", "true")
	t.Setenv("VIMAX_RUNTIME_DISABLE_FALLBACK", "true")

	if directorRuntimeAllowFallback() {
		t.Fatal("disable env must win over allow env")
	}
}
