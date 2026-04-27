package seedance

import (
	"os"
	"strings"
	"sync"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

// Dreamina / Seedance 2.0 接入点（火山控制台「配置规格」中的模型名）。
// 与定价档位一致：fast vs 标准 × 视频类输入 vs 非视频类输入。
// 参考：https://www.volcengine.com/docs/82379
const (
	dreamina20InferenceVideoIn     = "Dreamina-Seedance-2.0-inference-video-in"
	dreamina20InferenceNonVideoIn  = "Dreamina-Seedance-2.0-inference-non-video-in"
	dreamina20FastInferenceVideoIn = "Dreamina-Seedance-2.0-fast-inference-video-in"
	dreamina20FastNonVideoIn       = "Dreamina-Seedance-2.0-fast-inference-non-video-in"
)

// defaultModelMap maps NextAPI-public IDs that map 1:1 to a single Ark endpoint.
// Seedance 2.0 使用 ResolveArkModel 内的四分支逻辑（见下），不放在此表中。
//
// 仍可通过 SEEDANCE_MODEL_MAP 覆盖这些单行映射，例如：
//
//	SEEDANCE_MODEL_MAP="seedance-1.0-pro:其他接入点名"
var defaultModelMap = map[string]string{
	"seedance-1.0-pro": "doubao-seedance-1-0-pro-250528",
	"seedance-1.5-pro": "doubao-seedance-1-5-pro-251215",
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
		if env := os.Getenv("SEEDANCE_MODEL_MAP"); env != "" {
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

func getenvDefault(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// ResolveArkModel returns the Ark `model` field for POST .../contents/generations/tasks.
//
//   - seedance-2.0 / seedance-2.0-fast: four-way split by hasVisualInput (Dreamina names).
//     Override any branch with SEEDANCE_20_VIDEO_IN_MODEL, SEEDANCE_20_NON_VIDEO_IN_MODEL,
//     SEEDANCE_20_FAST_VIDEO_IN_MODEL, SEEDANCE_20_FAST_NON_VIDEO_IN_MODEL.
//   - Other known public IDs: defaultModelMap + SEEDANCE_MODEL_MAP.
//   - Unknown publicID: passed through (already an Ark-native ID).
//   - Empty Model: returns fallback (typically SEEDANCE_MODEL from LiveProvider).
func ResolveArkModel(req provider.GenerationRequest, fallback string) string {
	publicID := strings.TrimSpace(req.Model)
	if publicID == "" {
		publicID = strings.TrimSpace(fallback)
	}

	switch publicID {
	case "seedance-2.0", "seedance-2.0-pro":
		if provider.HasVisualInput(req) {
			return getenvDefault("SEEDANCE_20_VIDEO_IN_MODEL", dreamina20InferenceVideoIn)
		}
		return getenvDefault("SEEDANCE_20_NON_VIDEO_IN_MODEL", dreamina20InferenceNonVideoIn)
	case "seedance-2.0-fast":
		if provider.HasVisualInput(req) {
			return getenvDefault("SEEDANCE_20_FAST_VIDEO_IN_MODEL", dreamina20FastInferenceVideoIn)
		}
		return getenvDefault("SEEDANCE_20_FAST_NON_VIDEO_IN_MODEL", dreamina20FastNonVideoIn)
	}

	loadModelMap()
	if v, ok := modelMap[publicID]; ok {
		return v
	}
	return publicID
}
