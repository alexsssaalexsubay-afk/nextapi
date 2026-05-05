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

export type JobErrorCopy = {
  summary: string
  detail?: string
}

function explainUpstreamError(
  t: { jobs: { errors: JobsErrors } },
  code?: string | null,
  message?: string | null,
): string {
  const lower = `${code || ""} ${message || ""}`.toLowerCase()
  if (
    lower.includes("prompt too long") ||
    (lower.includes("max 2000") && lower.includes("prompt"))
  ) {
    return t.jobs.errors.upstream_prompt_too_long_public_api
  }
  if (
    lower.includes("resource download failed") ||
    lower.includes("could not download") ||
    lower.includes("download failed")
  ) {
    return t.jobs.errors.upstream_media_download_failed
  }
  if (
    lower.includes("real person") ||
    lower.includes("real human") ||
    lower.includes("portrait was not approved") ||
    lower.includes("asset library") ||
    lower.includes("face-consistency")
  ) {
    return t.jobs.errors.upstream_real_person_asset_required
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("rate limited") ||
    lower.includes("too many requests")
  ) {
    return t.jobs.errors.upstream_rate_limited
  }
  if (
    lower.includes("service unavailable") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("provider error") ||
    lower.includes("bad gateway") ||
    lower.includes("overloaded")
  ) {
    return t.jobs.errors.upstream_service_unavailable
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return t.jobs.errors.upstream_timeout
  }
  if (lower.includes("insufficient balance")) {
    return t.jobs.errors.upstream_insufficient_balance
  }
  if (
    lower.includes("invalidparameter") ||
    lower.includes("invalid parameter") ||
    lower.includes("invalid request") ||
    lower.includes("unprocessable") ||
    lower.includes("mutually exclusive") ||
    lower.includes("too many video_urls") ||
    lower.includes("too many image_urls")
  ) {
    return t.jobs.errors.upstream_invalid_request
  }
  return t.jobs.errors.upstream_rejected
}

export function describeJobError(
  t: { jobs: { errors: JobsErrors } },
  code?: string | null,
  message?: string | null,
): JobErrorCopy {
  const normalizedCode = code?.trim() || ""
  const raw = message?.trim() || ""
  if (normalizedCode) {
    const i18nKey = ERROR_CODE_TO_I18N_KEY[normalizedCode] ?? normalizedCode.replace(/\./g, "_")
    const mapped = t.jobs.errors[i18nKey]
    if (mapped) {
      return {
        summary: mapped,
        detail: raw && raw !== mapped ? raw : undefined,
      }
    }
  }
  if (raw) {
    return {
      summary: explainUpstreamError(t, normalizedCode || undefined, raw),
      detail: raw,
    }
  }
  return { summary: t.jobs.errors.unknown }
}

/**
 * User-facing copy for API failures (locale from `t`).
 */
export function jobApiErrorMessage(
  t: { jobs: { errors: JobsErrors } },
  err: unknown,
): string {
  const copy = err instanceof ApiError
    ? describeJobError(t, err.code, err.message)
    : { summary: t.jobs.errors.unknown }
  return copy.detail ? `${copy.summary} ${t.jobs.errors.upstream_original}: ${copy.detail}` : copy.summary
}
