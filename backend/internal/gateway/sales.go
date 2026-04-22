package gateway

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

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

	log.Printf("[sales] inquiry from %s <%s> at %s — volume=%s latency=%s",
		req.Name, req.Email, req.Company, req.Volume, req.Latency)

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"message": "Our solutions architect will contact you within 12 hours to discuss dedicated capacity.",
	})
}
