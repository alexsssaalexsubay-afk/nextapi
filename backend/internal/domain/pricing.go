package domain

import "time"

const (
	PricingSourceGlobal      = "global"
	PricingSourceMembership  = "membership"
	PricingSourceOrgOverride = "org_override"
	PricingSourcePricingOff  = "pricing_disabled"
)

type PlatformPricingSettings struct {
	ID                     int16     `json:"id" gorm:"primaryKey;default:1"`
	Enabled                bool      `json:"enabled" gorm:"not null;default:true"`
	DefaultMarkupBPS       int       `json:"default_markup_bps" gorm:"column:default_markup_bps;not null;default:0"`
	MinChargeCents         int64     `json:"min_charge_cents" gorm:"column:min_charge_cents;not null;default:1"`
	RoundingIncrementCents int64     `json:"rounding_increment_cents" gorm:"column:rounding_increment_cents;not null;default:1"`
	UpdatedBy              string    `json:"updated_by" gorm:"column:updated_by;not null;default:''"`
	CreatedAt              time.Time `json:"created_at" gorm:"column:created_at"`
	UpdatedAt              time.Time `json:"updated_at" gorm:"column:updated_at"`
}

type MembershipTier struct {
	ID                    string    `json:"id" gorm:"type:uuid;primaryKey"`
	Name                  string    `json:"name" gorm:"not null"`
	MinLifetimeTopupCents int64     `json:"min_lifetime_topup_cents" gorm:"column:min_lifetime_topup_cents;not null"`
	MarkupBPS             int       `json:"markup_bps" gorm:"column:markup_bps;not null"`
	Enabled               bool      `json:"enabled" gorm:"not null;default:true"`
	Description           string    `json:"description" gorm:"not null;default:''"`
	CreatedAt             time.Time `json:"created_at" gorm:"column:created_at"`
	UpdatedAt             time.Time `json:"updated_at" gorm:"column:updated_at"`
}

type OrgPricingOverride struct {
	OrgID                  string    `json:"org_id" gorm:"type:uuid;primaryKey"`
	OverrideEnabled        bool      `json:"override_enabled" gorm:"column:override_enabled;not null;default:false"`
	MarkupBPS              *int      `json:"markup_bps" gorm:"column:markup_bps"`
	ManualMembershipTierID *string   `json:"manual_membership_tier_id" gorm:"column:manual_membership_tier_id;type:uuid"`
	UpdatedBy              string    `json:"updated_by" gorm:"column:updated_by;not null;default:''"`
	CreatedAt              time.Time `json:"created_at" gorm:"column:created_at"`
	UpdatedAt              time.Time `json:"updated_at" gorm:"column:updated_at"`
}

type OrgPricingState struct {
	OrgID                     string    `json:"org_id" gorm:"type:uuid;primaryKey"`
	LifetimeTopupCents        int64     `json:"lifetime_topup_cents" gorm:"column:lifetime_topup_cents;not null;default:0"`
	AutoMembershipTierID      *string   `json:"auto_membership_tier_id" gorm:"column:auto_membership_tier_id;type:uuid"`
	EffectiveMembershipTierID *string   `json:"effective_membership_tier_id" gorm:"column:effective_membership_tier_id;type:uuid"`
	CreatedAt                 time.Time `json:"created_at" gorm:"column:created_at"`
	UpdatedAt                 time.Time `json:"updated_at" gorm:"column:updated_at"`
}

func (PlatformPricingSettings) TableName() string { return "platform_pricing_settings" }
func (MembershipTier) TableName() string          { return "membership_tiers" }
func (OrgPricingOverride) TableName() string      { return "org_pricing_overrides" }
func (OrgPricingState) TableName() string         { return "org_pricing_state" }
