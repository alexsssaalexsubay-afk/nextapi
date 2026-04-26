package gateway

import (
	"testing"
)

func TestMarketingSlotKeyRe(t *testing.T) {
	valid := []string{"landing_hero_main", "gallery_strip_1", "ab", "a2"}
	for _, k := range valid {
		if !marketingSlotKeyRe.MatchString(k) {
			t.Fatalf("expected valid %q", k)
		}
	}
	invalid := []string{"", "A", "landing hero", "-bad", "x"}
	for _, k := range invalid {
		if marketingSlotKeyRe.MatchString(k) {
			t.Fatalf("expected invalid %q", k)
		}
	}
}

func TestValidateHTTPS(t *testing.T) {
	if err := validateHTTPS("https://cdn.nextapi.top/x.mp4"); err != nil {
		t.Fatal(err)
	}
	if err := validateHTTPS("http://cdn.nextapi.top/x.mp4"); err == nil {
		t.Fatal("expected error for http")
	}
}
