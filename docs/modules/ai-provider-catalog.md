# AI Provider Catalog

This catalog keeps model choice layered instead of dumping every model into the product UI.

## Runtime Contract

- Text providers call `GenerateTextWithProvider`.
- Image providers call `GenerateImageWithProvider`.
- Video providers continue to use the existing video task path (`createVideoTask`, Seedance relay, jobs, billing).
- API keys stay encrypted in `ai_providers`; frontend never receives keys.
- Native video provider config is normalized as a NextAPI-owned route:
  `api_style=native_video`, `director_role=video_generation`,
  `task_status_mode=nextapi_job`, `billing_mode=nextapi_ledger`,
  `provider_keys_exposed=false`, and `upstream_exposed=false`.
  Admin must reject native video rows that explicitly set either exposure flag
  to `true`.

## Admin Presets

Admin `AI providers` now offers presets so an operator chooses a provider/model and only fills the key:

- OpenAI: GPT text and GPT Image slots
- Anthropic: Claude via native Messages API
- Google: Gemini text and Nano Banana image slot through the OpenAI-compatible base URL where supported
- BytePlus: Seed, Seedream, Seedance, OmniHuman catalog slots
- DeepSeek, Qwen/DashScope, GLM/Zhipu, Kimi/Moonshot, MiniMax
- FLUX, Kling placeholders for future native adapters

## Admin Configurable Fields

Provider configuration must stay explicit and auditable. Admin may configure:

| Field | Purpose | Required guardrail |
|-------|---------|--------------------|
| `provider_id` | Stable internal routing id. | Immutable after jobs exist; create a new provider instead of renaming history. |
| `display_name` | Localized operator/user-facing label. | Must have English and Chinese copy if exposed outside admin-only debug views. |
| `provider_family` | Groups OpenAI, Anthropic, Google, BytePlus, Qwen, etc. | Drives filtering only; not proof of API compatibility. |
| `capabilities` | `text`, `image`, `video`, `storyboard`, `script`, `embedding`, `digital_human`. | UI must hide or disable incompatible workflow nodes. |
| `base_url` | Endpoint root for compatible APIs. | Never expose secrets in URLs. |
| `api_key` | Encrypted credential. | Frontend never receives decrypted keys. |
| `default_model` | Model used when workflow/template does not override. | Must be shown in model picker and run metadata. |
| `allowed_models` | Operator-approved models for this provider. | Fallback may only choose from this list. |
| `enabled` | Whether runtime can route traffic here. | Disabled providers stay visible as setup requirements but are not actionable. |
| `priority` | Routing preference among equivalent providers. | Must not override a user-selected model silently. |
| `timeout_ms` | Runtime timeout by provider. | Errors must be sanitized but observable in logs. |
| `cost_policy` | Pricing/metering hint for planning/image/video usage. | User estimate must distinguish planning, image, video, and merge. |
| `fallback_allowed` | Whether this provider can be used as fallback. | Requires user/workflow/admin policy visibility before launch. |

Model configuration must also record who chose it: admin default, template default, user selection, API request, or fallback policy. This source is part of the run metadata.

## Product Routing

- Director script/storyboard generation should prefer `text` providers with `script` or `storyboard` capability.
- Shot reference generation should prefer `image` providers.
- Canvas video nodes should only show `video` providers/models.
- Digital-human models stay out of normal video pickers until an avatar workflow exists.
- Director `engine: "advanced"` is not a model id. It is a runtime request whose actual result must still record provider id, model id, engine outcome, and fallback status.
- A provider-managed fallback is acceptable only when `fallback_allowed` is true and the response surfaces the change. Hidden provider/model substitution is not allowed.

## Acceptance Criteria

- Admin can see whether each configured provider is enabled, credentialed, capability-compatible, and selected as a default.
- Product UI can explain why a model is unavailable without exposing secrets or raw provider errors.
- A run record includes requested provider/model, actual provider/model, selection source, and fallback reason when they differ.
- Deleting or disabling a provider must not break historical job/workflow metadata.

## Caveat

OpenAI-compatible text providers are wired today. Anthropic text is wired through native Messages API. Vendor-native image/video APIs that do not expose an OpenAI-compatible `/images/generations` or the existing video task contract must get a dedicated adapter before being marked live.
