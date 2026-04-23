package gateway

import "errors"

// Allowed values are pulled from Volcengine Ark's documented enumerations
// for the video-task API (docs.volcengine.com/docs/82379). We validate
// *before* the spend/throughput pipeline so a malformed enum becomes a
// 400 instead of a burned credit reservation that we later refund.

var allowedAspectRatios = map[string]struct{}{
	"16:9": {}, "9:16": {}, "1:1": {}, "4:3": {}, "3:4": {}, "21:9": {}, "adaptive": {},
}

var allowedFPS = map[int]struct{}{
	24: {}, 30: {},
}

// validateVideoParams enforces the subset we're confident Ark accepts.
// Empty strings / zero ints are treated as "unset → use upstream default"
// and are not rejected here.
func validateVideoParams(aspect string, fps int, duration int) error {
	if aspect != "" {
		if _, ok := allowedAspectRatios[aspect]; !ok {
			return errors.New("aspect_ratio must be one of 16:9, 9:16, 1:1, 4:3, 3:4, 21:9, adaptive")
		}
	}
	if fps != 0 {
		if _, ok := allowedFPS[fps]; !ok {
			return errors.New("fps must be 24 or 30")
		}
	}
	// Seedance tasks document 2–12s. We cap at 15s elsewhere (models.go)
	// to keep room for the 2.0 family; anything outside that window is
	// almost certainly a client bug.
	if duration != 0 && (duration < 2 || duration > 15) {
		return errors.New("duration_seconds must be between 2 and 15")
	}
	return nil
}
