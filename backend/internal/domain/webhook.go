package domain

import (
	"encoding/json"
	"time"

	"github.com/lib/pq"
)

type Webhook struct {
	ID         string         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	OrgID      string         `gorm:"type:uuid;not null;index"`
	URL        string         `gorm:"not null"`
	Secret     string         `gorm:"not null"`
	EventTypes pq.StringArray `gorm:"type:text[];not null"`
	CreatedAt  time.Time
	DisabledAt *time.Time
}

type WebhookDelivery struct {
	ID          int64           `gorm:"primaryKey;autoIncrement"`
	WebhookID   string          `gorm:"type:uuid;not null;index"`
	EventType   string          `gorm:"not null"`
	Payload     json.RawMessage `gorm:"type:jsonb;not null"`
	StatusCode  *int
	Error       *string
	Attempt     int `gorm:"not null;default:0"`
	NextRetryAt *time.Time
	DeliveredAt *time.Time
	CreatedAt   time.Time
}

func (Webhook) TableName() string         { return "webhooks" }
func (WebhookDelivery) TableName() string { return "webhook_deliveries" }
