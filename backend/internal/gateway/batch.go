package gateway

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	batchsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/batch"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/httpx"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/job"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
)

// BatchHandlers exposes first-class batch run endpoints under /v1/batch.
type BatchHandlers struct {
	Svc        *batchsvc.Service
	Throughput *throughput.Service
}

// POST /v1/batch/runs
//
// Request body:
//
//	{
//	  "name": "ep01-batch",
//	  "shots": [
//	    { "prompt": "...", "duration": 5, "aspect_ratio": "16:9", ... },
//	    ...
//	  ],
//	  "manifest": { ... }   // optional raw JSON stored for download
//	}
func (h *BatchHandlers) Create(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	orgID := org.ID
	apiKeyID := getAPIKeyID(c)

	var req struct {
		Name        *string                      `json:"name"`
		MaxParallel *int                         `json:"max_parallel"`
		Shots       []provider.GenerationRequest `json:"shots" binding:"required,min=1,max=500"`
		Manifest    json.RawMessage              `json:"manifest"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "invalid_request", "invalid request body")
		return
	}

	shots := make([]job.CreateInput, len(req.Shots))
	for i, s := range req.Shots {
		shots[i] = job.CreateInput{
			OrgID:    orgID,
			APIKeyID: apiKeyID,
			Request:  s,
		}
	}

	res, err := h.Svc.Create(c.Request.Context(), batchsvc.CreateInput{
		OrgID:       orgID,
		APIKeyID:    apiKeyID,
		Name:        req.Name,
		MaxParallel: req.MaxParallel,
		Shots:       shots,
		Manifest:    req.Manifest,
	})
	if err != nil {
		httpx.InternalError(c, "batch_create_failed", "failed to create batch run")
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"batch_run_id": res.BatchRunID,
		"job_ids":      res.JobIDs,
		"total":        res.Total,
		"accepted":     res.Accepted,
		"rejected":     res.Rejected,
		"status":       "running",
		"created_at":   time.Now().UTC().Format(time.RFC3339),
	})
}

// GET /v1/batch/runs/:id
func (h *BatchHandlers) Get(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	orgID := org.ID
	batchRunID := c.Param("id")

	br, summary, err := h.Svc.Get(c.Request.Context(), orgID, batchRunID)
	if err == batchsvc.ErrNotFound {
		httpx.NotFoundCode(c, "batch_run_not_found", "batch run not found")
		return
	}
	if err != nil {
		httpx.InternalError(c, "batch_get_failed", "failed to retrieve batch run")
		return
	}

	// Fetch live concurrency info for the response.
	var concurrency gin.H
	if h.Throughput != nil {
		cfg, inFlight, _ := h.Throughput.Get(c.Request.Context(), orgID)
		if cfg != nil {
			concurrency = gin.H{
				"max_parallel":     br.MaxParallel,
				"org_burst_limit":  cfg.BurstConcurrency,
				"org_unlimited":    cfg.Unlimited,
				"current_in_flight": inFlight,
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"id":          br.ID,
		"org_id":      br.OrgID,
		"name":        br.Name,
		"status":      br.Status,
		"summary":     summary,
		"concurrency": concurrency,
		"created_at":  br.CreatedAt.UTC().Format(time.RFC3339),
		"completed_at": func() *string {
			if br.CompletedAt == nil {
				return nil
			}
			s := br.CompletedAt.UTC().Format(time.RFC3339)
			return &s
		}(),
	})
}

// GET /v1/batch/runs
func (h *BatchHandlers) List(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	orgID := org.ID
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	runs, err := h.Svc.List(c.Request.Context(), orgID, limit, offset)
	if err != nil {
		httpx.InternalError(c, "batch_list_failed", "failed to list batch runs")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": runs, "count": len(runs)})
}

// GET /v1/batch/runs/:id/jobs
func (h *BatchHandlers) ListJobs(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	orgID := org.ID
	batchRunID := c.Param("id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	jobs, err := h.Svc.ListJobs(c.Request.Context(), orgID, batchRunID, limit, offset)
	if err == batchsvc.ErrNotFound {
		httpx.NotFoundCode(c, "batch_run_not_found", "batch run not found")
		return
	}
	if err != nil {
		httpx.InternalError(c, "batch_jobs_failed", "failed to list batch jobs")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": jobs, "count": len(jobs)})
}

// POST /v1/batch/runs/:id/retry-failed
func (h *BatchHandlers) RetryFailed(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	orgID := org.ID
	batchRunID := c.Param("id")

	n, err := h.Svc.RetryFailed(c.Request.Context(), orgID, batchRunID)
	if err == batchsvc.ErrNotFound {
		httpx.NotFoundCode(c, "batch_run_not_found", "batch run not found")
		return
	}
	if err != nil {
		httpx.InternalError(c, "retry_failed", "failed to retry jobs")
		return
	}
	c.JSON(http.StatusOK, gin.H{"retried": n})
}

// GET /v1/batch/runs/:id/manifest
func (h *BatchHandlers) DownloadManifest(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	orgID := org.ID
	batchRunID := c.Param("id")

	manifest, err := h.Svc.Manifest(c.Request.Context(), orgID, batchRunID)
	if err == batchsvc.ErrNotFound {
		httpx.NotFoundCode(c, "batch_run_not_found", "batch run not found")
		return
	}
	if err != nil {
		httpx.InternalError(c, "manifest_failed", "failed to retrieve manifest")
		return
	}
	c.Header("Content-Disposition", "attachment; filename=\"batch_"+batchRunID+"_manifest.json\"")
	c.Data(http.StatusOK, "application/json", manifest)
}

// getAPIKeyID reads the authenticated API key ID from context using the
// canonical auth package key, falling back to a legacy string key for
// compatibility with other middleware that may write it differently.
func getAPIKeyID(c *gin.Context) *string {
	if k := auth.APIKeyFrom(c); k != nil && k.ID != "" {
		id := k.ID
		return &id
	}
	return nil
}

// batchJobResponse is a lightweight job representation for batch listings.
type batchJobResponse struct {
	ID          string           `json:"id"`
	Status      domain.JobStatus `json:"status"`
	RetryCount  int              `json:"retry_count"`
	ErrorCode   *string          `json:"error_code,omitempty"`
	VideoURL    *string          `json:"video_url,omitempty"`
	CostCredits *int64           `json:"cost_credits,omitempty"`
	CreatedAt   string           `json:"created_at"`
	CompletedAt *string          `json:"completed_at,omitempty"`
}

func toBatchJobResponse(j domain.Job) batchJobResponse {
	r := batchJobResponse{
		ID:          j.ID,
		Status:      j.Status,
		RetryCount:  j.RetryCount,
		ErrorCode:   j.ErrorCode,
		VideoURL:    j.VideoURL,
		CostCredits: j.CostCredits,
		CreatedAt:   j.CreatedAt.UTC().Format(time.RFC3339),
	}
	if j.CompletedAt != nil {
		s := j.CompletedAt.UTC().Format(time.RFC3339)
		r.CompletedAt = &s
	}
	return r
}
