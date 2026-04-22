package throughput

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/sanidg/nextapi/backend/internal/domain"
	"gorm.io/gorm"
)

var (
	ErrBurstExceeded = errors.New("rate_limited.burst_exceeded")
)

const (
	slotTTL   = 10 * time.Minute
	keyPrefix = "throughput:"
)

type Service struct {
	db    *gorm.DB
	redis *redis.Client
}

func NewService(db *gorm.DB, redis *redis.Client) *Service {
	return &Service{db: db, redis: redis}
}

func (s *Service) Get(ctx context.Context, orgID string) (*domain.ThroughputConfig, int, error) {
	cfg, err := s.getOrDefault(ctx, orgID)
	if err != nil {
		return nil, 0, err
	}
	inFlight, _ := s.InFlight(ctx, orgID)
	return cfg, inFlight, nil
}

func (s *Service) getOrDefault(ctx context.Context, orgID string) (*domain.ThroughputConfig, error) {
	var cfg domain.ThroughputConfig
	err := s.db.WithContext(ctx).Where("org_id = ?", orgID).First(&cfg).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &domain.ThroughputConfig{
			OrgID:               orgID,
			ReservedConcurrency: 2,
			BurstConcurrency:    8,
			PriorityLane:        "standard",
			RPMLimit:            60,
		}, nil
	}
	return &cfg, err
}

type UpsertInput struct {
	ReservedConcurrency *int
	BurstConcurrency    *int
	PriorityLane        *string
	RPMLimit            *int
}

func (s *Service) Upsert(ctx context.Context, orgID string, in UpsertInput) (*domain.ThroughputConfig, error) {
	var existing domain.ThroughputConfig
	found := s.db.WithContext(ctx).Where("org_id = ?", orgID).First(&existing).Error == nil

	cfg := &existing
	if !found {
		cfg = &domain.ThroughputConfig{
			OrgID:               orgID,
			ReservedConcurrency: 2,
			BurstConcurrency:    8,
			PriorityLane:        "standard",
			RPMLimit:            60,
			QueueTier:           "default",
		}
	}
	if in.ReservedConcurrency != nil {
		cfg.ReservedConcurrency = *in.ReservedConcurrency
	}
	if in.BurstConcurrency != nil {
		cfg.BurstConcurrency = *in.BurstConcurrency
	}
	if in.PriorityLane != nil {
		cfg.PriorityLane = *in.PriorityLane
	}
	if in.RPMLimit != nil {
		cfg.RPMLimit = *in.RPMLimit
	}
	cfg.UpdatedAt = time.Now()

	var err error
	if found {
		err = s.db.WithContext(ctx).Where("org_id = ?", orgID).Updates(cfg).Error
	} else {
		err = s.db.WithContext(ctx).Create(cfg).Error
	}
	if err != nil {
		return nil, err
	}
	return cfg, nil
}

// AcquireForKey checks per-key concurrency limit before org-level limits.
func (s *Service) AcquireForKey(ctx context.Context, orgID, apiKeyID, jobID string) error {
	if apiKeyID != "" {
		var keyCap int
		s.db.WithContext(ctx).Raw(
			`SELECT COALESCE(provisioned_concurrency, 5) FROM api_keys WHERE id = ?`, apiKeyID).Scan(&keyCap)
		if keyCap > 0 {
			keySlotKey := keyPrefix + "key:" + apiKeyID
			current, err := s.redis.SCard(ctx, keySlotKey).Result()
			if err != nil && !errors.Is(err, redis.Nil) {
				return err
			}
			if int(current) >= keyCap {
				return ErrBurstExceeded
			}
			pipe := s.redis.Pipeline()
			pipe.SAdd(ctx, keySlotKey, jobID)
			pipe.Expire(ctx, keySlotKey, slotTTL)
			if _, err = pipe.Exec(ctx); err != nil {
				return err
			}
		}
	}
	return s.Acquire(ctx, orgID, jobID)
}

// Acquire attempts to claim a concurrency slot for a job. Returns
// ErrBurstExceeded if burst_concurrency is already reached.
func (s *Service) Acquire(ctx context.Context, orgID, jobID string) error {
	cfg, _ := s.getOrDefault(ctx, orgID)
	key := keyPrefix + orgID

	current, err := s.redis.SCard(ctx, key).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return err
	}
	if int(current) >= cfg.BurstConcurrency {
		return ErrBurstExceeded
	}

	pipe := s.redis.Pipeline()
	pipe.SAdd(ctx, key, jobID)
	pipe.Expire(ctx, key, slotTTL)
	_, err = pipe.Exec(ctx)
	return err
}

// ReleaseForKey frees both per-key and per-org concurrency slots.
func (s *Service) ReleaseForKey(ctx context.Context, orgID string, apiKeyID *string, jobID string) error {
	if apiKeyID != nil && *apiKeyID != "" {
		keySlotKey := keyPrefix + "key:" + *apiKeyID
		s.redis.SRem(ctx, keySlotKey, jobID)
	}
	return s.Release(ctx, orgID, jobID)
}

// Release frees a concurrency slot when a job completes or fails.
func (s *Service) Release(ctx context.Context, orgID, jobID string) error {
	key := keyPrefix + orgID
	return s.redis.SRem(ctx, key, jobID).Err()
}

// InFlight returns the current number of active jobs for an org.
func (s *Service) InFlight(ctx context.Context, orgID string) (int, error) {
	key := keyPrefix + orgID
	n, err := s.redis.SCard(ctx, key).Result()
	if errors.Is(err, redis.Nil) {
		return 0, nil
	}
	return int(n), err
}

// QueueForOrg returns the Asynq queue name. Uses QueueTier if explicitly
// set to a non-default value, otherwise falls back to PriorityLane.
func (s *Service) QueueForOrg(ctx context.Context, orgID string) string {
	cfg, _ := s.getOrDefault(ctx, orgID)
	tier := cfg.QueueTier
	if tier == "" || tier == "default" {
		tier = cfg.PriorityLane
	}
	switch tier {
	case "critical":
		return "critical"
	case "dedicated":
		return "dedicated"
	case "priority":
		return "priority"
	default:
		return "default"
	}
}

// QueueForKey returns the Asynq queue based on per-key provisioned concurrency.
// Keys with provisioned_concurrency >= 50 go to queue:critical.
func (s *Service) QueueForKey(ctx context.Context, orgID string, apiKeyID *string) string {
	if apiKeyID != nil && *apiKeyID != "" {
		var cap int
		s.db.WithContext(ctx).Raw(
			`SELECT COALESCE(provisioned_concurrency, 5) FROM api_keys WHERE id = ?`, *apiKeyID).Scan(&cap)
		if cap >= 50 {
			return "critical"
		}
	}
	return s.QueueForOrg(ctx, orgID)
}
