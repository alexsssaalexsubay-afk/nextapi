package webhook

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"syscall"
	"time"
)

// SafeDial enforces a strict outbound policy for customer webhook URLs:
//
//   - https only (or http when WEBHOOK_ALLOW_HTTP=true, off by default)
//   - host MUST resolve to a public, routable IP (no RFC1918, no loopback,
//     no link-local, no CGNAT, no multicast, no IPv4-mapped IPv6 of the same)
//   - dial timeout fixed; redirect target re-validated on every hop
//
// This stops a customer from configuring `https://169.254.169.254/...`
// (cloud metadata) or `http://10.0.0.5:9200/_search` and tunnelling
// through our box into our private network — classic SSRF amplification.
//
// Optional WEBHOOK_HOST_ALLOWLIST="*.acme.com,client-ops.example" further
// pins the egress to known partner domains; empty disables the allowlist
// (any public host is fine).
type SafeDialer struct {
	allowHTTP    bool
	hostMatchers []string // lowercased; either bare host or ".suffix"
	dialer       *net.Dialer
}

func newSafeDialer() *SafeDialer {
	return &SafeDialer{
		allowHTTP:    strings.EqualFold(os.Getenv("WEBHOOK_ALLOW_HTTP"), "true"),
		hostMatchers: parseHostAllowlist(os.Getenv("WEBHOOK_HOST_ALLOWLIST")),
		dialer:       &net.Dialer{Timeout: 5 * time.Second},
	}
}

func parseHostAllowlist(v string) []string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		s := strings.TrimSpace(strings.ToLower(p))
		if s == "" {
			continue
		}
		if strings.HasPrefix(s, "*.") {
			s = s[1:] // store ".acme.com"
		}
		out = append(out, s)
	}
	return out
}

// Validate is called both during webhook create (so the customer gets
// a 400 immediately) and on every dial (so DNS rebinding can't bypass).
func (sd *SafeDialer) Validate(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return errors.New("invalid url")
	}
	switch strings.ToLower(u.Scheme) {
	case "https":
	case "http":
		if !sd.allowHTTP {
			return errors.New("http webhook urls are forbidden; use https")
		}
	default:
		return errors.New("unsupported scheme; only https is allowed")
	}
	if u.Host == "" {
		return errors.New("missing host")
	}
	host := strings.ToLower(u.Hostname())
	if !sd.hostAllowed(host) {
		return errors.New("host not in WEBHOOK_HOST_ALLOWLIST")
	}
	if isLiteralUnsafeHost(host) {
		return errors.New("host points at a private / loopback / metadata address")
	}
	return nil
}

func (sd *SafeDialer) hostAllowed(host string) bool {
	if len(sd.hostMatchers) == 0 {
		return true
	}
	for _, m := range sd.hostMatchers {
		if strings.HasPrefix(m, ".") {
			if strings.HasSuffix(host, m) {
				return true
			}
		} else if host == m {
			return true
		}
	}
	return false
}

func isLiteralUnsafeHost(host string) bool {
	// Block obvious metadata aliases regardless of DNS.
	switch host {
	case "localhost", "metadata", "metadata.google.internal":
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return !isPublicIP(ip)
	}
	return false
}

// Control is the hook into net.Dialer that runs after DNS resolution
// but before the syscall connects, so we can refuse dialing private
// addresses returned by malicious or rebinding DNS.
func (sd *SafeDialer) Control(network, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return errors.New("dial target is not a literal ip after dns resolution")
	}
	if !isPublicIP(ip) {
		return errors.New("refused: dial target is a private/loopback/cloud-metadata ip")
	}
	return nil
}

// isPublicIP returns true only for globally-routable unicast addresses.
func isPublicIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	if ip4 := ip.To4(); ip4 != nil {
		switch {
		case ip4[0] == 10:
			return false
		case ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31:
			return false
		case ip4[0] == 192 && ip4[1] == 168:
			return false
		case ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127:
			// CGNAT 100.64.0.0/10
			return false
		case ip4[0] == 169 && ip4[1] == 254:
			// Link-local + AWS/GCP IMDS
			return false
		case ip4[0] == 127:
			return false
		case ip4[0] == 0:
			return false
		}
		return true
	}
	// IPv6: deny ULA fc00::/7 and the IPv4-mapped variants of the above
	if ip[0]&0xfe == 0xfc {
		return false
	}
	if v4 := ip.To4(); v4 != nil {
		return isPublicIP(v4)
	}
	return true
}

// Transport returns an http.Transport configured to use Control as
// the dial guard. Use a single instance per process and reuse it.
func (sd *SafeDialer) Transport() *http.Transport {
	d := &net.Dialer{Timeout: sd.dialer.Timeout, Control: sd.Control}
	return &http.Transport{
		DialContext:           d.DialContext,
		ResponseHeaderTimeout: 10 * time.Second,
		IdleConnTimeout:       30 * time.Second,
		MaxIdleConns:          100,
	}
}

// CheckRedirect plugs into http.Client to re-validate every redirect
// hop, defeating "redirect to metadata" tricks where the customer's
// real endpoint is fine but issues a 302 to 169.254.169.254.
func (sd *SafeDialer) CheckRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= 5 {
		return errors.New("too many redirects")
	}
	return sd.Validate(req.URL.String())
}

// Compose builds a hardened http.Client out of this dialer.
func (sd *SafeDialer) Client(timeout time.Duration) *http.Client {
	return &http.Client{
		Transport:     sd.Transport(),
		Timeout:       timeout,
		CheckRedirect: sd.CheckRedirect,
	}
}

// Background returns a non-cancelling context for tests.
func backgroundCtx() context.Context { return context.Background() }
