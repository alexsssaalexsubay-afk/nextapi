package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Job lifecycle counters and histograms.
var (
	// JobsTotal counts every job that reaches a terminal state.
	// Labels: provider, status (succeeded|failed|timed_out|canceled)
	JobsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "nextapi_jobs_total",
		Help: "Total jobs reaching a terminal state.",
	}, []string{"provider", "status"})

	// JobsFailedTotal counts terminal failures, labelled by root cause.
	// Labels: provider, error_code
	JobsFailedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "nextapi_jobs_failed_total",
		Help: "Total failed jobs by provider and error code.",
	}, []string{"provider", "error_code"})

	// RetryTotal counts individual retry attempts (not terminal failures).
	// Labels: provider, error_code (the error that triggered the retry)
	RetryTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "nextapi_retry_total",
		Help: "Total retry attempts by provider and trigger error code.",
	}, []string{"provider", "error_code"})

	// ProviderLatency records time from submit to provider ack (ms).
	// Labels: provider
	ProviderLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "nextapi_provider_latency_ms",
		Help:    "Provider submit latency in milliseconds.",
		Buckets: []float64{50, 100, 250, 500, 1000, 2000, 5000, 10000},
	}, []string{"provider"})

	// EndToEndJobLatency records full job wall-clock time from creation to completion (ms).
	// Labels: provider, status
	EndToEndJobLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "nextapi_end_to_end_job_latency_ms",
		Help:    "End-to-end job latency in milliseconds (creation to terminal state).",
		Buckets: []float64{1000, 5000, 15000, 30000, 60000, 120000, 300000, 600000},
	}, []string{"provider", "status"})

	// WebhookDeliveryTotal counts webhook delivery attempts.
	// Labels: event_type, result (success|failure)
	WebhookDeliveryTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "nextapi_webhook_delivery_total",
		Help: "Total webhook delivery attempts by event type and result.",
	}, []string{"event_type", "result"})

	// RateLimitBlockTotal counts requests blocked by rate limits.
	// Labels: key_type (api_key|org|endpoint), endpoint
	RateLimitBlockTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "nextapi_rate_limit_block_total",
		Help: "Total requests blocked by rate limiting.",
	}, []string{"key_type", "endpoint"})

	// BatchRunsTotal counts batch runs by terminal status.
	// Labels: status
	BatchRunsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "nextapi_batch_runs_total",
		Help: "Total batch runs reaching a terminal state.",
	}, []string{"status"})

	// DeadLetterTotal counts jobs archived to the dead-letter queue.
	// Labels: provider, error_code
	DeadLetterTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "nextapi_dead_letter_total",
		Help: "Total jobs archived to the dead-letter queue.",
	}, []string{"provider", "error_code"})

	// CreditBalance is a gauge tracking the current credit balance per org
	// (updated after each credit transaction — best-effort, not guaranteed exact).
	CreditBalance = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "nextapi_credit_balance",
		Help: "Approximate current credit balance per org.",
	}, []string{"org_id"})
)
