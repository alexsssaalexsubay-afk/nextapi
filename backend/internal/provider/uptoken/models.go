package uptoken

import (
	"strings"
	"sync"

	"github.com/sanidg/nextapi/backend/internal/provider"
)

// Managed Seedance relay upstream model IDs.
//
// The upstream exposes only a handful of video IDs today; our public catalogue
// (gateway/models.go) uses a superset. defaultModelMap translates every public
// ID we advertise to the closest relay ID so customers don't have to care
// which upstream is wired underneath.
const (
	uptokenSeedance20Pro  = "seedance-2.0-pro"
	uptokenSeedance20Fast = "seedance-2.0-fast"
)

// defaultModelMap maps NextAPI-public IDs → upstream Seedance relay IDs.
// Pro-quality families fold into seedance-2.0-pro; -fast families fold into
// seedance-2.0-fast. Override with SEEDANCE_RELAY_MODEL_MAP="publicID:upstreamID,…".
var defaultModelMap = map[string]string{
	"seedance-2.0":          uptokenSeedance20Pro,
	"seedance-2.0-pro":      uptokenSeedance20Pro,
	"seedance-2.0-fast":     uptokenSeedance20Fast,
	"seedance-1.5-pro":      uptokenSeedance20Pro,
	"seedance-1.0-pro":      uptokenSeedance20Pro,
	"seedance-1.0-pro-fast": uptokenSeedance20Fast,
	"seedance-1.0-lite":     uptokenSeedance20Fast,
}

var (
	modelMapOnce sync.Once
	modelMap     map[string]string
)

func loadModelMap() {
	modelMapOnce.Do(func() {
		m := make(map[string]string, len(defaultModelMap)+8)
		for k, v := range defaultModelMap {
			m[k] = v
		}
		if env := getenvAny("SEEDANCE_RELAY_MODEL_MAP", "UPTOKEN_MODEL_MAP"); env != "" {
			for _, pair := range strings.Split(env, ",") {
				parts := strings.SplitN(strings.TrimSpace(pair), ":", 2)
				if len(parts) == 2 && parts[0] != "" && parts[1] != "" {
					m[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
				}
			}
		}
		modelMap = m
	})
}

// ResolveUpstreamModel returns the upstream `model` field for
// POST /v1/video/generations given our public GenerationRequest.
//
// Resolution order:
//  1. Empty public ID → fallback (SEEDANCE_RELAY_MODEL env var).
//  2. Known public ID in the map → mapped value.
//  3. Unknown public ID → passed through verbatim (customer is already
//     targeting a native relay ID like `seedance-2.0-pro`).
func ResolveUpstreamModel(req provider.GenerationRequest, fallback string) string {
	publicID := strings.TrimSpace(req.Model)
	if publicID == "" {
		return fallback
	}
	loadModelMap()
	if v, ok := modelMap[publicID]; ok {
		return v
	}
	return publicID
}
