package gateway

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
)

type Handlers struct {
	Auth    *auth.Service
	Billing *billing.Service
}

func New(a *auth.Service, b *billing.Service) *Handlers {
	return &Handlers{Auth: a, Billing: b}
}

// ---- Keys ----

type createKeyReq struct {
	Name                   string   `json:"name" binding:"required"`
	Env                    string   `json:"env"`
	Kind                   string   `json:"kind"`
	Scopes                 []string `json:"scopes"`
	AllowedModels          []string `json:"allowed_models"`
	MonthlySpendCapCents   *int64   `json:"monthly_spend_cap_cents"`
	RateLimitRPM           *int     `json:"rate_limit_rpm"`
	IPAllowlist            []string `json:"ip_allowlist"`
	ModerationProfile      *string  `json:"moderation_profile"`
	ProvisionedConcurrency *int     `json:"provisioned_concurrency"`
}

func (h *Handlers) CreateKey(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	var req createKeyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": "invalid request body"}})
		return
	}
	kind := auth.Kind(req.Kind)
	if kind == "" {
		kind = auth.KindBusiness
	}
	env := auth.Env(req.Env)
	if env == "" {
		env = auth.EnvLive
	}
	res, err := h.Auth.CreateKey(c.Request.Context(), auth.CreateKeyInput{
		OrgID:                  org.ID,
		Name:                   req.Name,
		Kind:                   kind,
		Env:                    env,
		Scopes:                 req.Scopes,
		AllowedModels:          req.AllowedModels,
		MonthlySpendCapCents:   req.MonthlySpendCapCents,
		RateLimitRPM:           req.RateLimitRPM,
		IPAllowlist:            req.IPAllowlist,
		ModerationProfile:      req.ModerationProfile,
		ProvisionedConcurrency: req.ProvisionedConcurrency,
	})
	if err != nil {
		if errors.Is(err, auth.ErrTooManyKeys) {
			c.JSON(http.StatusConflict, gin.H{"error": gin.H{
				"code":    "too_many_keys",
				"message": "this org has reached its active API key limit; revoke an unused key first",
			}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": "failed to create key"}})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"id":      res.ID,
		"secret":  res.FullKey, // aligns with new OpenAPI (ApiKeyWithSecret.secret)
		"key":     res.FullKey, // legacy alias
		"prefix":  res.Prefix,
		"name":    res.Name,
		"env":     string(res.Env),
		"kind":    string(res.Kind),
		"warning": "store this key now; it will not be shown again",
	})
}

// parsePGArray converts a Postgres text[] literal like "{a,b}" to a Go slice.
func parsePGArray(s string) []string {
	s = strings.TrimPrefix(s, "{")
	s = strings.TrimSuffix(s, "}")
	if s == "" {
		return []string{}
	}
	return strings.Split(s, ",")
}

// toPGArray converts a Go string slice to a Postgres text[] literal.
func toPGArray(xs []string) string {
	if len(xs) == 0 {
		return "{}"
	}
	return "{" + strings.Join(xs, ",") + "}"
}

func keyToJSON(k domain.APIKey) gin.H {
	return gin.H{
		"id":                       k.ID,
		"prefix":                   k.Prefix,
		"name":                     k.Name,
		"env":                      k.Env,
		"kind":                     k.Kind,
		"allowed_models":           parsePGArray(k.AllowedModels),
		"monthly_spend_cap_cents":  k.MonthlySpendCapCents,
		"rate_limit_rpm":           k.RateLimitRPM,
		"ip_allowlist":             parsePGArray(k.IPAllowlist),
		"moderation_profile":       k.ModerationProfile,
		"provisioned_concurrency":  k.ProvisionedConcurrency,
		"last_used_at":             k.LastUsedAt,
		"created_at":               k.CreatedAt,
		"revoked_at":               k.RevokedAt,
	}
}

func (h *Handlers) ListKeys(c *gin.Context) {
	org := auth.OrgFrom(c)
	keys, err := h.Auth.ListKeys(c.Request.Context(), org.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	out := make([]gin.H, 0, len(keys))
	for _, k := range keys {
		out = append(out, keyToJSON(k))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func (h *Handlers) GetKey(c *gin.Context) {
	org := auth.OrgFrom(c)
	id := c.Param("id")
	key, err := h.Auth.GetKey(c.Request.Context(), org.ID, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	c.JSON(http.StatusOK, keyToJSON(*key))
}

func (h *Handlers) RevokeKey(c *gin.Context) {
	org := auth.OrgFrom(c)
	id := c.Param("id")
	if err := h.Auth.RevokeKey(c.Request.Context(), org.ID, id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "not_found"}})
		return
	}
	c.Status(http.StatusNoContent)
}

type updateKeyReq struct {
	Disabled               *bool    `json:"disabled"`
	ProvisionedConcurrency *int     `json:"provisioned_concurrency"`
	MonthlySpendCapCents   *int64   `json:"monthly_spend_cap_cents"`
	RateLimitRPM           *int     `json:"rate_limit_rpm"`
	IPAllowlist            []string `json:"ip_allowlist"`
	AllowedModels          []string `json:"allowed_models"`
	ModerationProfile      *string  `json:"moderation_profile"`
}

func (h *Handlers) UpdateKey(c *gin.Context) {
	org := auth.OrgFrom(c)
	id := c.Param("id")
	var r updateKeyReq
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request"}})
		return
	}
	db := h.Auth.DB().WithContext(c.Request.Context())

	if r.Disabled != nil {
		if err := h.Auth.SetDisabled(c.Request.Context(), org.ID, id, *r.Disabled); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
			return
		}
	}
	updates := map[string]any{}
	if r.ProvisionedConcurrency != nil {
		updates["provisioned_concurrency"] = *r.ProvisionedConcurrency
	}
	if r.MonthlySpendCapCents != nil {
		updates["monthly_spend_cap_cents"] = *r.MonthlySpendCapCents
	}
	if r.RateLimitRPM != nil {
		updates["rate_limit_rpm"] = *r.RateLimitRPM
	}
	if r.IPAllowlist != nil {
		updates["ip_allowlist"] = toPGArray(r.IPAllowlist)
	}
	if r.AllowedModels != nil {
		updates["allowed_models"] = toPGArray(r.AllowedModels)
	}
	if r.ModerationProfile != nil {
		updates["moderation_profile"] = *r.ModerationProfile
	}
	if len(updates) > 0 {
		if err := db.Model(&domain.APIKey{}).Where("id = ? AND org_id = ?", id, org.ID).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
			return
		}
	}
	// Return updated key.
	key, err := h.Auth.GetKey(c.Request.Context(), org.ID, id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	c.JSON(http.StatusOK, keyToJSON(*key))
}

// ---- Auth introspection ----

func (h *Handlers) AuthMe(c *gin.Context) {
	org := auth.OrgFrom(c)
	out := gin.H{
		"org": gin.H{"id": org.ID, "name": org.Name},
	}

	if h.Billing != nil {
		if bal, err := h.Billing.GetBalance(c.Request.Context(), org.ID); err == nil {
			out["balance"] = bal
		}
	}

	var keysActive int64
	_ = h.Auth.DB().WithContext(c.Request.Context()).
		Model(&domain.APIKey{}).
		Where("org_id = ? AND revoked_at IS NULL", org.ID).
		Count(&keysActive).Error
	out["api_keys_active"] = keysActive

	c.JSON(http.StatusOK, out)
}

// ---- Billing ----

func (h *Handlers) Balance(c *gin.Context) {
	org := auth.OrgFrom(c)
	bal, err := h.Billing.GetBalance(c.Request.Context(), org.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"balance": bal})
}

func (h *Handlers) Ledger(c *gin.Context) {
	org := auth.OrgFrom(c)
	rows, err := h.Billing.ListLedger(c.Request.Context(), org.ID, 50, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}
