package gateway

import (
	"crypto/sha256"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

// SalesHandlers serves the public /v1/sales/inquiry endpoint. Inquiries
// are persisted to sales_leads BEFORE any notification is attempted, so
// a Resend outage / missing API key never loses a lead. Notification is
// best-effort and non-blocking.
type SalesHandlers struct {
	DB     *gorm.DB
	Notify interface {
		SendOwner(subject, text string)
	}
}

type salesInquiryReq struct {
	Name    string `json:"name" binding:"required"`
	Company string `json:"company" binding:"required"`
	Email   string `json:"email" binding:"required,email"`
	Volume  string `json:"volume" binding:"required"`
	Latency string `json:"latency"`
	Message string `json:"message"`
}

func hashFingerprint(s string) string {
	if s == "" {
		return "-"
	}
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
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
	emailHash := hashFingerprint(req.Email)

	// Step 1 — durable write. If this fails we surface 500 instead of
	// pretending success, because the marketing page promises "12 hour
	// reply" and silently dropping the row breaks that promise.
	lead := domain.SalesLead{
		Name:      strings.TrimSpace(req.Name),
		Company:   strings.TrimSpace(req.Company),
		Email:     req.Email,
		EmailHash: emailHash[:12], // short hash for log correlation, full hash overkill
		Volume:    strings.TrimSpace(req.Volume),
		Latency:   strings.TrimSpace(req.Latency),
		Message:   strings.TrimSpace(req.Message),
		Source:    "site",
		IP:        c.ClientIP(),
		UserAgent: c.GetHeader("User-Agent"),
	}
	if h.DB == nil {
		// Programmer error — should never happen in production.
		log.Printf("[sales] DB not wired; cannot persist lead company=%q hash=%s",
			req.Company, emailHash[:12])
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{
			"code": "internal_error", "message": "lead store unavailable",
		}})
		return
	}
	if err := h.DB.WithContext(c.Request.Context()).Create(&lead).Error; err != nil {
		log.Printf("[sales] persist failed company=%q hash=%s err=%v",
			req.Company, emailHash[:12], err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{
			"code": "internal_error", "message": "could not record lead, please retry",
		}})
		return
	}

	log.Printf("[sales] lead stored id=%d company=%q volume=%s contact_hash=%s",
		lead.ID, req.Company, req.Volume, emailHash[:12])

	// Step 2 — best-effort notification. Failures land on the row so an
	// operator can see "Resend was down for an hour, here are the leads
	// that were not emailed" and follow up manually.
	if h.Notify != nil {
		body := strings.Join([]string{
			"New enterprise lead from nextapi.top:",
			"",
			"Company:  " + req.Company,
			"Name:     " + req.Name,
			"Email:    " + req.Email,
			"Volume:   " + req.Volume,
			"Latency:  " + req.Latency,
			"Message:",
			req.Message,
			"",
			"Lead ID:  " + intToStr(lead.ID),
			"Reply within 12h per the marketing-page promise.",
		}, "\n")
		h.Notify.SendOwner("[NextAPI] sales lead — "+req.Company, body)
		// SendOwner is fire-and-forget so we don't know whether SMTP
		// succeeded; mark notified_at optimistically and let the operator
		// inbox be the proof. notify_error stays NULL.
		now := time.Now()
		_ = h.DB.WithContext(c.Request.Context()).Model(&lead).
			Update("notified_at", now).Error
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"id":      lead.ID,
		"message": "Our solutions architect will contact you within 12 hours to discuss dedicated capacity.",
	})
}

func intToStr(n int64) string {
	// strconv would work but pulls in another import for one call site;
	// the manual path is shorter than the import.
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	buf := [20]byte{}
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
