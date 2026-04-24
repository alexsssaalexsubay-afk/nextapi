package domain

import "time"

type User struct {
	ID              string     `gorm:"primaryKey"`
	Email           string     `gorm:"uniqueIndex;not null"`
	PhoneE164       *string    `gorm:"column:phone_e164;uniqueIndex"`
	PasswordHash    *string    `gorm:"column:password_hash"`
	EmailVerifiedAt *time.Time `gorm:"column:email_verified_at"`
	PhoneVerifiedAt *time.Time `gorm:"column:phone_verified_at"`
	CreatedAt       time.Time
	DeletedAt       *time.Time
}

type AuthSession struct {
	ID         string     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	TokenHash  string     `gorm:"column:token_hash;uniqueIndex;not null"`
	UserID     string     `gorm:"column:user_id;not null;index"`
	OrgID      string     `gorm:"column:org_id;type:uuid;not null;index"`
	UserAgent  string     `gorm:"column:user_agent;not null;default:''"`
	IPCreated  string     `gorm:"column:ip_created;not null;default:''"`
	CreatedAt  time.Time  `gorm:"column:created_at"`
	ExpiresAt  time.Time  `gorm:"column:expires_at;not null"`
	LastUsedAt time.Time  `gorm:"column:last_used_at;not null"`
	RevokedAt  *time.Time `gorm:"column:revoked_at"`
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
	ID                     string     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	OrgID                  string     `gorm:"type:uuid;not null;index"`
	Prefix                 string     `gorm:"not null;index"`
	Hash                   string     `gorm:"not null"`
	Name                   string     `gorm:"not null"`
	Env                    string     `gorm:"column:env;not null;default:'live'"`
	Kind                   string     `gorm:"column:kind;not null;default:'business'"`
	AllowedModels          string     `gorm:"column:allowed_models;type:text[];default:'{}'"`
	MonthlySpendCapCents   *int64     `gorm:"column:monthly_spend_cap_cents"`
	RateLimitRPM           *int       `gorm:"column:rate_limit_rpm"`
	IPAllowlist            string     `gorm:"column:ip_allowlist;type:text[];default:'{}'"`
	ModerationProfile      *string    `gorm:"column:moderation_profile"`
	ProvisionedConcurrency int        `gorm:"not null;default:5"`
	LastUsedAt             *time.Time
	CreatedAt              time.Time
	RevokedAt              *time.Time
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
func (AuthSession) TableName() string { return "auth_sessions" }
