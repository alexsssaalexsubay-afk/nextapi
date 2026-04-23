// Package notify wraps outbound email via Resend (https://resend.com).
//
// Design principles:
//
//   - **Fail open, never block**: notification delivery runs in a goroutine
//     with its own context+timeout. A flaky Resend cannot wedge the request
//     that triggered the alert.
//   - **No-op when disabled**: if RESEND_API_KEY is unset, every Send is a
//     debug-log no-op. This keeps local dev / CI / reviewers' machines from
//     accidentally emailing the world.
//   - **Plain text + minimal HTML**: every alert is short, scannable, has
//     the live URL of the resource it's about. No marketing chrome.
package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

const resendURL = "https://api.resend.com/emails"

// Notifier is safe for concurrent use. The zero value is unusable;
// always go through New().
type Notifier struct {
	apiKey  string
	from    string // "NextAPI Alerts <alerts@nextapi.top>"
	toDef   []string
	client  *http.Client
	enabled atomic.Bool
}

// New returns a Notifier configured from environment:
//
//	RESEND_API_KEY        secret API key (re_…); empty disables sends.
//	NOTIFY_FROM           full From header, e.g. "NextAPI Alerts <alerts@nextapi.top>"
//	                      defaults to "NextAPI Alerts <noreply@nextapi.top>" if unset.
//	NOTIFY_TO_DEFAULT     comma-separated default recipient list for owner alerts
//	                      (e.g. you+ops@example.com). Used by SendOwner().
func New() *Notifier {
	n := &Notifier{
		apiKey: strings.TrimSpace(os.Getenv("RESEND_API_KEY")),
		from:   strings.TrimSpace(os.Getenv("NOTIFY_FROM")),
		toDef:  splitCSV(os.Getenv("NOTIFY_TO_DEFAULT")),
		client: &http.Client{Timeout: 8 * time.Second},
	}
	if n.from == "" {
		n.from = "NextAPI Alerts <noreply@nextapi.top>"
	}
	if n.apiKey != "" {
		n.enabled.Store(true)
		log.Printf("notify: Resend enabled, from=%s default_to=%v", n.from, n.toDef)
	} else {
		log.Printf("notify: RESEND_API_KEY not set, all notifications disabled")
	}
	return n
}

func splitCSV(v string) []string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	out := []string{}
	for _, s := range strings.Split(v, ",") {
		if t := strings.TrimSpace(s); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// Enabled reports whether sends will actually be attempted.
func (n *Notifier) Enabled() bool { return n != nil && n.enabled.Load() }

type Mail struct {
	To      []string
	Subject string
	Text    string
	HTML    string // optional; if empty Text is used
	Tag     string // optional Resend tag for filtering
}

// Send fires-and-forgets in a goroutine with a hard timeout. The
// callsite never has to await the network round-trip.
func (n *Notifier) Send(m Mail) {
	if !n.Enabled() {
		return
	}
	if len(m.To) == 0 {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		if err := n.sendSync(ctx, m); err != nil {
			// Swallow + log; alerts must not crash the producer.
			log.Printf("notify: Resend delivery failed: %v subject=%q", err, m.Subject)
		}
	}()
}

// SendOwner pushes m to the operator allowlist (NOTIFY_TO_DEFAULT).
// Convenience for "tell the boss" events like reconcile failures.
func (n *Notifier) SendOwner(subject, text string) {
	if !n.Enabled() || len(n.toDef) == 0 {
		return
	}
	n.Send(Mail{
		To:      n.toDef,
		Subject: subject,
		Text:    text,
		Tag:     "ops-owner",
	})
}

// sendSync is exported via tests; production code uses Send.
func (n *Notifier) sendSync(ctx context.Context, m Mail) error {
	body := map[string]any{
		"from":    n.from,
		"to":      m.To,
		"subject": m.Subject,
		"text":    m.Text,
	}
	if m.HTML != "" {
		body["html"] = m.HTML
	}
	if m.Tag != "" {
		body["tags"] = []map[string]string{{"name": "kind", "value": m.Tag}}
	}
	buf, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, resendURL, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+n.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := n.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		// Read at most 512 bytes of error context to avoid logging
		// huge bodies if Resend returns an unexpected payload shape.
		snip, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("resend http %d: %s", resp.StatusCode, strings.TrimSpace(string(snip)))
	}
	return nil
}
