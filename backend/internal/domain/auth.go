package domain

import "time"

type User struct {
	ID        string     `gorm:"primaryKey"`
	Email     string     `gorm:"uniqueIndex;not null"`
	CreatedAt time.Time
	DeletedAt *time.Time
}

type Org struct {
	ID            string     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Name          string     `gorm:"not null"`
	OwnerUserID   string     `gorm:"not null"`
	PausedAt      *time.Time `gorm:"column:paused_at"`
	PauseReason   *string    `gorm:"column:pause_reason"`
	CompanyName   *string    `gorm:"column:company_name"`
	TaxID         *string    `gorm:"column:tax_id"`
	BillingEmail  *string    `gorm:"column:billing_email"`
	CountryRegion *string    `gorm:"column:country_region"`
	CreatedAt     time.Time
}

type OrgMember struct {
	OrgID  string `gorm:"type:uuid;primaryKey"`
	UserID string `gorm:"primaryKey"`
	Role   string `gorm:"type:org_role;not null"`
}

type APIKey struct {
	ID                      string `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	OrgID                   string `gorm:"type:uuid;not null;index"`
	Prefix                  string `gorm:"not null;index"`
	Hash                    string `gorm:"not null"`
	Name                    string `gorm:"not null"`
	ProvisionedConcurrency  int    `gorm:"not null;default:5"`
	LastUsedAt              *time.Time
	CreatedAt               time.Time
	RevokedAt               *time.Time
}

type APIKeyScope struct {
	KeyID string `gorm:"type:uuid;primaryKey"`
	Scope string `gorm:"type:api_scope;primaryKey"`
}

func (APIKey) TableName() string      { return "api_keys" }
func (APIKeyScope) TableName() string { return "api_key_scopes" }
func (OrgMember) TableName() string   { return "org_members" }
func (Org) TableName() string         { return "orgs" }
func (User) TableName() string        { return "users" }
