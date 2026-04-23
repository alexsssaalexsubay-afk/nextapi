package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/hibiken/asynq"
	"github.com/sanidg/nextapi/backend/internal/billing"
	"github.com/sanidg/nextapi/backend/internal/idempotency"
	"github.com/sanidg/nextapi/backend/internal/infra/config"
	"github.com/sanidg/nextapi/backend/internal/infra/db"
	rdc "github.com/sanidg/nextapi/backend/internal/infra/redis"
	"github.com/sanidg/nextapi/backend/internal/job"
	"github.com/sanidg/nextapi/backend/internal/providerfactory"
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

	billSvc := billing.NewService(gormDB)
	whSvc := webhook.NewService(gormDB)
	rClient := rdc.New(cfg.RedisAddr)
	spendSvc := spend.NewService(gormDB)
	spendSvc.SetRedis(rClient)
	throughputSvc := throughput.NewService(gormDB, rClient)
	proc := &job.Processor{DB: gormDB, Billing: billSvc, Spend: spendSvc, Prov: prov, Queue: queue, Webhooks: whSvc, Throughput: throughputSvc}

	bgCtx, bgCancel := context.WithCancel(context.Background())
	defer bgCancel()

	var bg sync.WaitGroup

	// Webhook delivery: tight loop, parallel pool inside DeliverDue.
	bg.Add(1)
	go func() {
		defer bg.Done()
		t := time.NewTicker(5 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-bgCtx.Done():
				return
			case <-t.C:
				if err := whSvc.DeliverDue(bgCtx); err != nil {
					log.Printf("webhook deliver: %v", err)
				}
			}
		}
	}()

	// Idempotency cache cleanup.
	bg.Add(1)
	go func() {
		defer bg.Done()
		t := time.NewTicker(1 * time.Hour)
		defer t.Stop()
		for {
			select {
			case <-bgCtx.Done():
				return
			case <-t.C:
				if err := idempotency.CleanupExpired(bgCtx, gormDB); err != nil {
					log.Printf("idempotency cleanup: %v", err)
				}
			}
		}
	}()

	// Reconciliation: refund stuck jobs every 10 minutes. The interval
	// trades off "how long can a customer's balance stay locked by a
	// dead worker" against "how chatty is recovery" — 10m feels right
	// for a B2B gateway whose median job is 30s.
	recon := &billing.ReconcileService{
		DB: gormDB, Billing: billSvc, Hooks: whSvc,
		StuckAfter: 1 * time.Hour,
	}
	bg.Add(1)
	go func() {
		defer bg.Done()
		// Skip first immediate run so a fresh deploy doesn't false-fail
		// jobs that were genuinely processing during the cut-over.
		t := time.NewTicker(10 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-bgCtx.Done():
				return
			case <-t.C:
				if err := recon.Run(bgCtx); err != nil {
					log.Printf("reconcile: %v", err)
				}
			}
		}
	}()

	// Asynq server with explicit shutdown timeout. Default is 8s, which
	// is shorter than a typical Seedance create call (15s); this used
	// to mean SIGTERM during deploy could orphan an upstream task.
	srv := asynq.NewServer(redisOpt, asynq.Config{
		Concurrency:     100,
		ShutdownTimeout: 60 * time.Second,
		Queues: map[string]int{
			"critical":  8,
			"dedicated": 5,
			"priority":  3,
			"default":   1,
		},
		LogLevel: asynq.InfoLevel,
	})
	mux := asynq.NewServeMux()
	mux.HandleFunc(job.TaskGenerate, proc.HandleGenerate)
	mux.HandleFunc(job.TaskPoll, proc.HandlePoll)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		sig := <-sigCh
		log.Printf("worker: received %s, draining (max 60s)…", sig)
		// Tell asynq to stop accepting and finish in-flight tasks.
		srv.Shutdown()
		// Stop background loops.
		bgCancel()
	}()

	log.Printf("nextapi worker starting (provider=%s, concurrency=100, shutdown_timeout=60s)", prov.Name())
	if err := srv.Run(mux); err != nil {
		log.Fatal(err)
	}

	// Wait for background goroutines to drain after asynq returns.
	done := make(chan struct{})
	go func() { bg.Wait(); close(done) }()
	select {
	case <-done:
		log.Println("worker: clean shutdown complete")
	case <-time.After(15 * time.Second):
		log.Println("worker: forced exit after 15s drain timeout")
	}
}
