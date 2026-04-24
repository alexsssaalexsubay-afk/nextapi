package idempotency

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/auth"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`CREATE TABLE orgs (id TEXT PRIMARY KEY, name TEXT)`)
	db.Exec(`CREATE TABLE idempotency_keys (
		org_id TEXT NOT NULL, key TEXT NOT NULL, body_sha256 TEXT NOT NULL,
		response TEXT NOT NULL, status_code INT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (org_id, key))`)
	db.Exec(`INSERT INTO orgs (id, name) VALUES ('org1', 'test')`)
	return db
}

func setupRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	m := &Middleware{DB: db}

	r.POST("/test", func(c *gin.Context) {
		auth.SetOrg(c, &domain.Org{ID: "org1", Name: "test"})
		c.Next()
	}, m.Handle(), func(c *gin.Context) {
		body := gin.H{"id": "job_123", "status": "queued"}
		Commit(c.Request.Context(), db, "org1", c, http.StatusAccepted, body)
		c.JSON(http.StatusAccepted, body)
	})
	return r
}

func TestNoKeyHeader_PassesThrough(t *testing.T) {
	db := setupDB(t)
	r := setupRouter(db)

	w := httptest.NewRecorder()
	body := []byte(`{"prompt":"hello"}`)
	req := httptest.NewRequest("POST", "/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusAccepted {
		t.Fatalf("want 202, got %d", w.Code)
	}

	var count int64
	db.Raw(`SELECT COUNT(*) FROM idempotency_keys`).Scan(&count)
	if count != 0 {
		t.Fatalf("no row should be cached when no key header, got %d rows", count)
	}
}

func TestSameKeyAndBody_ReplayCachedResponse(t *testing.T) {
	db := setupDB(t)
	r := setupRouter(db)

	body := []byte(`{"prompt":"hello"}`)

	w1 := httptest.NewRecorder()
	req1 := httptest.NewRequest("POST", "/test", bytes.NewReader(body))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("Idempotency-Key", "key-001")
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusAccepted {
		t.Fatalf("first: want 202, got %d", w1.Code)
	}

	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest("POST", "/test", bytes.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Idempotency-Key", "key-001")
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusAccepted {
		t.Fatalf("replay: want 202, got %d", w2.Code)
	}
	if got := w2.Header().Get("X-Idempotent-Replay"); got != "true" {
		t.Fatalf("expected X-Idempotent-Replay=true on replay, got %q", got)
	}

	var resp1, resp2 map[string]any
	json.Unmarshal(w1.Body.Bytes(), &resp1)
	json.Unmarshal(w2.Body.Bytes(), &resp2)
	if resp1["id"] != resp2["id"] {
		t.Fatalf("replay body mismatch: %v vs %v", resp1, resp2)
	}
}

func TestSameKeyDifferentBody_Conflict(t *testing.T) {
	db := setupDB(t)
	r := setupRouter(db)

	body1 := []byte(`{"prompt":"hello"}`)
	body2 := []byte(`{"prompt":"world"}`)

	w1 := httptest.NewRecorder()
	req1 := httptest.NewRequest("POST", "/test", bytes.NewReader(body1))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("Idempotency-Key", "key-002")
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusAccepted {
		t.Fatalf("first: want 202, got %d", w1.Code)
	}

	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest("POST", "/test", bytes.NewReader(body2))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Idempotency-Key", "key-002")
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusConflict {
		t.Fatalf("conflict: want 409, got %d", w2.Code)
	}

	var errResp map[string]any
	json.Unmarshal(w2.Body.Bytes(), &errResp)
	errObj, _ := errResp["error"].(map[string]any)
	if errObj["code"] != "idempotency_conflict" {
		t.Fatalf("want idempotency_conflict, got %v", errObj["code"])
	}
}

// TestConcurrentSameKey_OnlyOneRunsHandler is the regression test for
// the TOCTOU bug. Two simultaneous identical requests must result in
// exactly one provider call (handler invocation), with the loser getting
// either a replayed response OR an in-progress 409.
func TestConcurrentSameKey_OnlyOneRunsHandler(t *testing.T) {
	db := setupDB(t)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	m := &Middleware{DB: db}

	var handlerCalls int32
	r.POST("/test", func(c *gin.Context) {
		auth.SetOrg(c, &domain.Org{ID: "org1", Name: "test"})
		c.Next()
	}, m.Handle(), func(c *gin.Context) {
		atomic.AddInt32(&handlerCalls, 1)
		// Simulate a slow upstream: hold the placeholder long enough
		// that the second request definitely arrives mid-flight.
		time.Sleep(100 * time.Millisecond)
		body := gin.H{"id": "job_unique", "status": "queued"}
		Commit(c.Request.Context(), db, "org1", c, http.StatusAccepted, body)
		c.JSON(http.StatusAccepted, body)
	})

	body := []byte(`{"prompt":"race"}`)
	var wg sync.WaitGroup
	codes := make([]int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			w := httptest.NewRecorder()
			req := httptest.NewRequest("POST", "/test", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Idempotency-Key", "race-key")
			r.ServeHTTP(w, req)
			codes[i] = w.Code
		}(i)
		// Tiny stagger to make the race deterministic on most platforms.
		time.Sleep(5 * time.Millisecond)
	}
	wg.Wait()

	if got := atomic.LoadInt32(&handlerCalls); got != 1 {
		t.Fatalf("handler must run exactly once under concurrent same-key; ran %d times", got)
	}
	// Exactly one 202 and one 409 (in-progress). After the leader Commits,
	// a third request would replay; but here both fire roughly together so
	// the second sees the placeholder.
	got202, got409 := 0, 0
	for _, c := range codes {
		switch c {
		case http.StatusAccepted:
			got202++
		case http.StatusConflict:
			got409++
		}
	}
	if got202 != 1 || got409 != 1 {
		t.Fatalf("expected 1×202 + 1×409, got codes=%v", codes)
	}
}
