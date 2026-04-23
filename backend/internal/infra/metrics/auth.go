package metrics

import (
	"crypto/subtle"
	"net"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// Auth gates /metrics with one of:
//
//   - METRICS_BASIC_AUTH (e.g. "prometheus:s3cret"): HTTP Basic Auth
//   - METRICS_IP_ALLOWLIST (e.g. "10.0.0.0/8,192.168.1.5"): comma-list of
//     CIDRs / individual IPs the request must originate from
//
// If neither env is set the endpoint is closed (403). This prevents the
// previous coupling to ADMIN_TOKEN — leaking the admin token used to
// also leak metrics, and metrics can leak business KPIs.
func Auth() gin.HandlerFunc {
	basic := os.Getenv("METRICS_BASIC_AUTH")
	allowList := buildAllowList(os.Getenv("METRICS_IP_ALLOWLIST"))

	return func(c *gin.Context) {
		if basic == "" && len(allowList) == 0 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{"code": "metrics_disabled", "message": "set METRICS_BASIC_AUTH or METRICS_IP_ALLOWLIST"},
			})
			return
		}

		if basic != "" {
			user, pass, ok := c.Request.BasicAuth()
			if ok {
				want := strings.SplitN(basic, ":", 2)
				if len(want) == 2 &&
					subtle.ConstantTimeCompare([]byte(user), []byte(want[0])) == 1 &&
					subtle.ConstantTimeCompare([]byte(pass), []byte(want[1])) == 1 {
					c.Next()
					return
				}
			}
		}

		if len(allowList) > 0 && ipAllowed(c.ClientIP(), allowList) {
			c.Next()
			return
		}

		if basic != "" {
			c.Header("WWW-Authenticate", `Basic realm="metrics"`)
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error": gin.H{"code": "forbidden"},
		})
	}
}

func buildAllowList(env string) []*net.IPNet {
	if env == "" {
		return nil
	}
	out := make([]*net.IPNet, 0)
	for _, raw := range strings.Split(env, ",") {
		entry := strings.TrimSpace(raw)
		if entry == "" {
			continue
		}
		if !strings.Contains(entry, "/") {
			ip := net.ParseIP(entry)
			if ip == nil {
				continue
			}
			if ip.To4() != nil {
				entry += "/32"
			} else {
				entry += "/128"
			}
		}
		_, n, err := net.ParseCIDR(entry)
		if err != nil {
			continue
		}
		out = append(out, n)
	}
	return out
}

func ipAllowed(remote string, list []*net.IPNet) bool {
	ip := net.ParseIP(remote)
	if ip == nil {
		return false
	}
	for _, n := range list {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}
