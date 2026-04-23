package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

// validateCache memoises successful Validate() outcomes for a few
// minutes so /v1/videos doesn't burn ~50ms of Argon2id CPU per
// request. Without it a single attacker holding one valid prefix can
// flood the box with bad-secret guesses and DoS us with our own
// password hasher.
//
// Keys are sha256(raw) hex — never the raw token, never the verified
// hash. We also key the ValidKey snapshot so the caller still sees a
// stable answer for the lifetime of the entry.
type validateCache struct {
	mu      sync.RWMutex
	items   map[string]validateCacheItem
	ttl     time.Duration
	negTTL  time.Duration
	maxSize int
}

type validateCacheItem struct {
	expiresAt time.Time
	ok        bool // true = positive (vk valid), false = negative (deny)
	vk        *ValidKey
}

func newValidateCache() *validateCache {
	return &validateCache{
		items:   make(map[string]validateCacheItem, 1024),
		ttl:     5 * time.Minute,  // positive entries: live keys rarely change
		negTTL:  30 * time.Second, // negative entries: short, so revoke + retry feels snappy
		maxSize: 5000,
	}
}

func cacheKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (c *validateCache) get(raw string) (validateCacheItem, bool) {
	k := cacheKey(raw)
	c.mu.RLock()
	it, ok := c.items[k]
	c.mu.RUnlock()
	if !ok {
		return validateCacheItem{}, false
	}
	if time.Now().After(it.expiresAt) {
		c.mu.Lock()
		delete(c.items, k)
		c.mu.Unlock()
		return validateCacheItem{}, false
	}
	return it, true
}

func (c *validateCache) putPositive(raw string, vk *ValidKey) {
	c.put(validateCacheItem{
		expiresAt: time.Now().Add(c.ttl),
		ok:        true,
		vk:        vk,
	}, raw)
}

func (c *validateCache) putNegative(raw string) {
	c.put(validateCacheItem{
		expiresAt: time.Now().Add(c.negTTL),
		ok:        false,
	}, raw)
}

func (c *validateCache) put(it validateCacheItem, raw string) {
	k := cacheKey(raw)
	c.mu.Lock()
	defer c.mu.Unlock()
	// Trivial cap: when the table grows past maxSize, blow it away.
	// Real LRU is overkill here — the memory cost is low and the
	// throughput gain is huge anyway.
	if len(c.items) >= c.maxSize {
		c.items = make(map[string]validateCacheItem, 1024)
	}
	c.items[k] = it
}

// Invalidate removes a cache entry by raw key (not the hash).
// Call this after revoking or disabling a key when the raw secret is known.
func (c *validateCache) Invalidate(raw string) {
	if raw == "" {
		return
	}
	k := cacheKey(raw)
	c.mu.Lock()
	delete(c.items, k)
	c.mu.Unlock()
}

// InvalidateByKeyID removes any cache entry whose APIKey.ID matches keyID.
// This is slower than Invalidate (O(n) scan) but necessary when the caller
// only has the key's database ID, not the raw secret — e.g. RevokeKey and
// SetDisabled which operate by ID.
func (c *validateCache) InvalidateByKeyID(keyID string) {
	if keyID == "" {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, it := range c.items {
		if it.ok && it.vk != nil && it.vk.APIKey != nil && it.vk.APIKey.ID == keyID {
			delete(c.items, k)
			return // key IDs are unique; stop after first match
		}
	}
}
