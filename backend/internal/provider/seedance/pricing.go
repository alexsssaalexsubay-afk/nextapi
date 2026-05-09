package seedance

import (
	"math"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

// Costs are returned in USD cents (1 cent = $0.01), matching the upstream
// Seedance/UpToken invoice currency. The dashboard formats this as "$X.XX".

// Pricing per 1K tokens (USD), mirrored from the upstream price card so our
// estimates and post-completion reconciliation align with what the upstream
// charges per generation. UpToken treats omitted generate_audio as true, so
// visual jobs only use image-reference pricing when audio is explicitly off.
const (
	priceFastImage   = 0.0033
	priceFastText    = 0.0056
	priceNormalImage = 0.0043
	priceNormalText  = 0.00714
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
	img := provider.HasVisualInput(req) && !generatesAudio(req)
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

func generatesAudio(req provider.GenerationRequest) bool {
	if len(req.AudioURLs) > 0 {
		return true
	}
	return req.GenerateAudio == nil || *req.GenerateAudio
}

// Estimate returns (tokens, USD cents), rounded up. 100 cents = $1.00 USD.
func Estimate(req provider.GenerationRequest) (int64, int64) {
	tokens := estimateTokens(req)
	cents := USDCentsFromTokens(req, tokens)
	if cents < 1 {
		cents = 1
	}
	return tokens, cents
}

// USDCentsFromTokens converts a known token count (typically reported by the
// upstream provider after generation) into USD cents using the same per-1K
// rate the estimate would have used. This keeps post-completion reconciliation
// aligned with the upstream invoice currency.
func USDCentsFromTokens(req provider.GenerationRequest, tokens int64) int64 {
	if tokens <= 0 {
		return 0
	}
	usd := (float64(tokens) / 1000.0) * pricePer1K(req)
	return int64(math.Ceil(usd * 100.0))
}
