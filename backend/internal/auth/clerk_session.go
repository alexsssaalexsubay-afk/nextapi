package auth

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// ClerkClaims is the subset of the Clerk session JWT we care about.
// Default Clerk JWT template does not include email; we look it up via the
// Clerk Backend API when first provisioning a User row.
type ClerkClaims struct {
	Sub   string `json:"sub"`
	Iss   string `json:"iss"`
	Exp   int64  `json:"exp"`
	Nbf   int64  `json:"nbf"`
	Iat   int64  `json:"iat"`
	Sid   string `json:"sid"`
	Email string `json:"email,omitempty"`
}

type clerkJWKS struct {
	Keys []struct {
		Kid string `json:"kid"`
		Kty string `json:"kty"`
		N   string `json:"n"`
		E   string `json:"e"`
		Alg string `json:"alg"`
	} `json:"keys"`
}

// ClerkVerifier verifies RS256 session JWTs against Clerk's JWKS.
// Disabled (Verify returns ErrClerkDisabled) when CLERK_ISSUER is unset so
// staging/test environments do not require a Clerk instance.
type ClerkVerifier struct {
	issuer    string
	jwksURL   string
	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
	httpC     *http.Client
}

var ErrClerkDisabled = errors.New("clerk verifier not configured")

// FetchClerkUserEmail is exposed as a method too so callers that
// hold the verifier interface (e.g. AdminMiddleware) don't need a
// second dependency. Internally it just delegates to the package-
// level helper that uses CLERK_SECRET_KEY directly.
func (v *ClerkVerifier) FetchClerkUserEmail(ctx context.Context, userID string) (string, error) {
	return FetchClerkUserEmail(ctx, userID)
}

// NewClerkVerifier returns nil if CLERK_ISSUER (or CLERK_FRONTEND_API) is not
// set. Issuer should look like https://big-vulture-6.clerk.accounts.dev or your
// production custom domain (e.g. https://clerk.yourdomain.com).
func NewClerkVerifier() *ClerkVerifier {
	iss := strings.TrimRight(os.Getenv("CLERK_ISSUER"), "/")
	if iss == "" {
		iss = strings.TrimRight(os.Getenv("CLERK_FRONTEND_API"), "/")
	}
	if iss == "" {
		return nil
	}
	if !strings.HasPrefix(iss, "https://") && !strings.HasPrefix(iss, "http://") {
		iss = "https://" + iss
	}
	return &ClerkVerifier{
		issuer:  iss,
		jwksURL: iss + "/.well-known/jwks.json",
		httpC:   &http.Client{Timeout: 5 * time.Second},
		keys:    map[string]*rsa.PublicKey{},
	}
}

// Verify parses the JWT, fetches/uses cached JWKS, validates signature + iss + exp.
// Returns the claims on success.
func (v *ClerkVerifier) Verify(ctx context.Context, token string) (*ClerkClaims, error) {
	if v == nil {
		return nil, ErrClerkDisabled
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("malformed jwt")
	}
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("bad header: %w", err)
	}
	var hdr struct {
		Kid string `json:"kid"`
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(headerJSON, &hdr); err != nil {
		return nil, err
	}
	if hdr.Alg != "RS256" {
		return nil, fmt.Errorf("unsupported alg %s", hdr.Alg)
	}
	pub, err := v.key(ctx, hdr.Kid)
	if err != nil {
		return nil, err
	}
	signed := parts[0] + "." + parts[1]
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, err
	}
	h := sha256.Sum256([]byte(signed))
	if err := rsa.VerifyPKCS1v15(pub, crypto.SHA256, h[:], sig); err != nil {
		return nil, errors.New("signature invalid")
	}
	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	var c ClerkClaims
	if err := json.Unmarshal(payloadJSON, &c); err != nil {
		return nil, err
	}
	now := time.Now().Unix()
	if c.Exp != 0 && now > c.Exp+5 {
		return nil, errors.New("token expired")
	}
	if c.Nbf != 0 && now+5 < c.Nbf {
		return nil, errors.New("token not yet valid")
	}
	// Clerk issuer is the Frontend API URL; allow exact match or the same host
	// Issuer must match exactly, or be the configured issuer with an
	// optional trailing slash. HasPrefix alone would have accepted
	// `https://big-vulture-6.clerk.accounts.dev.evil.com` — close
	// enough to pass the prefix test, far enough to be hostile.
	got := strings.TrimRight(c.Iss, "/")
	want := strings.TrimRight(v.issuer, "/")
	if got != want {
		return nil, fmt.Errorf("issuer mismatch: got %q, want %q", c.Iss, v.issuer)
	}
	if c.Sub == "" {
		return nil, errors.New("missing sub claim")
	}
	return &c, nil
}

func (v *ClerkVerifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.RLock()
	if k, ok := v.keys[kid]; ok && time.Since(v.fetchedAt) < 30*time.Minute {
		v.mu.RUnlock()
		return k, nil
	}
	v.mu.RUnlock()
	if err := v.refresh(ctx); err != nil {
		return nil, err
	}
	v.mu.RLock()
	defer v.mu.RUnlock()
	if k, ok := v.keys[kid]; ok {
		return k, nil
	}
	return nil, fmt.Errorf("jwks: kid %q not found after refresh", kid)
}

func (v *ClerkVerifier) refresh(ctx context.Context) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	res, err := v.httpC.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("jwks fetch %s: %d", v.jwksURL, res.StatusCode)
	}
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	var j clerkJWKS
	if err := json.Unmarshal(body, &j); err != nil {
		return err
	}
	next := map[string]*rsa.PublicKey{}
	for _, k := range j.Keys {
		if k.Kty != "RSA" {
			continue
		}
		nb, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			continue
		}
		eb, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			continue
		}
		next[k.Kid] = &rsa.PublicKey{
			N: new(big.Int).SetBytes(nb),
			E: int(new(big.Int).SetBytes(eb).Int64()),
		}
	}
	if len(next) == 0 {
		return errors.New("jwks contained no usable keys")
	}
	v.mu.Lock()
	v.keys = next
	v.fetchedAt = time.Now()
	v.mu.Unlock()
	return nil
}

// FetchClerkUserEmail calls the Clerk Backend API to look up a user's primary
// email by Clerk user ID. Returns ("", nil) if CLERK_SECRET_KEY is not set so
// the bootstrap path can still proceed (with an empty email).
func FetchClerkUserEmail(ctx context.Context, userID string) (string, error) {
	secret := os.Getenv("CLERK_SECRET_KEY")
	if secret == "" || userID == "" {
		return "", nil
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://api.clerk.com/v1/users/"+userID, nil)
	req.Header.Set("Authorization", "Bearer "+secret)
	c := &http.Client{Timeout: 5 * time.Second}
	res, err := c.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return "", fmt.Errorf("clerk user lookup: %d", res.StatusCode)
	}
	var body struct {
		PrimaryEmailAddressID string `json:"primary_email_address_id"`
		EmailAddresses        []struct {
			ID           string `json:"id"`
			EmailAddress string `json:"email_address"`
		} `json:"email_addresses"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return "", err
	}
	for _, e := range body.EmailAddresses {
		if e.ID == body.PrimaryEmailAddressID {
			return e.EmailAddress, nil
		}
	}
	if len(body.EmailAddresses) > 0 {
		return body.EmailAddresses[0].EmailAddress, nil
	}
	return "", nil
}
