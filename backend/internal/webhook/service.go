package webhook

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/sanidg/nextapi/backend/internal/domain"
	"github.com/sanidg/nextapi/backend/internal/infra/metrics"
	"gorm.io/gorm"
)

type Service struct {
	db    *gorm.DB
	http  *http.Client
	guard *SafeDialer
}

func NewService(db *gorm.DB) *Service {
	guard := newSafeDialer()
	return &Service{
		db:    db,
		http:  guard.Client(10 * time.Second),
		guard: guard,
	}
}

// ValidateURL exposes the dialer's URL policy so handlers can reject
// dangerous webhook URLs at create-time, not only at delivery-time.
func (s *Service) ValidateURL(rawURL string) error {
	return s.guard.Validate(rawURL)
}

// Enqueue stores a delivery row; worker picks up based on next_retry_at.
// Matches webhooks by org_id where disabled IS false (v2 schema) OR
// disabled_at IS NULL (v1 compat).
func (s *Service) Enqueue(ctx context.Context, orgID, eventType string, payload any) error {
	var hooks []domain.Webhook
	if err := s.db.WithContext(ctx).
		Where("org_id = ? AND (disabled = false OR disabled_at IS NULL)", orgID).
		Find(&hooks).Error; err != nil {
		return err
	}
	if len(hooks) == 0 {
		return nil
	}
	body, _ := json.Marshal(payload)
	now := time.Now()
	for _, h := range hooks {
		if !matchEvent(h.EventTypes, eventType) {
			continue
		}
		row := domain.WebhookDelivery{
			WebhookID:   h.ID,
			EventType:   eventType,
			Payload:     body,
			NextRetryAt: &now,
		}
		if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

// DeliverDue picks rows whose next_retry_at <= now and attempts delivery
// in parallel with bounded concurrency. Per-org grouping ensures one
// blackholing customer endpoint can't starve every other tenant — we
// only run one delivery per webhook_id per tick.
func (s *Service) DeliverDue(ctx context.Context) error {
	var rows []domain.WebhookDelivery
	if err := s.db.WithContext(ctx).
		Where("delivered_at IS NULL AND next_retry_at <= now()").
		Order("created_at ASC").
		Limit(200).Find(&rows).Error; err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}

	// Dedup by webhook_id: within one tick we only attempt each
	// destination once, oldest event first. The next tick (5s later)
	// will pick up the others, so a slow customer endpoint affects
	// only its own queue depth, not anyone else's.
	seen := make(map[string]bool, len(rows))
	picked := make([]domain.WebhookDelivery, 0, len(rows))
	for _, r := range rows {
		if seen[r.WebhookID] {
			continue
		}
		seen[r.WebhookID] = true
		picked = append(picked, r)
	}

	const workers = 16
	sem := make(chan struct{}, workers)
	for _, r := range picked {
		sem <- struct{}{}
		go func(d domain.WebhookDelivery) {
			defer func() {
				_ = recover() // never let a panic kill the worker
				<-sem
			}()
			// Per-delivery timeout so a hung TCP connect can't pin a worker
			// for the full 30s default.
			dctx, cancel := context.WithTimeout(ctx, 15*time.Second)
			defer cancel()
			_ = s.deliver(dctx, &d)
		}(r)
	}
	// Drain.
	for i := 0; i < workers; i++ {
		sem <- struct{}{}
	}
	return nil
}

// ListDeliveries returns deliveries for a specific webhook, scoped to the org.
func (s *Service) ListDeliveries(ctx context.Context, orgID, webhookID string, limit, offset int) ([]domain.WebhookDelivery, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var wh domain.Webhook
	if err := s.db.WithContext(ctx).Where("id = ? AND org_id = ?", webhookID, orgID).First(&wh).Error; err != nil {
		return nil, err
	}
	var rows []domain.WebhookDelivery
	err := s.db.WithContext(ctx).
		Where("webhook_id = ?", webhookID).
		Order("created_at DESC").
		Limit(limit).Offset(offset).
		Find(&rows).Error
	return rows, err
}

// Replay resets a delivery for immediate re-attempt by the worker ticker.
func (s *Service) Replay(ctx context.Context, deliveryID int64) error {
	now := time.Now()
	return s.db.WithContext(ctx).
		Model(&domain.WebhookDelivery{}).
		Where("id = ?", deliveryID).
		Updates(map[string]any{
			"attempt":      0,
			"next_retry_at": now,
			"delivered_at":  nil,
			"error":         nil,
		}).Error
}

// RotateSecret generates a new secret, preserves the old one for 24h grace.
func (s *Service) RotateSecret(ctx context.Context, orgID, webhookID, newSecret string) (*domain.Webhook, error) {
	var h domain.Webhook
	err := s.db.WithContext(ctx).
		Where("id = ? AND org_id = ?", webhookID, orgID).
		First(&h).Error
	if err != nil {
		return nil, err
	}
	now := time.Now()
	err = s.db.WithContext(ctx).Model(&h).Updates(map[string]any{
		"prev_secret": h.Secret,
		"secret":      newSecret,
		"rotated_at":  now,
	}).Error
	if err != nil {
		return nil, err
	}
	h.Secret = newSecret
	return &h, nil
}

func (s *Service) deliver(ctx context.Context, d *domain.WebhookDelivery) error {
	var h domain.Webhook
	if err := s.db.WithContext(ctx).First(&h, "id = ?", d.WebhookID).Error; err != nil {
		return err
	}
	// SSRF guard: re-validate the URL on every delivery. Validate-on-create
	// is not enough because the customer can change DNS A-records to point
	// at internal IPs after registering. The dialer's Control hook will
	// block at the syscall layer too, but failing fast here saves a TCP RTT.
	if s.guard != nil {
		if err := s.guard.Validate(h.URL); err != nil {
			msg := "url rejected by ssrf guard: " + err.Error()
			return s.markFailure(ctx, d, nil, &msg)
		}
	}
	ts := time.Now().Unix()
	sig := signWithTimestamp(h.Secret, ts, d.Payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", h.URL, bytes.NewReader(d.Payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-NextAPI-Signature", sig)
	req.Header.Set("X-NextAPI-Timestamp", strconv.FormatInt(ts, 10))
	req.Header.Set("X-NextAPI-Event", d.EventType)

	// Store signature + timestamp on the delivery row for audit.
	s.db.WithContext(ctx).Model(d).Updates(map[string]any{
		"signature":      sig,
		"timestamp_unix": ts,
	})

	resp, err := s.http.Do(req)
	now := time.Now()
	if err != nil {
		msg := err.Error()
		return s.markFailure(ctx, d, nil, &msg)
	}
	defer resp.Body.Close()
	code := resp.StatusCode
	if code >= 200 && code < 300 {
		metrics.WebhookDeliveryTotal.WithLabelValues(d.EventType, "success").Inc()
		return s.db.WithContext(ctx).Model(d).Updates(map[string]any{
			"delivered_at": now, "status_code": code,
		}).Error
	}
	metrics.WebhookDeliveryTotal.WithLabelValues(d.EventType, "failure").Inc()
	errStr := fmt.Sprintf("HTTP %d", code)
	return s.markFailure(ctx, d, &code, &errStr)
}

func (s *Service) markFailure(ctx context.Context, d *domain.WebhookDelivery, code *int, errStr *string) error {
	backoff := []time.Duration{
		30 * time.Second,
		2 * time.Minute,
		10 * time.Minute,
		1 * time.Hour,
		6 * time.Hour,
		24 * time.Hour,
	}
	attempt := d.Attempt + 1
	upd := map[string]any{"attempt": attempt, "status_code": code, "error": errStr}
	if attempt <= len(backoff) {
		next := time.Now().Add(backoff[attempt-1])
		upd["next_retry_at"] = next
	} else {
		upd["next_retry_at"] = nil
	}
	return s.db.WithContext(ctx).Model(d).Updates(upd).Error
}

// signWithTimestamp produces `t=<unix>,sha256=<hex>` for replay protection.
// Customer SDKs verify that timestamp is within 5 minutes of current time.
func signWithTimestamp(secret string, ts int64, body []byte) string {
	payload := fmt.Sprintf("%d.%s", ts, string(body))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return fmt.Sprintf("t=%d,sha256=%s", ts, hex.EncodeToString(mac.Sum(nil)))
}

// matchEvent returns true if the event type matches any pattern in the list.
// Supports wildcard: "video.*" matches "video.succeeded".
func matchEvent(patterns []string, event string) bool {
	for _, p := range patterns {
		if p == event {
			return true
		}
		if len(p) > 1 && p[len(p)-1] == '*' {
			prefix := p[:len(p)-1]
			if len(event) >= len(prefix) && event[:len(prefix)] == prefix {
				return true
			}
		}
	}
	return false
}
