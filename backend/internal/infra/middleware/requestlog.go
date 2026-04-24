// Package middleware provides Gin middleware for request logging.
package middleware

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/httpx"
	"gorm.io/gorm"
)

// RequestLogger writes a request_log row for every authenticated API call.
// It runs asynchronously so it never adds to the hot path latency.
//
// The request body hash (SHA-256, hex) is captured; the raw body is NOT
// stored. This makes it possible to detect duplicate submissions without
// leaking prompt text or image URLs.
//
// Unauthenticated routes (no org_id in context) are skipped — there is
// no attribution for them and the table has a NOT NULL org_id.
func RequestLogger(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Capture body hash before the handler reads it.
		var bodyHash *string
		if c.Request.Body != nil && c.Request.ContentLength > 0 {
			rawBody, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20)) // 1 MB cap
			if err == nil {
				h := sha256.Sum256(rawBody)
				hs := fmt.Sprintf("%x", h)
				bodyHash = &hs
				// Restore body for downstream handlers.
				c.Request.Body = io.NopCloser(bytes.NewReader(rawBody))
			}
		}

		c.Next()

		// Skip unauthenticated requests — no org attribution.
		// Use auth.OrgFrom to read from the canonical context key set by auth middleware.
		org := auth.OrgFrom(c)
		if org == nil {
			return
		}
		orgID := org.ID

		// Skip internal health / metrics routes.
		path := c.FullPath()
		if strings.HasPrefix(path, "/health") || path == "/metrics" {
			return
		}

		elapsed := time.Since(start).Milliseconds()
		status := c.Writer.Status()
		reqID := httpx.RIDFrom(c)

		var apiKeyID *string
		if k := auth.APIKeyFrom(c); k != nil && k.ID != "" {
			id := k.ID
			apiKeyID = &id
		}
		var jobID *string
		if v, ok := c.Get("created_job_id"); ok {
			if s, ok := v.(string); ok && s != "" {
				jobID = &s
			}
		}
		var batchRunID *string
		if v, ok := c.Get("created_batch_run_id"); ok {
			if s, ok := v.(string); ok && s != "" {
				batchRunID = &s
			}
		}
		var errCode *string
		if len(c.Errors) > 0 {
			last := c.Errors.Last().Error()
			errCode = &last
		}

		log := domain.RequestLog{
			RequestID:      reqID,
			OrgID:          orgID,
			APIKeyID:       apiKeyID,
			JobID:          jobID,
			BatchRunID:     batchRunID,
			Endpoint:       path,
			Method:         c.Request.Method,
			RequestHash:    bodyHash,
			ResponseStatus: &status,
			TotalLatencyMs: &elapsed,
			ErrorCode:      errCode,
		}

		// Fire-and-forget — we never want log writes to fail requests.
		go func() {
			db.Create(&log)
		}()
	}
}
