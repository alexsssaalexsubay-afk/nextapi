package gateway

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// Static catalogue of models exposed to customers via GET /v1/models.
// IDs are stable public names; routing to backends is handled inside the gateway.
// Prices are USD cents per output second. Update when pricing changes.
type publicModel struct {
	ID                    string            `json:"id"`
	Family                string            `json:"family"`
	Description           string            `json:"description"`
	ModalitySupport       map[string]bool   `json:"modality_support"`
	MaxDurationSeconds    int               `json:"max_duration_seconds"`
	MinDurationSeconds    int               `json:"min_duration_seconds"`
	SupportsAutoDuration  bool              `json:"supports_auto_duration"`
	SupportedResolutions  []string          `json:"supported_resolutions"`
	SupportedAspectRatios []string          `json:"supported_aspect_ratios"`
	SupportsAudioOutput   bool              `json:"supports_audio_output"`
	PriceCentsPerSecond   map[string]int    `json:"price_cents_per_second"`
	Status                string            `json:"status"`
}

var models = []publicModel{
	{
		ID: "seedance-2.0-pro", Family: "seedance",
		Description:        "Video generation — Pro quality, up to 15s.",
		MaxDurationSeconds: 15, MinDurationSeconds: 4, SupportsAutoDuration: true,
		SupportedResolutions:  []string{"480p", "720p", "1080p"},
		SupportedAspectRatios: []string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"},
		SupportsAudioOutput: true,
		ModalitySupport: map[string]bool{
			"text_to_video": true, "image_to_video": true,
			"video_to_video": true, "audio_to_video": true,
			"multimodal_reference": true,
		},
		PriceCentsPerSecond: map[string]int{"480p": 8, "720p": 10, "1080p": 15},
		Status:              "ga",
	},
	{
		ID: "seedance-2.0-fast", Family: "seedance",
		Description:        "Video generation — Fast, up to 15s.",
		MaxDurationSeconds: 15, MinDurationSeconds: 4, SupportsAutoDuration: true,
		SupportedResolutions:  []string{"480p", "720p", "1080p"},
		SupportedAspectRatios: []string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"},
		SupportsAudioOutput:   true,
		ModalitySupport: map[string]bool{
			"text_to_video": true, "image_to_video": true,
		},
		PriceCentsPerSecond: map[string]int{"480p": 5, "720p": 7, "1080p": 10},
		Status:              "ga",
	},
}

// canonicalModelID maps legacy public IDs to the current catalogue entry
// so older clients keep working and PriceFor stays consistent.
func canonicalModelID(id string) string {
	switch strings.TrimSpace(id) {
	case "seedance-2.0", "seedance-1.5-pro", "seedance-1.0-pro":
		return "seedance-2.0-pro"
	case "seedance-1.0-pro-fast", "seedance-1.0-lite":
		return "seedance-2.0-fast"
	default:
		return strings.TrimSpace(id)
	}
}

type ModelsHandlers struct{}

func (ModelsHandlers) List(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": models, "has_more": false})
}

func (ModelsHandlers) Get(c *gin.Context) {
	id := c.Param("model_id")
	lookup := canonicalModelID(id)
	for _, m := range models {
		if m.ID == lookup {
			c.JSON(http.StatusOK, m)
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found", "message": "model not found"}})
}

// PriceFor returns cents/sec for (modelID, resolution).
func PriceFor(modelID, resolution string) (int, bool) {
	lookup := canonicalModelID(modelID)
	for _, m := range models {
		if m.ID != lookup {
			continue
		}
		if p, ok := m.PriceCentsPerSecond[resolution]; ok {
			return p, true
		}
	}
	return 0, false
}
