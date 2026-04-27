package aiprovider

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"os"
	"strings"

	"golang.org/x/crypto/pbkdf2"
)

const encryptionEnv = "AI_PROVIDER_KEY_ENCRYPTION_SECRET"

var ErrEncryptionKeyMissing = errors.New("ai_provider_encryption_key_missing")

func EncryptAPIKey(plain string) (string, string, error) {
	plain = strings.TrimSpace(plain)
	if plain == "" {
		return "", "", nil
	}
	secret := strings.TrimSpace(os.Getenv(encryptionEnv))
	if secret == "" {
		return "", "", ErrEncryptionKeyMissing
	}
	block, err := aes.NewCipher(deriveKey(secret))
	if err != nil {
		return "", "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", "", err
	}
	sealed := append(nonce, gcm.Seal(nil, nonce, []byte(plain), nil)...)
	return base64.StdEncoding.EncodeToString(sealed), keyHint(plain), nil
}

func DecryptAPIKey(encrypted string) (string, error) {
	encrypted = strings.TrimSpace(encrypted)
	if encrypted == "" {
		return "", nil
	}
	secret := strings.TrimSpace(os.Getenv(encryptionEnv))
	if secret == "" {
		return "", ErrEncryptionKeyMissing
	}
	raw, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(deriveKey(secret))
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("invalid encrypted api key")
	}
	nonce := raw[:gcm.NonceSize()]
	ciphertext := raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func deriveKey(secret string) []byte {
	return pbkdf2.Key([]byte(secret), []byte("nextapi-ai-provider-keys-v1"), 100000, 32, sha256.New)
}

func keyHint(v string) string {
	if len(v) <= 8 {
		return strings.Repeat("*", len(v))
	}
	return v[:4] + "..." + v[len(v)-4:]
}
