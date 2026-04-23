package gateway

import (
	"context"
	"encoding/json"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

// AuditActorEmailHeader is the HTTP header the admin SPA forwards on
// every state-changing call so we know which human (Clerk email) is
// pulling the lever. The shared X-Admin-Token is intentionally NOT used
// for attribution because it identifies the operator session, not the
// human; the email comes from the verified Clerk JWT bridge.
const AuditActorEmailHeader = "X-Admin-Actor"

// RecordAudit writes a row to audit_log. Errors are logged-and-swallowed
// because the operator action has already happened; failing the API call
// after the side-effect would make recovery harder than missing one
// audit row. The accompanying alert path is /v1/internal/admin/audit.
func RecordAudit(ctx context.Context, db *gorm.DB, c *gin.Context, action, targetType, targetID string, payload any) {
	row := domain.AuditLog{
		ActorEmail: c.GetHeader(AuditActorEmailHeader),
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
