package aiprovider

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
)

const (
	quotaModeLocalLedger = "local_ledger"
	quotaModeOpenAICosts = "openai_costs"
	quotaModeManual      = "manual"

	quotaStatusHealthy        = "healthy"
	quotaStatusLowBalance     = "low_balance"
	quotaStatusDepleted       = "depleted"
	quotaStatusRecorded       = "recorded"
	quotaStatusConfigRequired = "config_required"
	quotaStatusFailed         = "failed"
	quotaStatusUnsupported    = "unsupported"
)

type quotaConfig struct {
	Mode            string `json:"quota_mode,omitempty"`
	Scope           string `json:"quota_scope,omitempty"`
	Currency        string `json:"quota_currency,omitempty"`
	TotalCents      *int64 `json:"quota_total_cents,omitempty"`
	ManualUsed      *int64 `json:"quota_manual_used_cents,omitempty"`
	ManualRemaining *int64 `json:"quota_manual_remaining_cents,omitempty"`
	LowBalanceCents *int64 `json:"quota_low_balance_cents,omitempty"`
	PeriodStart     string `json:"quota_period_start,omitempty"`
	PeriodEnd       string `json:"quota_period_end,omitempty"`
	APIKeyEnv       string `json:"quota_api_key_env,omitempty"`
	CostsBaseURL    string `json:"quota_costs_base_url,omitempty"`
	Notes           string `json:"quota_notes,omitempty"`
}

type ManualQuotaInput struct {
	Currency        string     `json:"currency"`
	TotalCents      *int64     `json:"total_cents"`
	UsedCents       *int64     `json:"used_cents"`
	RemainingCents  *int64     `json:"remaining_cents"`
	LowBalanceCents *int64     `json:"low_balance_cents"`
	PeriodStart     *time.Time `json:"period_start"`
	PeriodEnd       *time.Time `json:"period_end"`
	Message         string     `json:"message"`
}

func (s *Service) ListQuotaSnapshots(ctx context.Context, limit int) ([]domain.ProviderQuotaSnapshot, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	var rows []domain.ProviderQuotaSnapshot
	err := s.db.WithContext(ctx).Order("created_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (s *Service) SyncProviderQuota(ctx context.Context, id string) (*domain.ProviderQuotaSnapshot, error) {
	prov, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	cfg := providerQuotaConfig(*prov)
	periodStart, periodEnd := quotaPeriod(cfg, time.Now().UTC())
	mode := quotaMode(*prov, cfg)

	switch mode {
	case quotaModeLocalLedger:
		return s.snapshotLocalLedger(ctx, *prov, cfg, periodStart, periodEnd)
	case quotaModeOpenAICosts:
		return s.snapshotOpenAICosts(ctx, *prov, cfg, periodStart, periodEnd)
	case quotaModeManual:
		return s.snapshotManualConfig(ctx, *prov, cfg, periodStart, periodEnd)
	default:
		return s.createQuotaSnapshot(ctx, quotaSnapshotInput{
			Provider:        *prov,
			Mode:            mode,
			Currency:        quotaCurrency(cfg),
			LowBalanceCents: cfg.LowBalanceCents,
			PeriodStart:     &periodStart,
			PeriodEnd:       &periodEnd,
			Status:          quotaStatusUnsupported,
			Message:         "quota mode is not supported",
			Source:          "provider_config",
			Raw:             map[string]any{"quota_mode": mode},
		})
	}
}

func (s *Service) RecordManualQuotaSnapshot(ctx context.Context, id string, in ManualQuotaInput) (*domain.ProviderQuotaSnapshot, error) {
	prov, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	cfg := providerQuotaConfig(*prov)
	currency := strings.ToUpper(strings.TrimSpace(in.Currency))
	if currency == "" {
		currency = quotaCurrency(cfg)
	}
	total := in.TotalCents
	if total == nil {
		total = cfg.TotalCents
	}
	used := int64(0)
	if in.UsedCents != nil {
		used = *in.UsedCents
	} else if total != nil && in.RemainingCents != nil {
		used = maxInt64(0, *total-*in.RemainingCents)
	} else if cfg.ManualUsed != nil {
		used = *cfg.ManualUsed
	}
	remaining := in.RemainingCents
	if remaining == nil && total != nil {
		value := *total - used
		remaining = &value
	}
	lowBalance := in.LowBalanceCents
	if lowBalance == nil {
		lowBalance = cfg.LowBalanceCents
	}
	now := time.Now().UTC()
	periodStart := in.PeriodStart
	periodEnd := in.PeriodEnd
	if periodStart == nil || periodEnd == nil {
		start, end := quotaPeriod(cfg, now)
		if periodStart == nil {
			periodStart = &start
		}
		if periodEnd == nil {
			periodEnd = &end
		}
	}
	message := strings.TrimSpace(in.Message)
	if message == "" {
		message = "manual upstream balance snapshot"
	}
	return s.createQuotaSnapshot(ctx, quotaSnapshotInput{
		Provider:        *prov,
		Mode:            quotaModeManual,
		Currency:        currency,
		TotalCents:      total,
		UsedCents:       used,
		RemainingCents:  remaining,
		LowBalanceCents: lowBalance,
		PeriodStart:     periodStart,
		PeriodEnd:       periodEnd,
		Status:          quotaStatus(total, remaining, lowBalance),
		Message:         message,
		Source:          "operator",
		Raw: map[string]any{
			"total_cents":     total,
			"used_cents":      used,
			"remaining_cents": remaining,
		},
	})
}

func (s *Service) snapshotLocalLedger(ctx context.Context, prov domain.AIProvider, cfg quotaConfig, periodStart time.Time, periodEnd time.Time) (*domain.ProviderQuotaSnapshot, error) {
	used, err := s.localLedgerCents(ctx, prov, periodStart, periodEnd)
	if err != nil {
		return s.createQuotaSnapshot(ctx, quotaSnapshotInput{
			Provider:        prov,
			Mode:            quotaModeLocalLedger,
			Currency:        quotaCurrency(cfg),
			TotalCents:      cfg.TotalCents,
			LowBalanceCents: cfg.LowBalanceCents,
			PeriodStart:     &periodStart,
			PeriodEnd:       &periodEnd,
			Status:          quotaStatusFailed,
			Message:         "local usage ledger is unavailable",
			Source:          "nextapi_ledger",
			Raw:             map[string]any{"error": err.Error()},
		})
	}
	remaining := remainingCents(cfg.TotalCents, used)
	status := quotaStatus(cfg.TotalCents, remaining, cfg.LowBalanceCents)
	message := cfg.Notes
	if message == "" && cfg.TotalCents == nil {
		message = "set quota_total_cents in provider config to show remaining balance"
		status = quotaStatusConfigRequired
	}
	return s.createQuotaSnapshot(ctx, quotaSnapshotInput{
		Provider:        prov,
		Mode:            quotaModeLocalLedger,
		Currency:        quotaCurrency(cfg),
		TotalCents:      cfg.TotalCents,
		UsedCents:       used,
		RemainingCents:  remaining,
		LowBalanceCents: cfg.LowBalanceCents,
		PeriodStart:     &periodStart,
		PeriodEnd:       &periodEnd,
		Status:          status,
		Message:         message,
		Source:          "nextapi_ledger",
		Raw: map[string]any{
			"provider_type": prov.Type,
			"provider":      prov.Provider,
		},
	})
}

func (s *Service) snapshotOpenAICosts(ctx context.Context, prov domain.AIProvider, cfg quotaConfig, periodStart time.Time, periodEnd time.Time) (*domain.ProviderQuotaSnapshot, error) {
	apiKey, err := quotaAPIKey(prov, cfg)
	if err != nil {
		return s.createQuotaSnapshot(ctx, quotaSnapshotInput{
			Provider:        prov,
			Mode:            quotaModeOpenAICosts,
			Currency:        quotaCurrency(cfg),
			TotalCents:      cfg.TotalCents,
			LowBalanceCents: cfg.LowBalanceCents,
			PeriodStart:     &periodStart,
			PeriodEnd:       &periodEnd,
			Status:          quotaStatusConfigRequired,
			Message:         "OpenAI organization cost sync requires quota_api_key_env or a decryptable admin key",
			Source:          "openai_costs_api",
			Raw:             map[string]any{"error": sanitizeErr(err)},
		})
	}
	raw, used, currency, err := fetchOpenAICosts(ctx, openAICostsURL(cfg), apiKey, periodStart, periodEnd)
	if err != nil {
		return s.createQuotaSnapshot(ctx, quotaSnapshotInput{
			Provider:        prov,
			Mode:            quotaModeOpenAICosts,
			Currency:        quotaCurrency(cfg),
			TotalCents:      cfg.TotalCents,
			LowBalanceCents: cfg.LowBalanceCents,
			PeriodStart:     &periodStart,
			PeriodEnd:       &periodEnd,
			Status:          quotaStatusFailed,
			Message:         "OpenAI organization cost sync failed",
			Source:          "openai_costs_api",
			Raw:             map[string]any{"error": err.Error()},
		})
	}
	if currency == "" {
		currency = quotaCurrency(cfg)
	}
	remaining := remainingCents(cfg.TotalCents, used)
	status := quotaStatus(cfg.TotalCents, remaining, cfg.LowBalanceCents)
	message := cfg.Notes
	if message == "" && cfg.TotalCents == nil {
		message = "OpenAI Costs API returned spend; set quota_total_cents to show remaining prepaid balance"
		status = quotaStatusConfigRequired
	}
	return s.createQuotaSnapshot(ctx, quotaSnapshotInput{
		Provider:        prov,
		Mode:            quotaModeOpenAICosts,
		Currency:        strings.ToUpper(currency),
		TotalCents:      cfg.TotalCents,
		UsedCents:       used,
		RemainingCents:  remaining,
		LowBalanceCents: cfg.LowBalanceCents,
		PeriodStart:     &periodStart,
		PeriodEnd:       &periodEnd,
		Status:          status,
		Message:         message,
		Source:          "openai_costs_api",
		Raw:             raw,
	})
}

func (s *Service) snapshotManualConfig(ctx context.Context, prov domain.AIProvider, cfg quotaConfig, periodStart time.Time, periodEnd time.Time) (*domain.ProviderQuotaSnapshot, error) {
	used := int64(0)
	if cfg.ManualUsed != nil {
		used = *cfg.ManualUsed
	} else if cfg.TotalCents != nil && cfg.ManualRemaining != nil {
		used = maxInt64(0, *cfg.TotalCents-*cfg.ManualRemaining)
	}
	remaining := cfg.ManualRemaining
	if remaining == nil {
		remaining = remainingCents(cfg.TotalCents, used)
	}
	return s.createQuotaSnapshot(ctx, quotaSnapshotInput{
		Provider:        prov,
		Mode:            quotaModeManual,
		Currency:        quotaCurrency(cfg),
		TotalCents:      cfg.TotalCents,
		UsedCents:       used,
		RemainingCents:  remaining,
		LowBalanceCents: cfg.LowBalanceCents,
		PeriodStart:     &periodStart,
		PeriodEnd:       &periodEnd,
		Status:          quotaStatus(cfg.TotalCents, remaining, cfg.LowBalanceCents),
		Message:         strings.TrimSpace(cfg.Notes),
		Source:          "provider_config",
		Raw: map[string]any{
			"manual_used_cents":      cfg.ManualUsed,
			"manual_remaining_cents": cfg.ManualRemaining,
		},
	})
}

func (s *Service) localLedgerCents(ctx context.Context, prov domain.AIProvider, periodStart time.Time, periodEnd time.Time) (int64, error) {
	var used sql.NullInt64
	if prov.Type == domain.AIProviderTypeVideo {
		err := s.db.WithContext(ctx).Raw(`
			SELECT COALESCE(SUM(COALESCE(upstream_actual_cents, upstream_estimate_cents, cost_credits, reserved_credits, 0)), 0)
			FROM jobs
			WHERE lower(provider) = lower(?) AND created_at >= ? AND created_at < ?
		`, prov.Provider, periodStart, periodEnd).Scan(&used).Error
		if err != nil {
			return 0, err
		}
		return used.Int64, nil
	}
	err := s.db.WithContext(ctx).Raw(`
		SELECT COALESCE(SUM(actual_cents), 0)
		FROM director_metering
		WHERE provider_id = ? AND created_at >= ? AND created_at < ?
	`, prov.ID, periodStart, periodEnd).Scan(&used).Error
	if err != nil {
		return 0, err
	}
	return used.Int64, nil
}

type quotaSnapshotInput struct {
	Provider        domain.AIProvider
	Mode            string
	Currency        string
	TotalCents      *int64
	UsedCents       int64
	RemainingCents  *int64
	LowBalanceCents *int64
	PeriodStart     *time.Time
	PeriodEnd       *time.Time
	Status          string
	Message         string
	Source          string
	Raw             any
}

func (s *Service) createQuotaSnapshot(ctx context.Context, in quotaSnapshotInput) (*domain.ProviderQuotaSnapshot, error) {
	raw := json.RawMessage(`{}`)
	if in.Raw != nil {
		if b, err := json.Marshal(in.Raw); err == nil && json.Valid(b) {
			raw = b
		}
	}
	providerID := in.Provider.ID
	row := domain.ProviderQuotaSnapshot{
		ProviderID:      &providerID,
		Provider:        strings.TrimSpace(in.Provider.Provider),
		Scope:           "account",
		Mode:            strings.TrimSpace(in.Mode),
		Currency:        strings.ToUpper(strings.TrimSpace(in.Currency)),
		TotalCents:      in.TotalCents,
		UsedCents:       in.UsedCents,
		RemainingCents:  in.RemainingCents,
		LowBalanceCents: in.LowBalanceCents,
		PeriodStart:     in.PeriodStart,
		PeriodEnd:       in.PeriodEnd,
		Status:          strings.TrimSpace(in.Status),
		Message:         strings.TrimSpace(in.Message),
		Source:          strings.TrimSpace(in.Source),
		RawJSON:         raw,
		CreatedAt:       time.Now().UTC(),
	}
	if row.Mode == "" {
		row.Mode = quotaModeLocalLedger
	}
	if row.Currency == "" {
		row.Currency = "USD"
	}
	if row.Status == "" {
		row.Status = quotaStatusRecorded
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func providerQuotaConfig(prov domain.AIProvider) quotaConfig {
	cfg := quotaConfig{}
	if len(prov.ConfigJSON) == 0 {
		return cfg
	}
	_ = json.Unmarshal(prov.ConfigJSON, &cfg)
	return cfg
}

func quotaMode(prov domain.AIProvider, cfg quotaConfig) string {
	mode := strings.ToLower(strings.TrimSpace(cfg.Mode))
	if mode != "" {
		return mode
	}
	if strings.EqualFold(strings.TrimSpace(prov.Provider), "openai") {
		return quotaModeOpenAICosts
	}
	return quotaModeLocalLedger
}

func quotaCurrency(cfg quotaConfig) string {
	currency := strings.ToUpper(strings.TrimSpace(cfg.Currency))
	if currency == "" {
		return "USD"
	}
	return currency
}

func quotaPeriod(cfg quotaConfig, now time.Time) (time.Time, time.Time) {
	end := now.UTC()
	start := time.Date(end.Year(), end.Month(), 1, 0, 0, 0, 0, time.UTC)
	if parsed, ok := parseQuotaTime(cfg.PeriodStart); ok {
		start = parsed
	}
	if parsed, ok := parseQuotaTime(cfg.PeriodEnd); ok {
		end = parsed
	}
	if !end.After(start) {
		end = now.UTC()
	}
	return start, end
}

func parseQuotaTime(raw string) (time.Time, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed.UTC(), true
		}
	}
	return time.Time{}, false
}

func remainingCents(total *int64, used int64) *int64 {
	if total == nil {
		return nil
	}
	remaining := *total - used
	return &remaining
}

func quotaStatus(total *int64, remaining *int64, low *int64) string {
	if total == nil || remaining == nil {
		return quotaStatusRecorded
	}
	if *remaining <= 0 {
		return quotaStatusDepleted
	}
	if low != nil && *remaining <= *low {
		return quotaStatusLowBalance
	}
	return quotaStatusHealthy
}

func quotaAPIKey(prov domain.AIProvider, cfg quotaConfig) (string, error) {
	if env := strings.TrimSpace(cfg.APIKeyEnv); env != "" {
		if value := strings.TrimSpace(os.Getenv(env)); value != "" {
			return value, nil
		}
		return "", fmt.Errorf("%s is empty", env)
	}
	return DecryptAPIKey(prov.APIKeyEncrypted)
}

func openAICostsURL(cfg quotaConfig) string {
	if base := strings.TrimSpace(cfg.CostsBaseURL); base != "" {
		return base
	}
	return "https://api.openai.com/v1/organization/costs"
}

func fetchOpenAICosts(ctx context.Context, endpoint string, apiKey string, periodStart time.Time, periodEnd time.Time) (json.RawMessage, int64, string, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, 0, "", err
	}
	q := u.Query()
	q.Set("start_time", fmt.Sprintf("%d", periodStart.Unix()))
	q.Set("end_time", fmt.Sprintf("%d", periodEnd.Unix()))
	q.Set("bucket_width", "1d")
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, 0, "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, 0, "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		trimmed := string(bytes.TrimSpace(body))
		if len(trimmed) > 500 {
			trimmed = trimmed[:500]
		}
		return nil, 0, "", fmt.Errorf("openai costs status %d: %s", resp.StatusCode, trimmed)
	}
	if !json.Valid(body) {
		return nil, 0, "", errors.New("openai costs returned invalid json")
	}
	var parsed any
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, 0, "", err
	}
	currency := firstCurrency(parsed)
	return json.RawMessage(body), dollarsToCents(sumCostAmounts(parsed)), currency, nil
}

func sumCostAmounts(v any) float64 {
	switch value := v.(type) {
	case map[string]any:
		sum := 0.0
		if amount, ok := value["amount"]; ok {
			sum += amountValue(amount)
		}
		for key, child := range value {
			if key == "amount" {
				continue
			}
			sum += sumCostAmounts(child)
		}
		return sum
	case []any:
		sum := 0.0
		for _, child := range value {
			sum += sumCostAmounts(child)
		}
		return sum
	default:
		return 0
	}
}

func amountValue(v any) float64 {
	switch value := v.(type) {
	case map[string]any:
		if raw, ok := value["value"]; ok {
			return numericValue(raw)
		}
	case float64:
		return value
	case int64:
		return float64(value)
	case json.Number:
		out, _ := value.Float64()
		return out
	}
	return 0
}

func firstCurrency(v any) string {
	switch value := v.(type) {
	case map[string]any:
		if currency, ok := value["currency"].(string); ok && strings.TrimSpace(currency) != "" {
			return strings.ToUpper(strings.TrimSpace(currency))
		}
		for _, child := range value {
			if found := firstCurrency(child); found != "" {
				return found
			}
		}
	case []any:
		for _, child := range value {
			if found := firstCurrency(child); found != "" {
				return found
			}
		}
	}
	return ""
}

func numericValue(v any) float64 {
	switch value := v.(type) {
	case float64:
		return value
	case int64:
		return float64(value)
	case int:
		return float64(value)
	case json.Number:
		out, _ := value.Float64()
		return out
	default:
		return 0
	}
}

func dollarsToCents(value float64) int64 {
	return int64(math.Round(value * 100))
}

func maxInt64(a int64, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
