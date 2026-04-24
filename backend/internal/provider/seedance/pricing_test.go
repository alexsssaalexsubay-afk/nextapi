package seedance

import (
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

func TestEstimate(t *testing.T) {
	img := "https://x/y.png"
	cases := []struct {
		name   string
		req    provider.GenerationRequest
		minCre int64
	}{
		{"fast text 1080p 5s", provider.GenerationRequest{DurationSeconds: 5, Resolution: "1080p", Mode: "fast"}, 1},
		{"normal image 720p 3s", provider.GenerationRequest{DurationSeconds: 3, Resolution: "720p", Mode: "normal", ImageURL: &img}, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			tokens, credits := Estimate(c.req)
			if tokens <= 0 {
				t.Fatalf("tokens must be positive, got %d", tokens)
			}
			if credits < c.minCre {
				t.Fatalf("credits too low: %d", credits)
			}
		})
	}
}
