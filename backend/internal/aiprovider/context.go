package aiprovider

import "context"

type contextKey string

const (
	contextOrgID            contextKey = "nextapi.ai_provider.org_id"
	contextUserID           contextKey = "nextapi.ai_provider.user_id"
	contextDirectorMetering contextKey = "nextapi.ai_provider.director_metering"
)

// WithOrgID annotates provider calls so usage logs can be attributed to an org.
func WithOrgID(ctx context.Context, orgID string) context.Context {
	if orgID == "" {
		return ctx
	}
	return context.WithValue(ctx, contextOrgID, orgID)
}

func orgIDFromContext(ctx context.Context) *string {
	value, ok := ctx.Value(contextOrgID).(string)
	if !ok || value == "" {
		return nil
	}
	return &value
}

// WithUserID is optional for first-party sessions; API-key calls may not have one.
func WithUserID(ctx context.Context, userID string) context.Context {
	if userID == "" {
		return ctx
	}
	return context.WithValue(ctx, contextUserID, userID)
}

func userIDFromContext(ctx context.Context) string {
	value, ok := ctx.Value(contextUserID).(string)
	if !ok {
		return ""
	}
	return value
}

// WithDirectorMetering marks provider calls that belong to AI Director flows.
// The runtime writes usage rows to director_metering for audit/cost analysis.
func WithDirectorMetering(ctx context.Context) context.Context {
	return context.WithValue(ctx, contextDirectorMetering, true)
}

func directorMeteringFromContext(ctx context.Context) bool {
	value, ok := ctx.Value(contextDirectorMetering).(bool)
	return ok && value
}
