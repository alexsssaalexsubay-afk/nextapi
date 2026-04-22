package gateway

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

type ExportHandlers struct {
	DB *gorm.DB
}

// UsageCSV streams usage data as CSV for a date range.
func (h *ExportHandlers) UsageCSV(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	start, err := time.Parse(time.RFC3339, c.Query("start"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "start must be RFC3339"}})
		return
	}
	end, err := time.Parse(time.RFC3339, c.Query("end"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "end must be RFC3339"}})
		return
	}

	var jobs []domain.Job
	h.DB.WithContext(c.Request.Context()).
		Where("org_id = ? AND created_at >= ? AND created_at <= ?", org.ID, start, end).
		Order("created_at DESC").
		Find(&jobs)

	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=nextapi-usage-%s.csv", time.Now().Format("2006-01-02")))
	w := csv.NewWriter(c.Writer)
	w.Write([]string{"job_id", "provider", "status", "reserved_credits", "cost_credits", "tokens_used", "created_at", "completed_at"})
	for _, j := range jobs {
		completed := ""
		if j.CompletedAt != nil {
			completed = j.CompletedAt.Format(time.RFC3339)
		}
		var cost, tokens string
		if j.CostCredits != nil {
			cost = fmt.Sprintf("%d", *j.CostCredits)
		}
		if j.TokensUsed != nil {
			tokens = fmt.Sprintf("%d", *j.TokensUsed)
		}
		w.Write([]string{
			j.ID,
			j.Provider,
			string(j.Status),
			fmt.Sprintf("%d", j.ReservedCredits),
			cost,
			tokens,
			j.CreatedAt.Format(time.RFC3339),
			completed,
		})
	}
	w.Flush()
}

// LedgerCSV streams the credits ledger as CSV.
func (h *ExportHandlers) LedgerCSV(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}

	var rows []domain.CreditsLedger
	h.DB.WithContext(c.Request.Context()).
		Where("org_id = ?", org.ID).
		Order("created_at DESC").
		Find(&rows)

	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=nextapi-ledger-%s.csv", time.Now().Format("2006-01-02")))
	w := csv.NewWriter(c.Writer)
	w.Write([]string{"id", "delta_credits", "delta_cents", "reason", "job_id", "note", "created_at"})
	for _, r := range rows {
		jobID := ""
		if r.JobID != nil {
			jobID = *r.JobID
		}
		var dc string
		if r.DeltaCents != nil {
			dc = fmt.Sprintf("%d", *r.DeltaCents)
		}
		w.Write([]string{
			fmt.Sprintf("%d", r.ID),
			fmt.Sprintf("%d", r.DeltaCredits),
			dc,
			string(r.Reason),
			jobID,
			r.Note,
			r.CreatedAt.Format(time.RFC3339),
		})
	}
	w.Flush()
}
