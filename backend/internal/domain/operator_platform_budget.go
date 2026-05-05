package domain

import "time"

// OperatorPlatformBudget is a single-row table: total upstream / platform
// credit budget the operator sets for visibility (not enforced on jobs).
// Unit matches credits_ledger.delta_cents (USD cents).
type OperatorPlatformBudget struct {
	ID            int       `gorm:"primaryKey"`
	BudgetCredits *int64    `gorm:"column:budget_credits"`
	UpdatedAt     time.Time `gorm:"column:updated_at"`
}

func (OperatorPlatformBudget) TableName() string { return "operator_platform_budget" }
