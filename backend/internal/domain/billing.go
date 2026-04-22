package domain

import "time"

type CreditReason string

const (
	ReasonSignupBonus   CreditReason = "signup_bonus"
	ReasonTopup         CreditReason = "topup"
	ReasonConsumption   CreditReason = "consumption"
	ReasonReservation   CreditReason = "reservation"
	ReasonReconciliation CreditReason = "reconciliation"
	ReasonRefund        CreditReason = "refund"
	ReasonAdjustment    CreditReason = "adjustment"
)

type CreditsLedger struct {
	ID           int64        `gorm:"primaryKey;autoIncrement"`
	OrgID        string       `gorm:"type:uuid;not null;index:idx_credits_ledger_org,priority:1"`
	DeltaCredits int64        `gorm:"not null"`
	DeltaCents   *int64       `gorm:"column:delta_cents"`
	Reason       CreditReason `gorm:"type:credit_reason;not null"`
	JobID        *string      `gorm:"type:uuid"`
	Note         string       `gorm:"not null;default:''"`
	CreatedAt    time.Time    `gorm:"index:idx_credits_ledger_org,priority:2,sort:desc"`
}

func (CreditsLedger) TableName() string { return "credits_ledger" }
