package gateway

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupAccountTeamTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	stmts := []string{
		`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted_at DATETIME)`,
		`CREATE TABLE orgs (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_user_id TEXT NOT NULL, paused_at DATETIME, pause_reason TEXT, company_name TEXT, tax_id TEXT, billing_email TEXT, country_region TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE TABLE org_members (org_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (org_id, user_id))`,
		`CREATE TABLE auth_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, org_id TEXT NOT NULL, user_agent TEXT NOT NULL DEFAULT '', ip_created TEXT NOT NULL DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NOT NULL, last_used_at DATETIME NOT NULL, revoked_at DATETIME)`,
		`CREATE TABLE api_keys (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, prefix TEXT NOT NULL, hash TEXT NOT NULL, name TEXT NOT NULL, env TEXT NOT NULL DEFAULT 'live', kind TEXT NOT NULL DEFAULT 'business', allowed_models TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, revoked_at DATETIME)`,
		`CREATE TABLE jobs (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, api_key_id TEXT, cost_credits BIGINT, reserved_credits BIGINT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
	}
	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("create schema: %v", err)
		}
	}
	now := time.Now().UTC()
	inserts := []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO users (id, email, created_at) VALUES ('owner_1', 'owner@example.com', ?), ('member_1', 'member@example.com', ?)`, []any{now, now.Add(time.Minute)}},
		{`INSERT INTO orgs (id, name, owner_user_id, created_at) VALUES ('org_1', 'NextCut Studio', 'owner_1', ?)`, []any{now}},
		{`INSERT INTO org_members (org_id, user_id, role) VALUES ('org_1', 'owner_1', 'owner'), ('org_1', 'member_1', 'member')`, nil},
		{`INSERT INTO auth_sessions (token_hash, user_id, org_id, expires_at, last_used_at) VALUES (?, 'owner_1', 'org_1', ?, ?), (?, 'member_1', 'org_1', ?, ?)`, []any{hashToken("owner-token"), now.Add(time.Hour), now, hashToken("member-token"), now.Add(time.Hour), now}},
		{`INSERT INTO api_keys (id, org_id, prefix, hash, name) VALUES ('key_owner', 'org_1', 'sk_live', 'hash_owner', 'dashboard-session:owner_1'), ('key_member', 'org_1', 'sk_live', 'hash_member', 'dashboard-session:member_1'), ('key_shared', 'org_1', 'sk_live', 'hash_shared', 'shared-key')`, nil},
		{`INSERT INTO jobs (id, org_id, api_key_id, cost_credits, reserved_credits, created_at) VALUES ('job_owner', 'org_1', 'key_owner', 20, 20, ?), ('job_member', 'org_1', 'key_member', 35, 35, ?), ('job_shared', 'org_1', 'key_shared', 9, 9, ?)`, []any{now, now.Add(time.Minute), now.Add(2 * time.Minute)}},
	}
	for _, insert := range inserts {
		if err := db.Exec(insert.sql, insert.args...).Error; err != nil {
			t.Fatalf("insert fixture: %v", err)
		}
	}
	return db
}

func callAccountTeam(t *testing.T, h *AccountAuthHandlers, token string) (int, accountTeamResponse) {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/auth/team", nil)
	if token != "" {
		c.Request.Header.Set(accountSessionHeader, token)
	}
	h.Team(c)

	var body accountTeamResponse
	if w.Body.Len() > 0 {
		if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
			t.Fatalf("decode response: %v; raw=%s", err, w.Body.String())
		}
	}
	return w.Code, body
}

type accountTeamResponse struct {
	Org struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"org"`
	Viewer struct {
		UserID    string `json:"user_id"`
		Email     string `json:"email"`
		Role      string `json:"role"`
		CanManage bool   `json:"can_manage"`
	} `json:"viewer"`
	Members []accountTeamMemberUsage `json:"members"`
	Shared  accountTeamSharedUsage   `json:"shared_usage"`
}

func TestAccountTeamOwnerSeesMemberUsage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &AccountAuthHandlers{DB: setupAccountTeamTestDB(t)}

	status, body := callAccountTeam(t, h, "owner-token")

	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d: %#v", status, body)
	}
	if body.Org.ID != "org_1" || body.Viewer.Role != "owner" || !body.Viewer.CanManage {
		t.Fatalf("unexpected org/viewer payload: %#v", body)
	}
	if len(body.Members) != 2 {
		t.Fatalf("owner should see 2 members, got %#v", body.Members)
	}
	usageByEmail := map[string]int64{}
	for _, member := range body.Members {
		usageByEmail[member.Email] = member.CreditsUsed
	}
	if usageByEmail["owner@example.com"] != 20 || usageByEmail["member@example.com"] != 35 {
		t.Fatalf("unexpected member usage: %#v", usageByEmail)
	}
	if body.Shared.CreditsUsed != 9 || body.Shared.JobsCount != 1 {
		t.Fatalf("unexpected shared usage: %#v", body.Shared)
	}
}

func TestAccountTeamMemberOnlySeesSelf(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &AccountAuthHandlers{DB: setupAccountTeamTestDB(t)}

	status, body := callAccountTeam(t, h, "member-token")

	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d: %#v", status, body)
	}
	if body.Viewer.Role != "member" || body.Viewer.CanManage {
		t.Fatalf("member viewer should not manage team: %#v", body.Viewer)
	}
	if len(body.Members) != 1 || body.Members[0].Email != "member@example.com" || body.Members[0].CreditsUsed != 35 {
		t.Fatalf("member should see only self usage, got %#v", body.Members)
	}
}
