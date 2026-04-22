package nextapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func newTestClient(h http.Handler) (*Client, *httptest.Server) {
	srv := httptest.NewServer(h)
	return &Client{APIKey: "sk-test", BaseURL: srv.URL, HTTP: srv.Client()}, srv
}

func TestGenerate(t *testing.T) {
	c, srv := newTestClient(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/video/generations" {
			t.Fatalf("unexpected %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk-test" {
			t.Fatalf("auth header = %q", got)
		}
		if got := r.Header.Get("Content-Type"); got != "application/json" {
			t.Fatalf("content-type = %q", got)
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["prompt"] != "hi" {
			t.Fatalf("prompt = %v", body["prompt"])
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"job_123","status":"queued","estimated_credits":42}`))
	}))
	defer srv.Close()

	out, err := c.Generate(context.Background(), GenerateRequest{Prompt: "hi"})
	if err != nil {
		t.Fatal(err)
	}
	if out.ID != "job_123" || out.Status != "queued" || out.EstimatedCredits != 42 {
		t.Fatalf("unexpected: %+v", out)
	}
}

func TestGetJob(t *testing.T) {
	c, srv := newTestClient(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/jobs/job_123" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"id":"job_123","status":"succeeded"}`))
	}))
	defer srv.Close()

	job, err := c.GetJob(context.Background(), "job_123")
	if err != nil {
		t.Fatal(err)
	}
	if job.Status != "succeeded" {
		t.Fatalf("status = %s", job.Status)
	}
}

func TestErrorMapping(t *testing.T) {
	c, srv := newTestClient(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"error":{"code":"bad_request","message":"nope"}}`))
	}))
	defer srv.Close()

	_, err := c.Generate(context.Background(), GenerateRequest{Prompt: "x"})
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *Error, got %T", err)
	}
	if apiErr.Code != "bad_request" || apiErr.StatusCode != 400 {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
}

func TestWaitPolls(t *testing.T) {
	var calls int
	c, srv := newTestClient(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls < 3 {
			_, _ = w.Write([]byte(`{"id":"j1","status":"running"}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":"j1","status":"succeeded"}`))
	}))
	defer srv.Close()

	job, err := c.Wait(context.Background(), "j1", 5*time.Second, 1*time.Millisecond)
	if err != nil {
		t.Fatal(err)
	}
	if job.Status != "succeeded" {
		t.Fatalf("status = %s", job.Status)
	}
	if calls < 3 {
		t.Fatalf("expected >=3 calls, got %d", calls)
	}
}
