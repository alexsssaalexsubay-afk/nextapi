package provider

import "testing"

func TestAllowedResolutionsDefaultIncludes1080p(t *testing.T) {
	t.Setenv("UPTOKEN_ALLOWED_RESOLUTIONS", "")
	t.Setenv("SEEDANCE_RELAY_ALLOWED_RESOLUTIONS", "")

	got := AllowedResolutions()
	for _, want := range []string{"480p", "720p", "1080p"} {
		if _, ok := got[want]; !ok {
			t.Fatalf("expected default resolution %q in %v", want, got)
		}
	}
}

func TestAllowedResolutionsUsesUpTokenEnv(t *testing.T) {
	t.Setenv("UPTOKEN_ALLOWED_RESOLUTIONS", "720p,1080p")
	t.Setenv("SEEDANCE_RELAY_ALLOWED_RESOLUTIONS", "480p")

	got := AllowedResolutions()
	if _, ok := got["1080p"]; !ok {
		t.Fatalf("expected 1080p from UPTOKEN_ALLOWED_RESOLUTIONS")
	}
	if _, ok := got["480p"]; ok {
		t.Fatalf("did not expect fallback resolution when UPTOKEN_ALLOWED_RESOLUTIONS is set")
	}
}

func TestDefaultResolutionUsesHighestConfiguredValue(t *testing.T) {
	t.Setenv("UPTOKEN_ALLOWED_RESOLUTIONS", "480p,720p")
	if got := DefaultResolution(); got != "720p" {
		t.Fatalf("DefaultResolution() = %q; want 720p", got)
	}
}
