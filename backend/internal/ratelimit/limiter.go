package ratelimit

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/sanidg/nextapi/backend/internal/infra/metrics"
)

// Limiter is a Redis sliding-window counter.
//
// The previous implementation incremented the window unconditionally —
// even when the request was about to be rejected — which means a client
// being throttled at exactly the limit kept polluting its own window with
// new entries, making the 429 sticky for far longer than the configured
// window. Allow() now reads the current count first and only writes the
// new entry when the request is admitted.
type Limiter struct {
	Client *redis.Client
}

// Allow returns (allowed, remaining, resetUnix, retryAfterSeconds, err).
// retryAfterSeconds is 0 when allowed, otherwise the seconds the caller
// must wait before the oldest event in the window expires.
func (l *Limiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, int, int64, int, error) {
	if limit <= 0 {
		// Hard-disable: deny everything. Defensive — should never happen
		// because main.go always passes positive limits.
		return false, 0, 0, int(window.Seconds()), nil
	}
	now := time.Now()
	minScore := now.Add(-window).UnixNano()

	// Step 1: trim + count, do NOT add the new entry yet.
	pipe := l.Client.Pipeline()
	pipe.ZRemRangeByScore(ctx, key, "0", strconv.FormatInt(minScore, 10))
	cardCmd := pipe.ZCard(ctx, key)
	pipe.Expire(ctx, key, window)
	if _, err := pipe.Exec(ctx); err != nil {
		return false, 0, 0, 0, err
	}
	count := int(cardCmd.Val())

	if count >= limit {
		// Compute Retry-After from the oldest entry: it expires at
		// (oldest_score + window). Fall back to full window if Redis
		// does not return any.
		retry := int(window.Seconds())
		oldestZ, err := l.Client.ZRangeWithScores(ctx, key, 0, 0).Result()
		if err == nil && len(oldestZ) > 0 {
			oldestNanos := int64(oldestZ[0].Score)
			eta := time.Unix(0, oldestNanos).Add(window)
			if delta := int(eta.Sub(now).Seconds()); delta > 0 {
				retry = delta
			} else {
				retry = 1
			}
		}
		reset := now.Add(time.Duration(retry) * time.Second).Unix()
		return false, 0, reset, retry, nil
	}

	// Step 2: admit by adding this event. Score is the unique nanosecond
	// timestamp; member is a unique string so concurrent ZAdd calls do
	// not collapse onto the same set member.
	if err := l.Client.ZAdd(ctx, key, redis.Z{
		Score:  float64(now.UnixNano()),
		Member: fmt.Sprintf("%d-%d", now.UnixNano(), count),
	}).Err(); err != nil {
		return false, 0, 0, 0, err
	}

	remain := limit - (count + 1)
	if remain < 0 {
		remain = 0
	}
	reset := now.Add(window).Unix()
	return true, remain, reset, 0, nil
}

// Middleware limits per API key (primary) with a fallback to client IP.
// Sets standard X-RateLimit-* headers on every response and Retry-After
// when the request is rejected with 429.
func Middleware(l *Limiter, limit int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		key := keyFor(c)
		allowed, remain, reset, retryAfter, err := l.Allow(ctx, key, limit, window)
		if err != nil {
			// Fail open on infra errors — losing rate limiting is less
			// bad than denying every request when Redis hiccups.
			c.Header("X-RateLimit-Status", "bypassed")
			c.Next()
			return
		}
		c.Header("X-RateLimit-Limit", strconv.Itoa(limit))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remain))
		c.Header("X-RateLimit-Reset", strconv.FormatInt(reset, 10))
		if !allowed {
			if retryAfter <= 0 {
				retryAfter = 1
			}
			metrics.RateLimitBlockTotal.WithLabelValues(c.FullPath()).Inc()
			c.Header("Retry-After", strconv.Itoa(retryAfter))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": gin.H{
					"code":    "rate_limited",
					"message": fmt.Sprintf("too many requests; retry in %ds", retryAfter),
				},
			})
			return
		}
		c.Next()
	}
}

func keyFor(c *gin.Context) string {
	if v, ok := c.Get(auth.CtxAPIKey); ok {
		if ak, is := v.(*domain.APIKey); is {
			return "rl:key:" + ak.ID
		}
	}
	return "rl:ip:" + c.ClientIP()
}

// PerKey enforces the per-key rate_limit_rpm value stored on the API
// key row, in addition to whatever route-level Middleware is already
// in place. Skips entirely if the key has no RPM cap configured.
//
// Window is fixed at 60s — the database column is named "rpm" so any
// other window would be lying about its meaning.
func PerKey(l *Limiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		rpm := auth.RateLimitFor(c)
		if rpm <= 0 {
			c.Next()
			return
		}
		ak, ok := c.Get(auth.CtxAPIKey)
		if !ok {
			c.Next()
			return
		}
		key, ok := ak.(*domain.APIKey)
		if !ok {
			c.Next()
			return
		}
		bucket := "rl:keyrpm:" + key.ID
		ctx := c.Request.Context()
		allowed, remain, reset, retry, err := l.Allow(ctx, bucket, rpm, time.Minute)
		if err != nil {
			c.Header("X-RateLimit-Key-Status", "bypassed")
			c.Next()
			return
		}
		c.Header("X-RateLimit-Key-Limit", strconv.Itoa(rpm))
		c.Header("X-RateLimit-Key-Remaining", strconv.Itoa(remain))
		c.Header("X-RateLimit-Key-Reset", strconv.FormatInt(reset, 10))
		if !allowed {
			if retry <= 0 {
				retry = 1
			}
			c.Header("Retry-After", strconv.Itoa(retry))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": gin.H{
					"code":    "key_rate_limited",
					"message": fmt.Sprintf("API key exceeded its per-key cap of %d RPM; retry in %ds", rpm, retry),
				},
			})
			return
		}
		c.Next()
	}
}
