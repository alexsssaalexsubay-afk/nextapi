package gateway

import (
	"net/http"
	"strings"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
	"github.com/gin-gonic/gin"
)

func writeUpstreamError(c *gin.Context, upstreamErr *provider.UpstreamError) {
	code := strings.TrimSpace(upstreamErr.Code)
	if code == "" {
		code = "provider_error"
	}
	message := strings.TrimSpace(upstreamErr.Message)

	status := http.StatusBadRequest
	fallbackMessage := "invalid video generation request"
	switch code {
	case "error-104", "402":
		status = http.StatusPaymentRequired
		fallbackMessage = "top up to continue"
	case "error-501", "429":
		status = http.StatusTooManyRequests
		fallbackMessage = "rate limited, retry later"
	}
	if upstreamErr.Retryable && status != http.StatusTooManyRequests {
		status = http.StatusServiceUnavailable
		fallbackMessage = "generation provider unavailable"
	}
	if message == "" {
		message = fallbackMessage
	}

	c.JSON(status, gin.H{"error": gin.H{"code": code, "message": message}})
}
