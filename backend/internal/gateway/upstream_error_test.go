package gateway

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
	"github.com/gin-gonic/gin"
)

func TestHandleJobError_UsesUpstreamMessage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/error", func(c *gin.Context) {
		(&VideosHandlers{}).handleJobError(c, &provider.UpstreamError{
			Code:    "InvalidParameter",
			Message: "image at position 1 resource download failed.",
			Type:    "upstream_error",
		})
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/error", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if resp.Error.Code != "InvalidParameter" {
		t.Fatalf("code = %q", resp.Error.Code)
	}
	if resp.Error.Message != "image at position 1 resource download failed." {
		t.Fatalf("message = %q", resp.Error.Message)
	}
}
