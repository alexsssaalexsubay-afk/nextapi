package gateway

import (
	"context"
	"encoding/json"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

// AuditActorEmailHeader is kept as a back-compat fallback for clients
// that still want to self-declare an actor (e.g. cron tools using the
// shared token). For browser-driven admin actions the email comes
// from the verified Clerk JWT and is read from the gin context that
// AdminMiddleware populates — never trusted from a header alone.
const AuditActorEmailHeader = "X-Admin-Actor"

func resolveActor(c *gin.Context) string {
	if v, ok := c.Get(AdminActorCtxKey); ok {
		if s, _ := v.(string); s != "" {
			return s
		}
	}
	return c.GetHeader(AuditActorEmailHeader)
}

// RecordAudit writes a row to audit_log. Errors are logged-and-swallowed
// because the operator action has already happened; failing the API call
// after the side-effect would make recovery harder than missing one
// audit row. The accompanying alert path is /v1/internal/admin/audit.
func RecordAudit(ctx context.Context, db *gorm.DB, c *gin.Context, action, targetType, targetID string, payload any) {
	row := domain.AuditLog{
		ActorEmail: resolveActor(c),
		ActorIP:    c.ClientIP(),
		ActorKind:  "admin",
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
	}
	if payload != nil {
		if b, err := json.Marshal(payload); err == nil {
			row.Payload = b
		}
	}
	if row.Payload == nil {
		row.Payload = []byte("{}")
	}
	_ = db.WithContext(ctx).Create(&row).Error
}
