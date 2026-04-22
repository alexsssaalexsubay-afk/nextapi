package main

import (
	"context"
	"log"
	"os"
	"os/signal"
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

	go func() {
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

	go func() {
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

	srv := asynq.NewServer(redisOpt, asynq.Config{
		Concurrency: 100,
		Queues: map[string]int{
			"critical":  8,
			"dedicated": 5,
			"priority":  3,
			"default":   1,
		},
	})
	mux := asynq.NewServeMux()
	mux.HandleFunc(job.TaskGenerate, proc.HandleGenerate)
	mux.HandleFunc(job.TaskPoll, proc.HandlePoll)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-sigCh
		log.Println("shutdown signal received, stopping worker...")
		bgCancel()
		srv.Shutdown()
	}()

	log.Printf("nextapi worker starting (provider=%s)", prov.Name())
	if err := srv.Run(mux); err != nil {
		log.Fatal(err)
	}
}
