package gateway

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/billing"
	"github.com/sanidg/nextapi/backend/internal/domain"
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

func (h *Handlers) ListKeys(c *gin.Context) {
	org := auth.OrgFrom(c)
	keys, err := h.Auth.ListKeys(c.Request.Context(), org.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
		return
	}
	out := make([]gin.H, 0, len(keys))
	for _, k := range keys {
		out = append(out, gin.H{
			"id":                      k.ID,
			"prefix":                  k.Prefix,
			"name":                    k.Name,
			"provisioned_concurrency": k.ProvisionedConcurrency,
			"last_used_at":            k.LastUsedAt,
			"created_at":              k.CreatedAt,
			"revoked_at":              k.RevokedAt,
		})
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
	c.JSON(http.StatusOK, gin.H{
		"id":                      key.ID,
		"prefix":                  key.Prefix,
		"name":                    key.Name,
		"provisioned_concurrency": key.ProvisionedConcurrency,
		"last_used_at":            key.LastUsedAt,
		"created_at":              key.CreatedAt,
		"revoked_at":              key.RevokedAt,
	})
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
	Disabled               *bool `json:"disabled"`
	ProvisionedConcurrency *int  `json:"provisioned_concurrency"`
}

func (h *Handlers) UpdateKey(c *gin.Context) {
	org := auth.OrgFrom(c)
	id := c.Param("id")
	var r updateKeyReq
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request"}})
		return
	}
	if r.Disabled != nil {
		if err := h.Auth.SetDisabled(c.Request.Context(), org.ID, id, *r.Disabled); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error"}})
			return
		}
	}
	if r.ProvisionedConcurrency != nil {
		h.Auth.DB().WithContext(c.Request.Context()).
			Model(&domain.APIKey{}).
			Where("id = ? AND org_id = ?", id, org.ID).
			Update("provisioned_concurrency", *r.ProvisionedConcurrency)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
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
