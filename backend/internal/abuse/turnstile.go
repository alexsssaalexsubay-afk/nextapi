// Package abuse holds anti-abuse middlewares (CAPTCHA / Turnstile /
// honeypots) that protect cheap-to-write public endpoints (sales,
// signup, bootstrap) from being scraped or sprayed by botnets.
package abuse

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const turnstileVerifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

// Turnstile returns a Gin middleware that verifies a Cloudflare
// Turnstile token from the `cf-turnstile-token` header (or
// `turnstile_token` body field for browsers that can't set custom
// headers cleanly).
//
// Env: TURNSTILE_SECRET_KEY. If unset the middleware is a no-op so
// local dev and unit tests don't have to spin up Cloudflare.
//
// Bypass: if header `X-Turnstile-Bypass` matches env
// `TURNSTILE_BYPASS_TOKEN` we let the request through. Used for our
// own integration tests; the bypass token must be long and rotated.
func Turnstile() gin.HandlerFunc {
	secret := strings.TrimSpace(os.Getenv("TURNSTILE_SECRET_KEY"))
	bypass := strings.TrimSpace(os.Getenv("TURNSTILE_BYPASS_TOKEN"))
	client := &http.Client{Timeout: 5 * time.Second}

	return func(c *gin.Context) {
		if secret == "" {
			c.Next()
			return
		}
		if bypass != "" && c.GetHeader("X-Turnstile-Bypass") == bypass {
			c.Next()
			return
		}

		token := c.GetHeader("cf-turnstile-token")
		if token == "" {
			// Fall back to body field, but read non-destructively.
			token = readBodyToken(c)
		}
		if token == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{
					"code":    "captcha_required",
					"message": "this endpoint requires a Cloudflare Turnstile token",
				},
			})
			return
		}

		ok, err := verifyToken(c.Request.Context(), client, secret, token, c.ClientIP())
		if err != nil || !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{
					"code":    "captcha_failed",
					"message": "Turnstile verification failed",
				},
			})
			return
		}
		c.Next()
	}
}

func readBodyToken(c *gin.Context) string {
	// Tiny attempt to peek at JSON body without disturbing later binders.
	// We rely on having already read body in idempotency middleware on
	// payment routes; for sales/signup we don't need fancy peeking,
	// just check a query param fallback.
	return c.Query("turnstile_token")
}

func verifyToken(ctx context.Context, client *http.Client, secret, token, remoteIP string) (bool, error) {
	form := url.Values{}
	form.Set("secret", secret)
	form.Set("response", token)
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, turnstileVerifyURL, strings.NewReader(form.Encode()))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	var body struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false, err
	}
	return body.Success, nil
}
