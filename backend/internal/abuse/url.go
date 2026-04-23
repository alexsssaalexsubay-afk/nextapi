package abuse

import (
	"errors"
	"net"
	"net/url"
	"strings"
)

// ValidatePublicURL is a lightweight (no-DNS) sanity check used at
// request time on user-supplied URLs that we forward to upstream
// providers (e.g. Seedance fetches `image_url`). It does NOT replace
// the webhook SafeDialer — providers do their own egress, so we only
// reject the obvious metadata / loopback cases here. Wins-per-line is
// still high: a customer typing `http://169.254.169.254/iam/...` and
// having Seedance dutifully fetch it on our behalf is a classic
// vendor-SSRF amplification.
func ValidatePublicURL(raw string) error {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return errors.New("invalid url")
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "https" && scheme != "http" {
		return errors.New("only http/https urls are accepted")
	}
	if u.Host == "" {
		return errors.New("missing host")
	}
	host := strings.ToLower(u.Hostname())
	switch host {
	case "localhost", "metadata", "metadata.google.internal":
		return errors.New("blocked: cloud metadata or loopback host")
	}
	if ip := net.ParseIP(host); ip != nil && !isPublicIPLite(ip) {
		return errors.New("blocked: private / loopback / link-local IP")
	}
	return nil
}

// isPublicIPLite is a slim copy of webhook.isPublicIP. Kept here to
// avoid an import cycle (abuse → webhook would pull in gorm etc).
func isPublicIPLite(ip net.IP) bool {
	if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() ||
		ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	if v4 := ip.To4(); v4 != nil {
		switch {
		case v4[0] == 10,
			v4[0] == 127,
			v4[0] == 0,
			v4[0] == 169 && v4[1] == 254,
			v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31,
			v4[0] == 192 && v4[1] == 168,
			v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127:
			return false
		}
		return true
	}
	if ip[0]&0xfe == 0xfc {
		return false
	}
	return true
}
