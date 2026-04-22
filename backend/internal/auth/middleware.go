package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/domain"
)

const (
	CtxAPIKey = "nextapi.apikey"
	CtxOrg    = "nextapi.org"
	CtxKind   = "nextapi.kind"
	CtxEnv    = "nextapi.env"
)

// Business gates /videos, /models. Accepts sk_* only.
func Business(svc *Service) gin.HandlerFunc {
	return gate(svc, KindBusiness)
}

// Admin gates /keys, /webhooks, /credits, /usage, /spend_controls,
// /moderation_profile, /throughput. Accepts ak_* only.
func Admin(svc *Service) gin.HandlerFunc {
	return gate(svc, KindAdmin)
}

// Any accepts either kind; used by /auth/me etc.
func Any(svc *Service) gin.HandlerFunc {
	return func(c *gin.Context) { runGate(c, svc, "") }
}

func gate(svc *Service, want Kind) gin.HandlerFunc {
	return func(c *gin.Context) { runGate(c, svc, want) }
}

func runGate(c *gin.Context, svc *Service, want Kind) {
	h := c.GetHeader("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
			"error": gin.H{"code": "authentication.missing_bearer",
				"message": "missing Authorization: Bearer <key>"}})
		return
	}
	raw := strings.TrimPrefix(h, "Bearer ")
	vk, err := svc.Validate(c.Request.Context(), raw)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
			"error": gin.H{"code": "authentication.invalid_key", "message": "invalid api key"}})
		return
	}
	if want != "" && vk.Kind != want {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
			"error": gin.H{"code": "authorization.wrong_kind",
				"message": "this endpoint requires a " + string(want) + "_... key"}})
		return
	}

	if vk.IPAllowlist != "" && vk.IPAllowlist != "{}" {
		clientIP := c.ClientIP()
		if !ipInAllowlist(clientIP, vk.IPAllowlist) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{"code": "authorization.ip_not_allowed", "message": "client IP not in allowlist"}})
			return
		}
	}

	c.Set(CtxAPIKey, vk.APIKey)
	c.Set(CtxOrg, vk.Org)
	c.Set(CtxKind, vk.Kind)
	c.Set(CtxEnv, vk.Env)
	c.Next()
}

func ipInAllowlist(clientIP, pgArray string) bool {
	clean := strings.Trim(pgArray, "{}")
	if clean == "" {
		return true
	}
	for _, allowed := range strings.Split(clean, ",") {
		if strings.TrimSpace(allowed) == clientIP {
			return true
		}
	}
	return false
}

func SetOrg(c *gin.Context, org *domain.Org) {
	c.Set(CtxOrg, org)
}

func OrgFrom(c *gin.Context) *domain.Org {
	v, ok := c.Get(CtxOrg)
	if !ok {
		return nil
	}
	return v.(*domain.Org)
}

func KindFrom(c *gin.Context) Kind {
	v, ok := c.Get(CtxKind)
	if !ok {
		return ""
	}
	return v.(Kind)
}

func EnvFrom(c *gin.Context) Env {
	v, ok := c.Get(CtxEnv)
	if !ok {
		return ""
	}
	return v.(Env)
}

func APIKeyFrom(c *gin.Context) *domain.APIKey {
	v, ok := c.Get(CtxAPIKey)
	if !ok {
		return nil
	}
	return v.(*domain.APIKey)
}
