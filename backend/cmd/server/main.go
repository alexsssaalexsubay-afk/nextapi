package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/abuse"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/aiprovider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	batchsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/batch"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/director"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/director/vimaxruntime"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/gateway"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/idempotency"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/config"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/db"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/httpx"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/metrics"
	mw "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/middleware"
	rdc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/infra/redis"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/job"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/moderation"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/notify"
	pricingsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/pricing"
	projsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/project"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider/uptoken"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/providerfactory"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/ratelimit"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/spend"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/storage/r2"
	tmplsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/template"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/videomerge"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/webhook"
	workflowsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/workflow"
	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/pressly/goose/v3"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	migrateOnly := flag.Bool("migrate", false, "run migrations and exit")
	flag.Parse()

	cfg := config.Load()

	gormDB, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}

	if *migrateOnly {
		sqlDB, err := gormDB.DB()
		if err != nil {
			log.Fatalf("sql db: %v", err)
		}
		if err := goose.Up(sqlDB, "migrations"); err != nil {
			log.Fatalf("migrate: %v", err)
		}
		log.Println("migrations complete")
		return
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
	pricingSvc := pricingsvc.NewService(gormDB)
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
	jobSvc.SetPricing(pricingSvc)
	workflowSvc := workflowsvc.NewService(gormDB, jobSvc)
	workflowSvc.SetThroughput(throughputSvc)
	workflowSvc.SetMergeService(videomerge.NewService(gormDB))
	aiProviderSvc := aiprovider.NewService(gormDB)
	aiRuntime := aiprovider.NewRuntime(aiProviderSvc)
	directorSvc := director.NewService(aiRuntime)
	directorSvc.SetImageGenerator(aiRuntime)
	directorSvc.SetStoryPlanner(vimaxruntime.NewRunner(vimaxruntime.RunnerConfig{
		EndpointURL:     os.Getenv("VIMAX_RUNTIME_URL"),
		RuntimeToken:    os.Getenv("DIRECTOR_SIDECAR_TOKEN"),
		CallbackBaseURL: envOr("DIRECTOR_RUNTIME_CALLBACK_URL", "http://127.0.0.1:8080/v1/internal/director-runtime"),
		CallbackToken:   os.Getenv("DIRECTOR_RUNTIME_TOKEN"),
		AllowFallback:   os.Getenv("VIMAX_RUNTIME_DISABLE_FALLBACK") != "true",
	}))

	notifier := notify.New()

	h := gateway.New(authSvc, billSvc)
	vh := &gateway.VideoHandlers{Jobs: jobSvc, DB: gormDB}
	whh := &gateway.WebhookHandlers{DB: gormDB, Webhooks: whSvc}
	wdh := &gateway.WebhookDeliveryHandlers{DB: gormDB, Webhooks: whSvc}
	ah := &gateway.AdminHandlers{DB: gormDB, Billing: billSvc, Spend: spendSvc, Throughput: throughputSvc, Notify: notifier}
	ph := gateway.NewPaymentHandlers(billSvc, gormDB)
	ph.Pricing = pricingSvc
	seedanceWebhook := &gateway.UpTokenWebhookHandlers{DB: gormDB, Spend: spendSvc, Throughput: throughputSvc, Pricing: pricingSvc}
	hook := &gateway.ClerkWebhook{DB: gormDB, Billing: billSvc}
	models := gateway.ModelsHandlers{}
	sh := &gateway.SpendHandlers{Svc: spendSvc, DB: gormDB}
	th := &gateway.ThroughputHandlers{Svc: throughputSvc}
	mh := &gateway.ModerationHandlers{Svc: modSvc}
	accountAuth := &gateway.AccountAuthHandlers{DB: gormDB, Auth: authSvc, Billing: billSvc, Redis: rClient, Notify: notifier}
	rl := &ratelimit.Limiter{Client: rClient}
	idem := &idempotency.Middleware{DB: gormDB}

	r := gin.New()
	// Gin's default trusts every X-Forwarded-For hop, which means a
	// remote attacker can spoof their ClientIP() and silently bypass
	// per-IP rate limits, key IP allowlists, /metrics IP allowlist,
	// and pollute audit_log.actor_ip. Pin the trusted proxy set to
	// the local nginx (which is the only thing that should ever talk
	// to us on 127.0.0.1:8080 now that SERVER_ADDR is loopback).
	// CF-Connecting-IP is preferred when it's set so we still get the
	// real client IP behind Cloudflare without trusting hostile XFF.
	if err := r.SetTrustedProxies([]string{"127.0.0.1", "::1"}); err != nil {
		log.Fatalf("trusted proxies: %v", err)
	}
	r.RemoteIPHeaders = []string{"CF-Connecting-IP", "X-Real-IP", "X-Forwarded-For"}
	r.Use(gin.Recovery(), httpx.SecureHeaders(), httpx.RequestID(), metrics.Middleware(), mw.RequestLogger(gormDB))
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

	sales := &gateway.SalesHandlers{DB: gormDB, Notify: notifier}

	v1 := r.Group("/v1")
	v1.GET("/health", okJSON)
	drh := &gateway.DirectorRuntimeHandlers{Text: aiRuntime, Image: aiRuntime, Token: os.Getenv("DIRECTOR_RUNTIME_TOKEN")}
	directorRuntime := v1.Group("/internal/director-runtime")
	directorRuntime.Use(ratelimit.Middleware(rl, 300, time.Minute))
	directorRuntime.POST("/text", drh.TextCompletion)
	directorRuntime.POST("/image", drh.ImageGeneration)
	v1.POST("/webhooks/clerk", hook.Handle)
	v1.POST("/webhooks/payments/:provider", ph.Webhook)
	// Sales inquiry — public, costs us a notification round-trip per call,
	// so layer Turnstile + a tight rate limit. Turnstile is no-op when
	// TURNSTILE_SECRET_KEY is unset, which keeps local dev frictionless.
	v1.POST("/sales/inquiry",
		abuse.Turnstile(),
		ratelimit.Middleware(rl, 10, time.Hour),
		sales.Inquiry)

	// First-party account auth. Signup is invite-only by default; operators
	// create early customer accounts from the internal admin API, then users
	// sign in here with the assigned email/password.
	v1.POST("/auth/login", ratelimit.Middleware(rl, 20, time.Minute), accountAuth.Login)
	v1.POST("/auth/signup", ratelimit.Middleware(rl, 10, time.Hour), accountAuth.Signup)
	v1.POST("/auth/send-code", ratelimit.Middleware(rl, 10, time.Hour), accountAuth.SendOTP)
	v1.POST("/auth/otp/send", ratelimit.Middleware(rl, 10, time.Hour), accountAuth.SendOTP)
	v1.GET("/auth/session", accountAuth.Session)
	v1.POST("/auth/logout", accountAuth.Logout)

	// Compatibility aliases for first-party web flows that are documented as
	// /api/*. They reuse the same handlers and auth middleware as /v1/*, so
	// payment and account state still live in the single Go backend.
	apiCompat := r.Group("/api")
	apiCompat.POST("/auth/send-code", ratelimit.Middleware(rl, 10, time.Hour), accountAuth.SendOTP)
	apiCompat.POST("/auth/login", ratelimit.Middleware(rl, 20, time.Minute), accountAuth.Login)
	apiCompat.GET("/pay/notify", ph.Webhook)
	apiCompat.POST("/pay/notify", ph.Webhook)
	apiCompat.POST("/webhooks/seedance", seedanceWebhook.Handle)

	// Clerk-session → API-key bridge (Group A fix). The dashboard / admin SPAs
	// hit these on first load with a Clerk JWT and exchange it for the
	// appropriate credential. Heavily rate-limited because key minting is
	// state-changing.
	clerkVerifier := auth.NewClerkVerifier()
	bh := &gateway.BootstrapHandlers{DB: gormDB, Auth: authSvc, Billing: billSvc, Clerk: clerkVerifier}
	// Bootstrap endpoints intentionally do NOT require Turnstile:
	// they already require a valid Clerk-signed JWT (RS256 + JWKS),
	// which an unattended bot can't forge without a Clerk session,
	// and they're rate-limited per-IP. Adding Turnstile would require
	// the dashboard / admin SPA to mint a Cloudflare challenge token
	// before its very first API call, which deadlocks the login flow
	// on a cold tab. Keep Turnstile only for genuinely-public endpoints
	// (sales/inquiry, future signup).
	v1.POST("/me/bootstrap",
		ratelimit.Middleware(rl, 30, time.Minute),
		bh.MeBootstrap)

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

	// Batch runs — first-class batch entity.
	batchService := batchsvc.NewService(gormDB, jobSvc)
	batchService.SetThroughput(throughputSvc)
	workflowSvc.SetBatchService(batchService)
	bh2 := &gateway.BatchHandlers{Svc: batchService, Throughput: throughputSvc}
	api.POST("/batch/runs", idem.Handle(), bh2.Create)
	api.GET("/batch/runs", bh2.List)
	api.GET("/batch/runs/:id", bh2.Get)
	api.GET("/batch/runs/:id/jobs", bh2.ListJobs)
	api.POST("/batch/runs/:id/retry-failed", bh2.RetryFailed)
	api.GET("/batch/runs/:id/manifest", bh2.DownloadManifest)

	// Templates
	tmplService := tmplsvc.NewService(gormDB)
	tmplH := &gateway.TemplateHandlers{Svc: tmplService, WorkflowSvc: workflowSvc, DB: gormDB}
	api.GET("/templates", tmplH.List)
	api.GET("/templates/:id", tmplH.Get)
	api.POST("/templates", tmplH.Create)
	api.POST("/templates/:id/use", tmplH.Use)
	api.POST("/templates/:id/run", idem.Handle(), tmplH.Run)
	api.POST("/templates/:id/run-batch", idem.Handle(), tmplH.RunBatch)
	api.POST("/templates/:id/duplicate", tmplH.Duplicate)
	api.DELETE("/templates/:id", tmplH.Delete)

	// Projects & workspace
	projService := projsvc.NewService(gormDB)
	projH := &gateway.ProjectHandlers{Svc: projService}
	api.GET("/projects", projH.List)
	api.POST("/projects", projH.Create)
	api.GET("/projects/:id", projH.Get)
	api.PATCH("/projects/:id", projH.Update)
	api.DELETE("/projects/:id", projH.Delete)
	api.GET("/projects/:id/assets", projH.ListAssets)
	api.POST("/projects/:id/assets", projH.CreateAsset)
	api.DELETE("/projects/:id/assets/:assetId", projH.DeleteAsset)

	uploadH := &gateway.MediaUploadHandlers{}
	if r2c, r2err := r2.New(); r2err == nil {
		uploadH.R2 = r2c
	} else {
		log.Printf("r2: %v (dashboard image upload disabled; configure R2 env)", r2err)
	}

	workflowH := &gateway.WorkflowHandlers{Svc: workflowSvc}
	api.GET("/workflows", workflowH.List)
	api.POST("/workflows", workflowH.Create)
	api.GET("/workflows/:id", workflowH.Get)
	api.PATCH("/workflows/:id", workflowH.Update)
	api.POST("/workflows/:id/duplicate", workflowH.Duplicate)
	api.POST("/workflows/:id/run", workflowH.Run)
	api.GET("/workflows/:id/versions", workflowH.ListVersions)
	api.POST("/workflows/:id/versions", workflowH.CreateVersion)
	api.POST("/workflows/:id/versions/:versionId/restore", workflowH.RestoreVersion)
	api.POST("/workflows/:id/save-as-template", workflowH.SaveAsTemplate)
	api.POST("/workflows/:id/export-api", workflowH.ExportAPI)
	directorH := &gateway.DirectorHandlers{Service: directorSvc, WorkflowSvc: workflowSvc, DB: gormDB, R2: uploadH.R2}
	directorGroup := api.Group("/director")
	directorGroup.Use(ratelimit.Middleware(rl, 30, time.Minute))
	directorGroup.GET("/status", directorH.Status)
	directorGroup.POST("/mode/run", directorH.RunDirectorMode)
	directorGroup.POST("/generate-shots", directorH.GenerateShots)
	directorGroup.POST("/generate-shot-images", directorH.GenerateShotImages)
	directorGroup.POST("/workflows", directorH.BuildWorkflow)

	api.GET("/videos", vids.List)
	api.GET("/videos/:id", vids.Get)
	api.POST("/videos/:id/retry", vids.Retry)
	api.DELETE("/videos/:id", vids.Delete)
	api.GET("/videos/:id/wait", vids.Wait)

	ob := &gateway.OrgBillingHandlers{DB: gormDB}
	api.GET("/billing/settings", ob.GetBillingSettings)
	api.PATCH("/billing/settings", ob.UpdateBillingSettings)
	// Expose org-scoped ledger / usage to dashboard session keys so signed-in
	// users can see their own top-ups, reservations, refunds, admin
	// adjustments, and per-day usage from the in-product UI. Use a /me/ path
	// to avoid colliding with the ak_* admin routes registered below, which
	// share the same v1 base. Handlers scope by auth.OrgFrom either way.
	api.GET("/me/billing/ledger", h.Ledger)
	api.GET("/me/billing/usage", h.Usage)
	api.GET("/pay/status", ph.Status)
	api.POST("/pay/create", ph.CreateTopup)

	apiPayCompat := apiCompat.Group("")
	apiPayCompat.Use(auth.Business(authSvc))
	apiPayCompat.Use(ratelimit.Middleware(rl, 600, time.Minute))
	apiPayCompat.Use(ratelimit.PerKey(rl))
	apiPayCompat.POST("/pay/create", ph.CreateTopup)

	// Self-service webhook management (sk_* keys manage their own org's webhooks)
	api.GET("/webhooks", whh.List)
	api.POST("/webhooks", whh.Create)
	api.GET("/webhooks/:id", whh.Get)
	api.DELETE("/webhooks/:id", whh.Delete)
	api.GET("/webhooks/:id/deliveries", wdh.ListDeliveries)
	api.POST("/webhooks/:id/rotate", wdh.RotateSecret)

	// Self-service key management (sk_* keys can manage their own org's keys)
	api.POST("/me/uploads/image", uploadH.PostImage)
	api.POST("/me/uploads/media", uploadH.PostMedia)

	mktH := &gateway.MarketingSiteHandlers{DB: gormDB, R2: uploadH.R2}
	v1.GET("/public/marketing/slots", ratelimit.Middleware(rl, 120, time.Minute), mktH.PublicListSlots)

	libraryH := &gateway.MediaLibraryHandlers{DB: gormDB, R2: uploadH.R2}
	if os.Getenv("SEEDANCE_RELAY_ASSETS_ENABLED") == "true" {
		if assets, err := uptoken.NewAssetClientFromEnv(); err == nil {
			libraryH.UpTokenAssets = assets
		} else {
			log.Printf("seedance relay assets: %v (asset registration disabled)", err)
		}
	}
	api.GET("/me/library/assets", libraryH.List)
	api.POST("/me/library/assets", libraryH.Create)
	api.DELETE("/me/library/assets/:id", libraryH.Delete)

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
	// Webhook CRUD lives only on the business (sk_*) group above. Registering
	// the same paths here too makes Gin panic ("handlers are already registered").
	// ak_* keys that need webhook ops should use a live sk_* from the same org.
	admn.GET("/throughput", th.GetThroughput)
	admn.GET("/moderation_profile", mh.GetProfile)
	admn.PUT("/moderation_profile", mh.UpsertProfile)
	// /billing/settings is on the api (Business) group — no duplicate here.

	// Admin session + OTP endpoints.
	// Session creation uses Clerk JWT directly (not X-Op-Session — it creates one).
	// OTP send and revocation require an existing session via AdminMiddleware.
	ash := &gateway.AdminSessionHandlers{
		DB:     gormDB,
		Clerk:  clerkVerifier,
		Notify: notifier,
		Allow:  gateway.NormalizeAdminEmails(os.Getenv("ADMIN_EMAILS")),
	}
	adminMeta := v1.Group("/internal/admin")
	adminMeta.POST("/session", ash.CreateSession)
	adminMeta.POST("/session/password", ratelimit.Middleware(rl, 20, time.Minute), ash.CreatePasswordSession)
	adminMeta.Use(gateway.AdminMiddleware(clerkVerifier, gormDB))
	adminMeta.DELETE("/session", ash.RevokeSession)
	adminMeta.POST("/otp/send", ash.SendOTP)

	// Internal operator panel (X-Op-Session, Clerk JWT, or X-Admin-Token).
	internal := v1.Group("/internal/admin")
	internal.Use(gateway.AdminMiddleware(clerkVerifier, gormDB))
	internal.Use(ratelimit.Middleware(rl, 120, time.Minute))
	internal.GET("/overview", ah.OverviewStats)
	internal.GET("/users", ah.Users)
	internal.POST("/users", accountAuth.AdminCreateManagedAccount)
	internal.PATCH("/users/:id/password", accountAuth.AdminSetPassword)
	internal.GET("/orgs", ah.Orgs)
	internal.POST("/orgs/:id/pause", ah.PauseOrg)
	internal.GET("/jobs", ah.Jobs)
	internal.POST("/jobs/:id/cancel", ah.CancelJob)
	internal.GET("/billing/ledger", ah.AllLedger)
	internal.GET("/operator-budget", ah.GetOperatorBudget)
	internal.PUT("/operator-budget", ah.PutOperatorBudget)
	internal.GET("/pricing/settings", ah.GetPricingSettings)
	internal.PUT("/pricing/settings", ah.PutPricingSettings)
	internal.GET("/pricing/tiers", ah.ListPricingTiers)
	internal.POST("/pricing/tiers", ah.CreatePricingTier)
	internal.PATCH("/pricing/tiers/:id", ah.PatchPricingTier)
	internal.DELETE("/pricing/tiers/:id", ah.DeletePricingTier)
	internal.GET("/pricing/margins", ah.PricingMargins)
	internal.GET("/leads", ah.Leads)
	internal.PATCH("/leads/:id/contacted", ah.MarkLeadContacted)
	internal.POST("/credits/adjust", ah.AdjustCredits)
	internal.POST("/orgs/:id/unpause", sh.Unpause)
	internal.PUT("/orgs/:id/throughput", th.AdminUpsertThroughput)
	internal.PUT("/orgs/:id/moderation", mh.AdminUpsertProfile)
	internal.GET("/orgs/:id/pricing", ah.GetOrgPricing)
	internal.PATCH("/orgs/:id/pricing", ah.PatchOrgPricing)
	internal.GET("/moderation/events", mh.AdminListEvents)
	internal.PATCH("/moderation/events/:id", mh.AdminAddNote)
	internal.PATCH("/orgs/:id", ob.AdminUpdateOrg)
	internal.POST("/webhooks/deliveries/:id/replay", wdh.AdminReplay)
	internal.GET("/audit", ah.Audit)
	internal.GET("/marketing/slots", mktH.AdminListSlots)
	internal.PUT("/marketing/slots/:slot", mktH.AdminPutExternal)
	internal.POST("/marketing/slots/:slot/upload", mktH.AdminUploadSlot)
	internal.DELETE("/marketing/slots/:slot", mktH.AdminDeleteSlot)
	internal.GET("/ai-providers", ah.ListAIProviders)
	internal.POST("/ai-providers", ah.CreateAIProvider)
	internal.PATCH("/ai-providers/:id", ah.PatchAIProvider)
	internal.DELETE("/ai-providers/:id", ah.DeleteAIProvider)
	internal.POST("/ai-providers/:id/default", ah.SetDefaultAIProvider)
	internal.POST("/ai-providers/:id/test", ah.TestAIProvider)
	internal.GET("/ai-provider-logs", ah.ListAIProviderLogs)
	internal.GET("/ai-director/status", ah.AdminAIDirectorStatus)
	internal.GET("/orgs/:id/ai-director", ah.GetAIDirectorEntitlement)
	internal.PUT("/orgs/:id/ai-director", ah.PutAIDirectorEntitlement)

	// Enhanced admin job tools.
	ajh := &gateway.AdminJobHandlers{DB: gormDB, JobSvc: jobSvc, Billing: billSvc, Spend: spendSvc, Throughput: throughputSvc}
	internal.GET("/jobs/search", ajh.ListJobs)
	internal.GET("/jobs/:id/detail", ajh.GetJob)
	internal.POST("/jobs/:id/retry", ajh.RetryJob)
	internal.POST("/jobs/:id/force-cancel", ajh.CancelJob)
	internal.GET("/request-logs", ajh.ListRequestLogs)
	internal.GET("/dead-letter", ajh.ListDeadLetter)
	internal.POST("/dead-letter/:id/replay", ajh.ReplayDeadLetter)

	log.Printf("nextapi server listening on %s (provider=%s)", cfg.ServerAddr, prov.Name())
	if err := r.Run(cfg.ServerAddr); err != nil {
		log.Fatal(err)
	}
}

func okJSON(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
