import { ApiError } from "@/lib/api"

/**
 * Maps backend `error.code` (dotted) to `jobs.errors.*` keys in i18n.
 * Keep in sync with backend/internal/gateway/videos.go and related handlers.
 */
const ERROR_CODE_TO_I18N_KEY: Record<string, string> = {
  "insufficient_quota.balance": "insufficient_quota_balance",
  "insufficient_quota.budget_cap": "insufficient_quota_budget_cap",
  "insufficient_quota.monthly_limit": "insufficient_quota_monthly_limit",
  "insufficient_quota.org_paused": "insufficient_quota_org_paused",
  "insufficient_quota.inflight_exceeded": "insufficient_quota_inflight_exceeded",
  "rate_limited.burst_exceeded": "rate_limited_burst_exceeded",
  "content_moderation.blocked": "content_moderation_blocked",
  "content_moderation.review_required": "content_moderation_review_required",
  "insufficient_credits": "insufficient_credits",
  "authentication.invalid_key": "authentication_invalid_key",
  "authorization.ip_not_allowed": "authorization_ip_not_allowed",
  "invalid_request": "invalid_request",
  "invalid_state": "invalid_state",
  "not_found": "not_found",
  "internal": "internal_error",
  "internal_error": "internal_error",
  "idempotent_request_in_progress": "idempotent_request_in_progress",
  "idempotency_conflict": "idempotency_conflict",
  "bad_request": "bad_request",
  "invalid_image_url": "invalid_image_url",
  "invalid_image_urls": "invalid_image_urls",
  "invalid_video_urls": "invalid_video_urls",
  "invalid_audio_urls": "invalid_audio_urls",
  "invalid_first_frame_url": "invalid_first_frame_url",
  "invalid_last_frame_url": "invalid_last_frame_url",
  "spend_cap_exceeded": "spend_cap_exceeded",
  "moderation_blocked": "moderation_blocked",
  "rate_limited": "rate_limited",
}

type JobsErrors = Record<string, string>

/**
 * User-facing copy for API failures (locale from `t`).
 */
export function jobApiErrorMessage(
  t: { jobs: { errors: JobsErrors } },
  err: unknown,
): string {
  if (!(err instanceof ApiError)) {
    return t.jobs.errors.unknown
  }
  const raw = err.code?.trim()
  if (raw) {
    const i18nKey = ERROR_CODE_TO_I18N_KEY[raw] ?? raw.replace(/\./g, "_")
    const msg = t.jobs.errors[i18nKey]
    if (msg) return msg
  }
  return t.jobs.errors.unknown
}
