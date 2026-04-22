package gateway

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Static catalogue of Seedance models exposed to customers. Prices are in
// USD cents per output second. Update when pricing changes.
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
		ID: "seedance-2.0", Family: "seedance",
		Description:        "Top-quality Seedance 2.0, text / image / multimodal to video.",
		MaxDurationSeconds: 15, MinDurationSeconds: 4, SupportsAutoDuration: true,
		SupportedResolutions:  []string{"480p", "720p", "1080p"},
		SupportedAspectRatios: []string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
		SupportsAudioOutput:   true,
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
		Description:        "Low-latency variant of Seedance 2.0 at reduced unit cost.",
		MaxDurationSeconds: 15, MinDurationSeconds: 4, SupportsAutoDuration: true,
		SupportedResolutions:  []string{"480p", "720p", "1080p"},
		SupportedAspectRatios: []string{"16:9", "9:16", "1:1"},
		ModalitySupport: map[string]bool{
			"text_to_video": true, "image_to_video": true,
		},
		PriceCentsPerSecond: map[string]int{"480p": 5, "720p": 7, "1080p": 10},
		Status:              "ga",
	},
	{
		ID: "seedance-1.5-pro", Family: "seedance",
		MaxDurationSeconds: 10, MinDurationSeconds: 4,
		SupportedResolutions:  []string{"720p", "1080p"},
		SupportedAspectRatios: []string{"16:9", "9:16"},
		ModalitySupport:       map[string]bool{"text_to_video": true, "image_to_video": true},
		PriceCentsPerSecond:   map[string]int{"720p": 9, "1080p": 14},
		Status:                "ga",
	},
	{
		ID: "seedance-1.0-pro", Family: "seedance",
		MaxDurationSeconds: 10, SupportedResolutions: []string{"720p", "1080p"},
		SupportedAspectRatios: []string{"16:9", "9:16"},
		ModalitySupport:       map[string]bool{"text_to_video": true, "image_to_video": true},
		PriceCentsPerSecond:   map[string]int{"720p": 8, "1080p": 12},
		Status:                "deprecated",
	},
	{
		ID: "seedance-1.0-pro-fast", Family: "seedance",
		MaxDurationSeconds: 10, SupportedResolutions: []string{"720p"},
		SupportedAspectRatios: []string{"16:9", "9:16"},
		ModalitySupport:       map[string]bool{"text_to_video": true},
		PriceCentsPerSecond:   map[string]int{"720p": 5},
		Status:                "deprecated",
	},
	{
		ID: "seedance-1.0-lite", Family: "seedance",
		MaxDurationSeconds: 5, SupportedResolutions: []string{"480p"},
		SupportedAspectRatios: []string{"16:9"},
		ModalitySupport:       map[string]bool{"text_to_video": true},
		PriceCentsPerSecond:   map[string]int{"480p": 3},
		Status:                "ga",
	},
}

type ModelsHandlers struct{}

func (ModelsHandlers) List(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": models, "has_more": false})
}

func (ModelsHandlers) Get(c *gin.Context) {
	id := c.Param("model_id")
	for _, m := range models {
		if m.ID == id {
			c.JSON(http.StatusOK, m)
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found", "message": "model not found"}})
}

// PriceFor returns cents/sec for (modelID, resolution).
func PriceFor(modelID, resolution string) (int, bool) {
	for _, m := range models {
		if m.ID != modelID {
			continue
		}
		if p, ok := m.PriceCentsPerSecond[resolution]; ok {
			return p, true
		}
	}
	return 0, false
}
