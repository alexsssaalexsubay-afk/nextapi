package gateway

import (
	"errors"
	"strings"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

// Allowed values match the gateway model catalogue / video task contract.
// We validate *before* the spend/throughput pipeline so a malformed enum
// becomes a 400 instead of a burned credit reservation that we later refund.

var allowedAspectRatios = map[string]struct{}{
	"16:9": {}, "9:16": {}, "1:1": {}, "4:3": {}, "3:4": {}, "21:9": {}, "adaptive": {},
}

var allowedFPS = map[int]struct{}{
	24: {}, 30: {},
}

// validateVideoParams enforces the subset the gateway forwards to providers.
// Empty strings / zero ints are treated as "unset → provider default"
// and are not rejected here.
func validateVideoParams(aspect string, fps int, duration int, resolution string) error {
	if aspect != "" {
		if _, ok := allowedAspectRatios[aspect]; !ok {
			return errors.New("aspect_ratio must be one of 16:9, 9:16, 1:1, 4:3, 3:4, 21:9, adaptive")
		}
	}
	if resolution != "" {
		if _, ok := provider.AllowedResolutions()[strings.TrimSpace(resolution)]; !ok {
			return errors.New("resolution is unsupported by the configured provider")
		}
	}
	if fps != 0 {
		if _, ok := allowedFPS[fps]; !ok {
			return errors.New("fps must be 24 or 30")
		}
	}
	// Seedance-family providers allow 4–15s; validate before reservation.
	// anything outside that window is almost certainly a client bug.
	if duration != 0 && (duration < 4 || duration > 15) {
		return errors.New("duration_seconds must be between 4 and 15")
	}
	return nil
}

// validateExtendedMediaParams enforces managed Seedance relay multi-media constraints.
func validateExtendedMediaParams(imageURLs []string, videoURLs []string, audioURLs []string, firstFrameURL *string, lastFrameURL *string) error {
	if len(imageURLs) > 9 {
		return errors.New("image_urls: max 9")
	}
	if len(videoURLs) > 3 {
		return errors.New("video_urls: max 3")
	}
	if len(audioURLs) > 3 {
		return errors.New("audio_urls: max 3")
	}
	hasFirstFrame := firstFrameURL != nil && *firstFrameURL != ""
	if hasFirstFrame && len(imageURLs) > 0 {
		return errors.New("first_frame_url and image_urls are mutually exclusive")
	}
	if lastFrameURL != nil && *lastFrameURL != "" && !hasFirstFrame {
		return errors.New("last_frame_url requires first_frame_url")
	}
	if len(audioURLs) > 0 && len(imageURLs) == 0 && len(videoURLs) == 0 && !hasFirstFrame {
		return errors.New("audio_urls requires image or video input")
	}
	return nil
}

func validatePromptOrMediaInput(req provider.GenerationRequest) error {
	if strings.TrimSpace(req.Prompt) != "" || provider.HasVisualInput(req) {
		return nil
	}
	return errors.New("prompt or at least one visual media input is required")
}
