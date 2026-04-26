package domain

import "time"

const (
	TopupOrderPending = "pending"
	TopupOrderPaid    = "paid"
	TopupOrderFailed  = "failed"
)

type TopupOrder struct {
	ID          string     `gorm:"type:uuid;primaryKey"`
	OrgID       string     `gorm:"type:uuid;not null;index"`
	Provider    string     `gorm:"not null;default:'easypay'"`
	PaymentType string     `gorm:"column:payment_type;not null"`
	AmountCents int64      `gorm:"column:amount_cents;not null"`
	Credits     int64      `gorm:"column:credits;not null"`
	Status      string     `gorm:"not null;default:'pending';index"`
	ExternalID  *string    `gorm:"column:external_id"`
	CreatedAt   time.Time  `gorm:"column:created_at"`
	PaidAt      *time.Time `gorm:"column:paid_at"`
}

func (TopupOrder) TableName() string { return "topup_orders" }
