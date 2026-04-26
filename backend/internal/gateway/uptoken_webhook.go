package gateway

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider/seedance"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/spend"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type UpTokenWebhookHandlers struct {
	DB         *gorm.DB
	Spend      *spend.Service
	Throughput *throughput.Service
	Secret     string
}

type uptokenWebhookPayload struct {
	Event     string `json:"event"`
	TaskID    string `json:"task_id"`
	Status    string `json:"status"`
	VideoURL  string `json:"video_url"`
	Timestamp int64  `json:"timestamp"`
	Usage     *struct {
		TotalTokens int64 `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

func (h *UpTokenWebhookHandlers) Handle(c *gin.Context) {
	if h == nil || h.DB == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": gin.H{"code": "webhook_unavailable"}})
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid request body"}})
		return
	}
	if !h.verifySignature(c, body) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "bad_webhook", "message": "webhook signature verification failed"}})
		return
	}
	var ev uptokenWebhookPayload
	if err := json.Unmarshal(body, &ev); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid request body"}})
		return
	}
	taskID := strings.TrimSpace(ev.TaskID)
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "missing task_id"}})
		return
	}
	processed, err := h.apply(c.Request.Context(), ev)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "task_not_found"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "processed": processed})
}

func (h *UpTokenWebhookHandlers) verifySignature(c *gin.Context, body []byte) bool {
	secret := strings.TrimSpace(h.Secret)
	if secret == "" {
		secret = strings.TrimSpace(os.Getenv("SEEDANCE_RELAY_WEBHOOK_SECRET"))
	}
	if secret == "" {
		secret = strings.TrimSpace(os.Getenv("UPTOKEN_WEBHOOK_SECRET"))
	}
	if secret == "" {
		return false
	}
	sig := strings.TrimSpace(c.GetHeader("X-UpToken-Signature"))
	if sig == "" {
		return false
	}
	timestamp := strings.TrimSpace(c.GetHeader("X-UpToken-Timestamp"))
	if timestamp != "" {
		if ts, err := strconv.ParseInt(timestamp, 10, 64); err == nil {
			if d := time.Since(time.Unix(ts, 0)); d > 10*time.Minute || d < -10*time.Minute {
				return false
			}
		}
	}
	payloads := [][]byte{body}
	if timestamp != "" {
		payloads = append(payloads, []byte(timestamp+"."+string(body)))
	}
	for _, payload := range payloads {
		if hmacMatches(secret, payload, sig) {
			return true
		}
	}
	return false
}

func hmacMatches(secret string, payload []byte, sig string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(payload)
	sum := mac.Sum(nil)
	normalized := strings.TrimPrefix(strings.TrimSpace(sig), "sha256=")
	if decoded, err := hex.DecodeString(normalized); err == nil {
		return subtle.ConstantTimeCompare(decoded, sum) == 1
	}
	if decoded, err := base64.StdEncoding.DecodeString(normalized); err == nil {
		return subtle.ConstantTimeCompare(decoded, sum) == 1
	}
	return false
}

func (h *UpTokenWebhookHandlers) apply(ctx context.Context, ev uptokenWebhookPayload) (bool, error) {
	var jobRow domain.Job
	var releaseOrgID string
	var releaseAPIKeyID *string
	var releaseJobID string
	var releaseReserved int64
	processed := false
	now := time.Now()

	err := h.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("provider_job_id = ?", ev.TaskID).
			First(&jobRow).Error; err != nil {
			return err
		}
		if jobRow.Status.IsTerminal() {
			return nil
		}
		releaseOrgID = jobRow.OrgID
		releaseAPIKeyID = jobRow.APIKeyID
		releaseJobID = jobRow.ID
		releaseReserved = jobRow.ReservedCredits

		switch ev.Status {
		case "succeeded":
			actualCost := jobRow.ReservedCredits
			var tokens *int64
			if ev.Usage != nil && ev.Usage.TotalTokens > 0 {
				t := ev.Usage.TotalTokens
				tokens = &t
				var req provider.GenerationRequest
				if err := json.Unmarshal(jobRow.Request, &req); err == nil {
					if cents := seedance.USDCentsFromTokens(req, t); cents > 0 {
						actualCost = cents
					}
				}
			}
			if err := tx.Model(&jobRow).Updates(map[string]any{
				"status":       domain.JobSucceeded,
				"video_url":    stringPtr(ev.VideoURL),
				"tokens_used":  tokens,
				"cost_credits": actualCost,
				"completed_at": now,
			}).Error; err != nil {
				return err
			}
			delta := jobRow.ReservedCredits - actualCost
			if delta != 0 {
				deltaCents := delta
				if err := tx.Create(&domain.CreditsLedger{
					OrgID:        jobRow.OrgID,
					DeltaCredits: delta,
					DeltaCents:   &deltaCents,
					Reason:       domain.ReasonReconciliation,
					JobID:        &jobRow.ID,
					Note:         "uptoken webhook reconcile",
				}).Error; err != nil {
					return err
				}
			}
			outputJSON, _ := json.Marshal(map[string]any{"video_url": ev.VideoURL, "url": ev.VideoURL})
			if err := tx.Model(&domain.Video{}).Where("upstream_job_id = ?", jobRow.ID).Updates(map[string]any{
				"status":            "succeeded",
				"output":            outputJSON,
				"actual_cost_cents": actualCost,
				"upstream_tokens":   tokens,
				"finished_at":       now,
			}).Error; err != nil {
				return err
			}
			updateWorkflowRunStatus(ctx, tx, jobRow.ID, "succeeded", outputJSON)
			processed = true
		case "failed":
			code := "provider_failed"
			message := "video generation failed"
			if ev.Error != nil {
				if strings.TrimSpace(ev.Error.Code) != "" {
					code = ev.Error.Code
				}
				if strings.TrimSpace(ev.Error.Message) != "" {
					message = ev.Error.Message
				}
			}
			if err := tx.Model(&jobRow).Updates(map[string]any{
				"status":        domain.JobFailed,
				"error_code":    code,
				"error_message": message,
				"completed_at":  now,
			}).Error; err != nil {
				return err
			}
			if jobRow.ReservedCredits > 0 {
				refundCents := jobRow.ReservedCredits
				if err := tx.Create(&domain.CreditsLedger{
					OrgID:        jobRow.OrgID,
					DeltaCredits: jobRow.ReservedCredits,
					DeltaCents:   &refundCents,
					Reason:       domain.ReasonRefund,
					JobID:        &jobRow.ID,
					Note:         "uptoken webhook refund",
				}).Error; err != nil {
					return err
				}
			}
			if err := tx.Model(&domain.Video{}).Where("upstream_job_id = ?", jobRow.ID).Updates(map[string]any{
				"status":        "failed",
				"error_code":    code,
				"error_message": message,
				"finished_at":   now,
			}).Error; err != nil {
				return err
			}
			failJSON, _ := json.Marshal(map[string]any{"error_code": code, "error_message": message})
			updateWorkflowRunStatus(ctx, tx, jobRow.ID, "failed", failJSON)
			processed = true
		default:
			return nil
		}
		return nil
	})
	if err != nil || !processed {
		return processed, err
	}
	if h.Throughput != nil {
		_ = h.Throughput.ReleaseForKey(ctx, releaseOrgID, releaseAPIKeyID, releaseJobID)
	}
	if h.Spend != nil {
		h.Spend.DecrInflight(ctx, releaseOrgID, releaseReserved)
	}
	return processed, nil
}

func stringPtr(v string) *string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return &v
}

// updateWorkflowRunStatus mirrors job/processor.updateWorkflowRun so webhook-
// triggered completions keep the canvas/workflow audit row in sync with the
// underlying job. Best-effort: absent table or no matching row is ignored so
// legacy direct-API jobs keep working.
func updateWorkflowRunStatus(ctx context.Context, tx *gorm.DB, jobID string, status string, output json.RawMessage) {
	if tx == nil {
		return
	}
	if !tx.Migrator().HasTable(&domain.WorkflowRun{}) {
		return
	}
	updates := map[string]any{
		"status":     status,
		"updated_at": time.Now(),
	}
	if len(output) > 0 {
		updates["output_snapshot"] = output
	}
	_ = tx.WithContext(ctx).Model(&domain.WorkflowRun{}).
		Where("job_id = ?", jobID).
		Updates(updates).Error
}
