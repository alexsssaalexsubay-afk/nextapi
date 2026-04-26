package gateway

import "testing"

func TestValidateVideoParamsAllowsDefault1080p(t *testing.T) {
	t.Setenv("UPTOKEN_ALLOWED_RESOLUTIONS", "")
	if err := validateVideoParams("9:16", 0, 5, "1080p"); err != nil {
		t.Fatalf("expected default 1080p to pass: %v", err)
	}
}

func TestValidateVideoParamsUsesConfiguredResolutions(t *testing.T) {
	t.Setenv("UPTOKEN_ALLOWED_RESOLUTIONS", "480p,720p")
	if err := validateVideoParams("9:16", 0, 5, "1080p"); err == nil {
		t.Fatal("expected 1080p to be rejected when provider config does not allow it")
	}
	if err := validateVideoParams("9:16", 0, 5, "720p"); err != nil {
		t.Fatalf("expected configured 720p to pass: %v", err)
	}
}
