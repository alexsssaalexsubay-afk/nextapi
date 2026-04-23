package main

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/sanidg/nextapi/backend/internal/abuse"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/billing"
	"github.com/sanidg/nextapi/backend/internal/gateway"
	"github.com/sanidg/nextapi/backend/internal/idempotency"
	"github.com/sanidg/nextapi/backend/internal/infra/config"
	"github.com/sanidg/nextapi/backend/internal/infra/db"
	"github.com/sanidg/nextapi/backend/internal/infra/httpx"
	"github.com/sanidg/nextapi/backend/internal/infra/metrics"
	rdc "github.com/sanidg/nextapi/backend/internal/infra/redis"
	"github.com/sanidg/nextapi/backend/internal/job"
	"github.com/sanidg/nextapi/backend/internal/providerfactory"
	"github.com/sanidg/nextapi/backend/internal/ratelimit"
	"github.com/sanidg/nextapi/backend/internal/moderation"
	"github.com/sanidg/nextapi/backend/internal/spend"
	"github.com/sanidg/nextapi/backend/internal/throughput"
	"github.com/sanidg/nextapi/backend/internal/webhook"
)

func main() {
	cfg := config.Load()

	gormDB, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	prov, err := providerfactory.Default()
	if err != nil {
		log.Fatalf("provider: %v", err)
	}

	redisOpt := asynq.RedisClientOpt{Addr: cfg.RedisAddr}
	queue := asynq.NewClient(redisOpt)
	defer queue.Close()
	rClient := rdc.New(cfg.RedisAddr)

	authSvc := auth.NewService(gormDB)
	billSvc := billing.NewService(gormDB)
	whSvc := webhook.NewService(gormDB)
	jobSvc := job.NewService(gormDB, billSvc, prov, queue)
	spendSvc := spend.NewService(gormDB)
	spendSvc.SetRedis(rClient)
	spendSvc.SetWebhooks(whSvc)
	throughputSvc := throughput.NewService(gormDB, rClient)
	modSvc := moderation.NewService(gormDB)
	jobSvc.SetSpend(spendSvc)
	jobSvc.SetThroughput(throughputSvc)
	jobSvc.SetModeration(modSvc)

	h := gateway.New(authSvc, billSvc)
	vh := &gateway.VideoHandlers{Jobs: jobSvc, DB: gormDB}
	whh := &gateway.WebhookHandlers{DB: gormDB}
	wdh := &gateway.WebhookDeliveryHandlers{Webhooks: whSvc}
	ah := &gateway.AdminHandlers{DB: gormDB, Billing: billSvc, Spend: spendSvc, Throughput: throughputSvc}
	ph := gateway.NewPaymentHandlers(billSvc)
	hook := &gateway.ClerkWebhook{DB: gormDB, Billing: billSvc}
	models := gateway.ModelsHandlers{}
	sh := &gateway.SpendHandlers{Svc: spendSvc}
	th := &gateway.ThroughputHandlers{Svc: throughputSvc}
	mh := &gateway.ModerationHandlers{Svc: modSvc}
	rl := &ratelimit.Limiter{Client: rClient}
	idem := &idempotency.Middleware{DB: gormDB}

	r := gin.New()
	r.Use(gin.Recovery(), httpx.RequestID(), metrics.Middleware())
	r.Use(httpx.CORS([]string{
		"https://nextapi.top",
		"https://app.nextapi.top",
		"https://admin.nextapi.top",
		"http://localhost:3000",
		"http://localhost:3001",
		"http://localhost:3002",
	}))

	r.GET("/health", okJSON)
	// /metrics is auth'd via dedicated middleware (Basic auth or IP
	// allowlist) so Prometheus scrapers don't need the human ADMIN_TOKEN
	// — that token is way too dangerous to hand to a scrape job.
	r.GET("/metrics", metrics.Auth(), gin.WrapH(promhttp.Handler()))

	sales := &gateway.SalesHandlers{}

	v1 := r.Group("/v1")
	v1.GET("/health", okJSON)
	v1.POST("/webhooks/clerk", hook.Handle)
	v1.POST("/webhooks/payments/:provider", ph.Webhook)
	// Sales inquiry — public, costs us a notification round-trip per call,
	// so layer Turnstile + a tight rate limit. Turnstile is no-op when
	// TURNSTILE_SECRET_KEY is unset, which keeps local dev frictionless.
	v1.POST("/sales/inquiry",
		abuse.Turnstile(),
		ratelimit.Middleware(rl, 10, time.Hour),
		sales.Inquiry)

	// Clerk-session → API-key bridge (Group A fix). The dashboard / admin SPAs
	// hit these on first load with a Clerk JWT and exchange it for the
	// appropriate credential. Heavily rate-limited because key minting is
	// state-changing.
	clerkVerifier := auth.NewClerkVerifier()
	bh := &gateway.BootstrapHandlers{DB: gormDB, Auth: authSvc, Billing: billSvc, Clerk: clerkVerifier}
	v1.POST("/me/bootstrap",
		abuse.Turnstile(),
		ratelimit.Middleware(rl, 30, time.Minute),
		bh.MeBootstrap)
	v1.POST("/me/admin-bootstrap",
		abuse.Turnstile(),
		ratelimit.Middleware(rl, 10, time.Minute),
		bh.AdminBootstrap)

	// Business surface (sk_* keys).
	api := v1.Group("")
	api.Use(auth.Business(authSvc))
	api.Use(ratelimit.Middleware(rl, 600, time.Minute))
	// Per-key RPM cap (the rate_limit_rpm column on the API key). No-op
	// when unset on the key, so this is safe to layer over the route
	// default and any later per-org caps.
	api.Use(ratelimit.PerKey(rl))
	api.GET("/auth/me", h.AuthMe)
	api.GET("/models", models.List)
	api.GET("/models/:model_id", models.Get)

	// Legacy video/jobs endpoints — kept for backwards compat.
	api.POST("/video/generations", idem.Handle(), vh.Generate)
	api.GET("/jobs/:id", vh.Get)

	// New /videos surface — full B2B pipeline (spend + throughput + moderation + idempotency).
	vids := &gateway.VideosHandlers{Jobs: jobSvc, DB: gormDB, Spend: spendSvc, Throughput: throughputSvc}
	api.POST("/videos", idem.Handle(), vids.Create)
	api.GET("/videos", vids.List)
	api.GET("/videos/:id", vids.Get)
	api.DELETE("/videos/:id", vids.Delete)
	api.GET("/videos/:id/wait", vids.Wait)

	ob := &gateway.OrgBillingHandlers{DB: gormDB}
	api.GET("/billing/settings", ob.GetBillingSettings)
	api.PATCH("/billing/settings", ob.UpdateBillingSettings)

	// Self-service key management (sk_* keys can manage their own org's keys)
	api.GET("/me/keys", h.ListKeys)
	api.POST("/me/keys", h.CreateKey)
	api.GET("/me/keys/:id", h.GetKey)
	api.PATCH("/me/keys/:id", h.UpdateKey)
	api.DELETE("/me/keys/:id", h.RevokeKey)

	// Admin surface (ak_* keys).
	admn := v1.Group("")
	admn.Use(auth.Admin(authSvc))
	admn.Use(ratelimit.Middleware(rl, 300, time.Minute))
	admn.GET("/keys", h.ListKeys)
	admn.POST("/keys", h.CreateKey)
	admn.GET("/keys/:id", h.GetKey)
	admn.PATCH("/keys/:id", h.UpdateKey)
	admn.DELETE("/keys/:id", h.RevokeKey)
	admn.GET("/credits", h.Balance)
	admn.GET("/billing/ledger", h.Ledger)
	admn.GET("/billing/usage", h.Usage)
	admn.POST("/billing/recharge", h.Recharge)
	admn.POST("/billing/checkout", ph.Checkout)
	exp := &gateway.ExportHandlers{DB: gormDB}
	admn.GET("/usage.csv", exp.UsageCSV)
	admn.GET("/ledger.csv", exp.LedgerCSV)
	admn.GET("/spend_controls", sh.Get)
	admn.PUT("/spend_controls", sh.Put)
	admn.GET("/spend_alerts", sh.ListAlerts)
	admn.GET("/webhooks", whh.List)
	admn.POST("/webhooks", whh.Create)
	admn.GET("/webhooks/:id", whh.Get)
	admn.DELETE("/webhooks/:id", whh.Delete)
	admn.GET("/webhooks/:id/deliveries", wdh.ListDeliveries)
	admn.POST("/webhooks/:id/rotate", wdh.RotateSecret)
	admn.GET("/throughput", th.GetThroughput)
	admn.GET("/moderation_profile", mh.GetProfile)
	admn.PUT("/moderation_profile", mh.UpsertProfile)
	// /billing/settings is on the api (Business) group — no duplicate here.

	// Internal operator panel (shared token, not bearer).
	internal := v1.Group("/internal/admin")
	internal.Use(gateway.AdminMiddleware())
	internal.Use(ratelimit.Middleware(rl, 120, time.Minute))
	internal.GET("/overview", ah.OverviewStats)
	internal.GET("/users", ah.Users)
	internal.GET("/orgs", ah.Orgs)
	internal.POST("/orgs/:id/pause", ah.PauseOrg)
	internal.GET("/jobs", ah.Jobs)
	internal.POST("/jobs/:id/cancel", ah.CancelJob)
	internal.POST("/credits/adjust", ah.AdjustCredits)
	internal.POST("/orgs/:id/unpause", sh.Unpause)
	internal.PUT("/orgs/:id/throughput", th.AdminUpsertThroughput)
	internal.PUT("/orgs/:id/moderation", mh.AdminUpsertProfile)
	internal.GET("/moderation/events", mh.AdminListEvents)
	internal.PATCH("/moderation/events/:id", mh.AdminAddNote)
	internal.PATCH("/orgs/:id", ob.AdminUpdateOrg)
	internal.POST("/webhooks/deliveries/:id/replay", wdh.AdminReplay)
	internal.GET("/audit", ah.Audit)

	log.Printf("nextapi server listening on %s (provider=%s)", cfg.ServerAddr, prov.Name())
	if err := r.Run(cfg.ServerAddr); err != nil {
		log.Fatal(err)
	}
}

func okJSON(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
