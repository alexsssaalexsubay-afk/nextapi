package gateway

import (
	"crypto/sha256"
	"encoding/hex"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func hashFingerprint(s string) string {
	if s == "" {
		return "-"
	}
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])[:12]
}

type SalesHandlers struct{}

type salesInquiryReq struct {
	Name    string `json:"name" binding:"required"`
	Company string `json:"company" binding:"required"`
	Email   string `json:"email" binding:"required,email"`
	Volume  string `json:"volume" binding:"required"`
	Latency string `json:"latency"`
	Message string `json:"message"`
}

func (h *SalesHandlers) Inquiry(c *gin.Context) {
	var req salesInquiryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{"code": "invalid_request", "message": "invalid request body"},
		})
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	// Don't log raw PII to stdout — log shippers (Loki, Datadog) easily
	// retain it forever and create a GDPR/PIPL liability. Log only a
	// hashed, non-reversible fingerprint plus the categorical fields
	// the on-call needs for routing.
	log.Printf("[sales] inquiry company=%q volume=%s latency=%s contact_hash=%s",
		req.Company, req.Volume, req.Latency, hashFingerprint(req.Email))

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"message": "Our solutions architect will contact you within 12 hours to discuss dedicated capacity.",
	})
}
