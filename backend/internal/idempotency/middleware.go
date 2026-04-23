package idempotency

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Middleware enforces idempotency for POST /v1/videos:
//
//   - First request with a key inserts a "pending" placeholder row
//     (status_code = 0) atomically via INSERT ON CONFLICT, then runs
//     the handler. Commit() updates the row with the real response.
//   - Concurrent retries of the same key see the placeholder and get
//     a 409 idempotent_request_in_progress (caller should poll-then-retry).
//   - Replay (cached row, status_code > 0, body matches) returns the
//     stored response.
//   - Same key + different body returns 409 idempotency_conflict.
//
// The placeholder strategy eliminates the TOCTOU race the previous
// First/Commit implementation had, where two concurrent identical POSTs
// could both pass the SELECT, both call provider.GenerateVideo(), and
// both reserve credits — double-charging the customer.
//
// Cache rows live for 24h (CleanupExpired runs hourly from worker).
type Middleware struct {
	DB *gorm.DB
}

// pendingMarker distinguishes the "I am still computing the response"
// state from the "actual cached response" state. Any status_code <= 0
// is treated as pending.
const pendingStatus = 0

func (m *Middleware) Handle() gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.GetHeader("Idempotency-Key")
		if key == "" {
			c.Next()
			return
		}
		// We require an authenticated org so the cache is properly scoped.
		// /v1/videos is behind auth.Business so this should always succeed,
		// but guard anyway.
		org := auth.OrgFrom(c)
		if org == nil {
			c.Next()
			return
		}

		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(body))

		sum := sha256.Sum256(body)
		hash := hex.EncodeToString(sum[:])

		ctx := c.Request.Context()
		placeholder := domain.IdempotencyKey{
			OrgID:      org.ID,
			Key:        key,
			BodySHA256: hash,
			Response:   []byte("{}"),
			StatusCode: pendingStatus,
		}

		// Atomic claim: try to insert; on conflict, do nothing. This
		// ensures exactly one writer per (org, key) wins the race.
		res := m.DB.WithContext(ctx).
			Clauses(clause.OnConflict{DoNothing: true}).
			Create(&placeholder)
		if res.Error != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error": gin.H{"code": "internal_error"}})
			return
		}

		if res.RowsAffected == 1 {
			// We won the race. The handler will run; Commit() will fill in
			// the real response. If the handler crashes / panics before
			// Commit(), the placeholder is rolled back below.
			c.Set("idem.key", key)
			c.Set("idem.body_sha", hash)
			c.Set("idem.placeholder", true)
			c.Next()

			// Defensive cleanup: if the handler ran but never called Commit
			// (e.g. it panicked or short-circuited with no body), the
			// placeholder is stale. Remove it so the next retry can proceed.
			if v, ok := c.Get("idem.committed"); !ok || v != true {
				_ = m.DB.WithContext(ctx).
					Where("org_id = ? AND key = ? AND status_code = ?", org.ID, key, pendingStatus).
					Delete(&domain.IdempotencyKey{}).Error
			}
			return
		}

		// We lost the race or this is a replay.
		var existing domain.IdempotencyKey
		err = m.DB.WithContext(ctx).
			Where("org_id = ? AND key = ?", org.ID, key).First(&existing).Error
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			// Window between conflict and SELECT; the previous holder
			// rolled back. Re-enter the handler — but very rarely. We
			// simply return 409 in_progress here to keep behaviour
			// predictable; the SDK will retry.
			c.AbortWithStatusJSON(http.StatusConflict, gin.H{
				"error": gin.H{
					"code":    "idempotent_request_in_progress",
					"message": "another request with this Idempotency-Key is being processed; retry shortly",
				}})
			return
		case err != nil:
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error": gin.H{"code": "internal_error"}})
			return
		}

		if existing.BodySHA256 != hash {
			c.AbortWithStatusJSON(http.StatusConflict, gin.H{
				"error": gin.H{
					"code":    "idempotency_conflict",
					"message": "Idempotency-Key reused with a different request body",
				}})
			return
		}

		if existing.StatusCode == pendingStatus {
			// Sibling request still running — tell the caller to wait.
			c.Header("Retry-After", "2")
			c.AbortWithStatusJSON(http.StatusConflict, gin.H{
				"error": gin.H{
					"code":    "idempotent_request_in_progress",
					"message": "an identical request with the same Idempotency-Key is in flight; retry in a few seconds",
				}})
			return
		}

		// Cached terminal response — replay.
		c.Header("X-Idempotent-Replay", "true")
		c.Data(existing.StatusCode, "application/json", existing.Response)
		c.Abort()
	}
}

// Commit is invoked by a handler after a successful (or terminal failure)
// response to persist the body for replay. It UPDATEs the placeholder row
// inserted by Handle() — never inserts. Logs but does not block the response
// on DB error.
func Commit(ctx context.Context, db *gorm.DB, orgID string, c *gin.Context, statusCode int, body any) {
	keyV, ok := c.Get("idem.key")
	if !ok {
		return
	}
	key, _ := keyV.(string)
	hashV, _ := c.Get("idem.body_sha")
	hash, _ := hashV.(string)

	b, err := json.Marshal(body)
	if err != nil {
		c.Header("X-Idempotency-Persisted", "false")
		return
	}

	// Treat the placeholder state (status_code = 0) as "still ours to fill".
	// Use a guarded UPDATE so we only overwrite our own placeholder, never
	// a concurrent commit (which can't happen, but belt-and-braces).
	res := db.WithContext(ctx).
		Model(&domain.IdempotencyKey{}).
		Where("org_id = ? AND key = ? AND body_sha256 = ? AND status_code = ?",
			orgID, key, hash, pendingStatus).
		Updates(map[string]any{
			"response":    b,
			"status_code": statusCode,
		})
	if res.Error != nil || res.RowsAffected == 0 {
		c.Header("X-Idempotency-Persisted", "false")
		return
	}
	c.Set("idem.committed", true)
}
