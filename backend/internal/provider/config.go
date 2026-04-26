package provider

import (
	"os"
	"strings"
)

var defaultAllowedResolutions = []string{"480p", "720p", "1080p"}

// AllowedResolutionList returns configured resolutions in deterministic order.
func AllowedResolutionList() []string {
	raw := strings.TrimSpace(os.Getenv("UPTOKEN_ALLOWED_RESOLUTIONS"))
	if raw == "" {
		raw = strings.TrimSpace(os.Getenv("SEEDANCE_RELAY_ALLOWED_RESOLUTIONS"))
	}
	if raw == "" {
		return append([]string(nil), defaultAllowedResolutions...)
	}
	out := make([]string, 0, len(defaultAllowedResolutions))
	seen := map[string]struct{}{}
	for _, item := range strings.Split(raw, ",") {
		resolution := strings.TrimSpace(item)
		if resolution == "" {
			continue
		}
		if _, ok := seen[resolution]; ok {
			continue
		}
		seen[resolution] = struct{}{}
		out = append(out, resolution)
	}
	if len(out) == 0 {
		return append([]string(nil), defaultAllowedResolutions...)
	}
	return out
}

// AllowedResolutions returns the provider-configured resolution set.
// UPTOKEN_ALLOWED_RESOLUTIONS intentionally wins because the relay's real
// capability can differ from public docs.
func AllowedResolutions() map[string]struct{} {
	out := map[string]struct{}{}
	for _, item := range AllowedResolutionList() {
		out[item] = struct{}{}
	}
	return out
}

func DefaultResolution() string {
	resolutions := AllowedResolutionList()
	if len(resolutions) == 0 {
		return "1080p"
	}
	return resolutions[len(resolutions)-1]
}
