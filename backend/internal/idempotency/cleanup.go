package idempotency

import (
	"context"
	"log"

	"gorm.io/gorm"
)

// CleanupExpired deletes idempotency_keys rows older than 24 hours.
// Should be called periodically (e.g. every hour) from the worker.
func CleanupExpired(ctx context.Context, db *gorm.DB) error {
	result := db.WithContext(ctx).Exec(
		`DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'`)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		log.Printf("idempotency: cleaned %d expired keys", result.RowsAffected)
	}
	return nil
}
