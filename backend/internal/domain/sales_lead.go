package domain

import "time"

// SalesLead is the durable record of an inbound enterprise inquiry.
// Persisted before any side-effects (Resend send, ops alert) so a flaky
// notifier doesn't lose the lead. Operators reply out-of-band and then
// mark contacted_at via the admin API.
type SalesLead struct {
	ID          int64      `gorm:"primaryKey"`
	Name        string     `gorm:"not null"`
	Company     string     `gorm:"not null"`
	Email       string     `gorm:"not null"`
	EmailHash   string     `gorm:"column:email_hash;not null"`
	Volume      string
	Latency     string
	Message     string
	Source      string `gorm:"not null;default:'site'"`
	IP          string `gorm:"column:ip"`
	UserAgent   string `gorm:"column:user_agent"`
	NotifiedAt  *time.Time
	NotifyError string `gorm:"column:notify_error"`
	ContactedAt *time.Time
	CreatedAt   time.Time
}

func (SalesLead) TableName() string { return "sales_leads" }
