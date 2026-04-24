package seedance

import (
	"math"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

// Credits are integer cents × 10 (1 credit = $0.001 = 0.1¢).
// 500 signup credits = $0.50 worth.

// Pricing per 1K tokens (USD):
const (
	priceFastImage   = 0.0033
	priceFastText    = 0.0056
	priceNormalImage = 0.0043
	priceNormalText  = 0.0070
)

func resolutionScale(r string) float64 {
	switch r {
	case "1080p":
		return 1.0
	case "720p":
		return 0.55
	case "480p":
		return 0.3
	default:
		return 1.0
	}
}

func estimateTokens(req provider.GenerationRequest) int64 {
	dur := req.DurationSeconds
	if dur <= 0 {
		dur = 5
	}
	return int64(55000.0 * float64(dur) * resolutionScale(req.Resolution))
}

func pricePer1K(req provider.GenerationRequest) float64 {
	fast := req.Mode == "fast"
	img := req.ImageURL != nil && *req.ImageURL != ""
	switch {
	case fast && img:
		return priceFastImage
	case fast && !img:
		return priceFastText
	case !fast && img:
		return priceNormalImage
	default:
		return priceNormalText
	}
}

// Estimate returns (tokens, credits). credits = USD * 1000, rounded up.
func Estimate(req provider.GenerationRequest) (int64, int64) {
	tokens := estimateTokens(req)
	usd := (float64(tokens) / 1000.0) * pricePer1K(req)
	credits := int64(math.Ceil(usd * 1000.0))
	return tokens, credits
}
