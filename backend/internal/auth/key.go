package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Key format: <kind>_<env>_<24 hex chars><16 hex secret>
// kind ∈ {sk, ak}, env ∈ {live, test}.
// Prefix (public) is first 20 chars e.g. "sk_live_abc123def456".

type Kind string

const (
	KindBusiness Kind = "sk" // /videos, /models
	KindAdmin    Kind = "ak" // /keys, /webhooks, /credits, /usage, /spend_controls, /moderation_profile
)

type Env string

const (
	EnvLive Env = "live"
	EnvTest Env = "test"
)

const (
	argonTime      = 1
	argonMemory    = 64 * 1024
	argonThreads   = 4
	argonKeyLength = 32
)

var (
	ErrInvalidKey = errors.New("invalid api key")
	ErrBadHash    = errors.New("bad argon2 hash")
)

// NewKey returns (full, prefix, kind, env).
func NewKey(kind Kind, env Env) (full string, prefix string, err error) {
	buf := make([]byte, 20)
	if _, err = rand.Read(buf); err != nil {
		return "", "", err
	}
	hexStr := hex.EncodeToString(buf)
	head := string(kind) + "_" + string(env) + "_"
	prefix = head + hexStr[:12]
	full = head + hexStr
	return
}

// ParsePrefix extracts prefix (first "sk_live_xxxxx" or similar) OR returns "".
func ParsePrefix(full string) string {
	// find second and third underscore
	parts := strings.SplitN(full, "_", 3)
	if len(parts) != 3 {
		return ""
	}
	tail := parts[2]
	if len(tail) < 12 {
		return ""
	}
	return parts[0] + "_" + parts[1] + "_" + tail[:12]
}

func ClassifyKey(full string) (Kind, Env, error) {
	if len(full) < 8 {
		return "", "", ErrInvalidKey
	}
	var kind Kind
	switch {
	case strings.HasPrefix(full, "sk_"):
		kind = KindBusiness
	case strings.HasPrefix(full, "ak_"):
		kind = KindAdmin
	default:
		return "", "", ErrInvalidKey
	}
	var env Env
	switch {
	case strings.HasPrefix(full, string(kind)+"_live_"):
		env = EnvLive
	case strings.HasPrefix(full, string(kind)+"_test_"):
		env = EnvTest
	default:
		return "", "", ErrInvalidKey
	}
	return kind, env, nil
}

func Hash(full string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	h := argon2.IDKey([]byte(full), salt, argonTime, argonMemory, argonThreads, argonKeyLength)
	return fmt.Sprintf("argon2id$%d$%d$%d$%s$%s",
		argonTime, argonMemory, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(h),
	), nil
}

func Verify(full, encoded string) error {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "argon2id" {
		return ErrBadHash
	}
	var t, m, p uint32
	if _, err := fmt.Sscanf(parts[1]+" "+parts[2]+" "+parts[3], "%d %d %d", &t, &m, &p); err != nil {
		return ErrBadHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return ErrBadHash
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return ErrBadHash
	}
	got := argon2.IDKey([]byte(full), salt, t, m, uint8(p), uint32(len(want)))
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return ErrInvalidKey
	}
	return nil
}

// Deprecated: kept for backwards compat with legacy tests. Uses NewKey(KindBusiness, EnvLive).
func PrefixOf(full string) string { return ParsePrefix(full) }
