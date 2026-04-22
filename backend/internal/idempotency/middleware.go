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
)

// Middleware handles Idempotency-Key for POST /videos:
//   - same key + same body sha → replay cached response
//   - same key + different body → 409 idempotency_conflict
//   - first time → caller proceeds; subsequent response is cached via Commit()
//
// Cache is per (org_id, key) with 24h TTL (enforced by a cron TODO(claude)).
type Middleware struct {
	DB *gorm.DB
}

func (m *Middleware) Handle() gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.GetHeader("Idempotency-Key")
		if key == "" {
			c.Next()
			return
		}
		org := auth.OrgFrom(c)
		if org == nil {
			c.Next()
			return
		}

		// Read body once, stash for the actual handler.
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(body))

		sum := sha256.Sum256(body)
		hash := hex.EncodeToString(sum[:])

		var row domain.IdempotencyKey
		err = m.DB.WithContext(c.Request.Context()).
			Where("org_id = ? AND key = ?", org.ID, key).First(&row).Error
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			// First time — proceed; handler must call Commit().
			c.Set("idem.key", key)
			c.Set("idem.body_sha", hash)
			c.Next()
		case err != nil:
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error": gin.H{"code": "internal_error"}})
		default:
			if row.BodySHA256 != hash {
				c.AbortWithStatusJSON(http.StatusConflict, gin.H{
					"error": gin.H{
						"code":    "idempotency_conflict",
						"message": "Idempotency-Key reused with a different body",
					}})
				return
			}
			// Replay.
			c.Data(row.StatusCode, "application/json", row.Response)
			c.Abort()
		}
	}
}

// Commit is invoked by a handler after a successful write to store the
// response for replay.
func Commit(ctx context.Context, db *gorm.DB, orgID string, c *gin.Context, statusCode int, body any) {
	key, ok := c.Get("idem.key")
	if !ok {
		return
	}
	hash, _ := c.Get("idem.body_sha")
	b, _ := json.Marshal(body)
	row := domain.IdempotencyKey{
		OrgID: orgID, Key: key.(string), BodySHA256: hash.(string),
		Response: b, StatusCode: statusCode,
	}
	_ = db.WithContext(ctx).Create(&row).Error
}
