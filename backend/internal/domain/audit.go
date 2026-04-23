package domain

import (
	"encoding/json"
	"time"
)

// AuditLog is the immutable record of every state-changing internal-admin
// action. Inserted by gateway/audit.RecordAudit() called from each admin
// handler. Read by GET /v1/internal/admin/audit (admin-token only).
type AuditLog struct {
	ID         int64           `gorm:"primaryKey"`
	ActorEmail string          `gorm:"column:actor_email"`
	ActorIP    string          `gorm:"column:actor_ip"`
	ActorKind  string          `gorm:"column:actor_kind;not null;default:'admin'"`
	Action     string          `gorm:"not null"`
	TargetType string          `gorm:"column:target_type"`
	TargetID   string          `gorm:"column:target_id"`
	Payload    json.RawMessage `gorm:"type:jsonb;not null;default:'{}'"`
	CreatedAt  time.Time
}

func (AuditLog) TableName() string { return "audit_log" }
