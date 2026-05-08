package gateway

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/billing"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupAdminCreditsTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	stmts := []string{
		`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted_at DATETIME)`,
		`CREATE TABLE orgs (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_user_id TEXT NOT NULL, paused_at DATETIME, pause_reason TEXT, company_name TEXT, tax_id TEXT, billing_email TEXT, country_region TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE TABLE org_members (org_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (org_id, user_id))`,
		`CREATE TABLE credits_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT NOT NULL, delta_credits BIGINT NOT NULL, delta_cents BIGINT, reason TEXT NOT NULL, job_id TEXT, note TEXT NOT NULL DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
	}
	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("create schema: %v", err)
		}
	}
	if err := db.Exec(`INSERT INTO users (id, email) VALUES ('user_1', 'owner@example.com')`).Error; err != nil {
		t.Fatalf("insert user: %v", err)
	}
	if err := db.Exec(`INSERT INTO orgs (id, name, owner_user_id) VALUES ('org_1', 'Acme Studio', 'user_1')`).Error; err != nil {
		t.Fatalf("insert org: %v", err)
	}
	if err := db.Exec(`INSERT INTO org_members (org_id, user_id, role) VALUES ('org_1', 'user_1', 'owner')`).Error; err != nil {
		t.Fatalf("insert member: %v", err)
	}
	if err := db.Exec(`INSERT INTO credits_ledger (org_id, delta_credits, delta_cents, reason, note) VALUES ('org_1', 12000, 12000, 'topup', 'seed'), ('org_1', -2000, -2000, 'consumption', 'seed')`).Error; err != nil {
		t.Fatalf("insert ledger: %v", err)
	}
	return db
}

func TestAdminUsersIncludesOrgBalances(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupAdminCreditsTestDB(t)
	h := &AdminHandlers{DB: db}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/internal/admin/users", nil)

	h.Users(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var body struct {
		Data []struct {
			ID             string `json:"id"`
			Email          string `json:"email"`
			CreditsBalance int64  `json:"credits_balance"`
			PrimaryOrgID   string `json:"primary_org_id"`
			Orgs           []struct {
				ID             string `json:"id"`
				Name           string `json:"name"`
				Role           string `json:"role"`
				CreditsBalance int64  `json:"credits_balance"`
			} `json:"orgs"`
		} `json:"data"`
	}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Data) != 1 {
		t.Fatalf("expected one user, got %d", len(body.Data))
	}
	user := body.Data[0]
	if user.ID != "user_1" || user.Email != "owner@example.com" {
		t.Fatalf("unexpected user: %#v", user)
	}
	if user.CreditsBalance != 10000 || user.PrimaryOrgID != "org_1" {
		t.Fatalf("unexpected balance/org: balance=%d primary=%s", user.CreditsBalance, user.PrimaryOrgID)
	}
	if len(user.Orgs) != 1 || user.Orgs[0].CreditsBalance != 10000 || user.Orgs[0].Name != "Acme Studio" {
		t.Fatalf("unexpected org payload: %#v", user.Orgs)
	}
}

func TestAdminAdjustCreditsCanResolveUserTarget(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("ADMIN_OTP_BYPASS", "1")
	db := setupAdminCreditsTestDB(t)
	h := &AdminHandlers{DB: db, Billing: billing.NewService(db)}

	body := bytes.NewBufferString(`{"user_id":"user_1","delta":1500,"note":"manual compensation"}`)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/internal/admin/credits/adjust", body)
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set(AdminActorCtxKey, "ops@example.com")

	h.AdjustCredits(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var balance int64
	if err := db.Raw(`SELECT COALESCE(SUM(COALESCE(delta_cents, delta_credits, 0)), 0) FROM credits_ledger WHERE org_id = 'org_1'`).Scan(&balance).Error; err != nil {
		t.Fatalf("balance: %v", err)
	}
	if balance != 11500 {
		t.Fatalf("expected balance 11500, got %d", balance)
	}
}
