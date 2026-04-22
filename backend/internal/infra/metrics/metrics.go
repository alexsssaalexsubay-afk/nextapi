package metrics

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	Requests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "nextapi_http_requests_total",
		Help: "Total HTTP requests by route, method, status.",
	}, []string{"route", "method", "status"})

	Latency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "nextapi_http_request_duration_seconds",
		Help:    "Request latency by route.",
		Buckets: []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10},
	}, []string{"route"})

	JobsByStatus = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "nextapi_jobs_by_status",
		Help: "Current jobs count by status.",
	}, []string{"status"})

	ProviderHealthy = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "nextapi_provider_healthy",
		Help: "1 if provider healthy, 0 otherwise.",
	}, []string{"provider"})
)

// Middleware records request count + duration.
func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		route := c.FullPath()
		if route == "" {
			route = "unknown"
		}
		status := strconv.Itoa(c.Writer.Status())
		Requests.WithLabelValues(route, c.Request.Method, status).Inc()
		Latency.WithLabelValues(route).Observe(time.Since(start).Seconds())
	}
}
