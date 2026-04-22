package ratelimit

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/domain"
)

// Limiter is a Redis sliding-window counter.
type Limiter struct {
	Client *redis.Client
}

// Allow returns (allowed, remaining, resetUnix).
func (l *Limiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, int, int64, error) {
	now := time.Now()
	minScore := now.Add(-window).UnixNano()

	pipe := l.Client.Pipeline()
	pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", minScore))
	cardCmd := pipe.ZCard(ctx, key)
	pipe.ZAdd(ctx, key, redis.Z{Score: float64(now.UnixNano()), Member: fmt.Sprintf("%d", now.UnixNano())})
	pipe.Expire(ctx, key, window)
	if _, err := pipe.Exec(ctx); err != nil {
		return false, 0, 0, err
	}
	count := int(cardCmd.Val()) + 1
	remain := limit - count
	reset := now.Add(window).Unix()
	return count <= limit, remain, reset, nil
}

// Middleware limits per API key (primary) with a fallback to client IP.
func Middleware(l *Limiter, limit int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		var key string
		if v, ok := c.Get(auth.CtxAPIKey); ok {
			if ak, is := v.(*domain.APIKey); is {
				key = "rl:key:" + ak.ID
			} else {
				key = "rl:ip:" + c.ClientIP()
			}
		} else {
			key = "rl:ip:" + c.ClientIP()
		}
		allowed, remain, reset, err := l.Allow(ctx, key, limit, window)
		if err != nil {
			c.Next()
			return
		}
		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", limit))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", max(0, remain)))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", reset))
		if !allowed {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": gin.H{"code": "rate_limited", "message": "too many requests"},
			})
			return
		}
		c.Next()
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
