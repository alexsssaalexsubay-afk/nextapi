# NextAPI Visual Design System

This document is the shared visual contract for the public site, dashboard, and admin console. Keep it aligned across Codex, Cursor, and Claude changes.

## Product Direction

NextAPI should feel like a cinematic AI operations console: sharp, premium, fast, and trustworthy. Avoid plain white SaaS blocks. Use depth, glass, gradients, and motion only when they improve hierarchy or feedback.

## Color Roles

- `Brand primary`: blue -> violet -> fuchsia gradient. Use for the one primary action per view, active navigation, and important progress routes.
- `Surface`: neutral card/background layers. Use translucent cards over aurora backgrounds to create depth without losing readability.
- `Success`: green. Use for completed jobs, healthy systems, paid/active states.
- `Warning`: amber. Use for pending setup, risk, queue pressure, and retryable issues.
- `Danger`: red/rose. Use only for destructive actions, failed jobs, auth failure, or financial risk.
- `Info`: cyan/blue. Use for neutral guidance, docs, model metadata, and routing hints.

Never rely on color alone. Pair status color with icon, label, and/or copy.

## Button Roles

- `Primary`: one or two per view. Use `.premium-button`, filled gradient, strong shadow, clear verb.
- `Secondary`: glass/outlined card button. Use for docs, preview, cancel, details.
- `Ghost`: low-emphasis utility actions inside dense panels.
- `Danger`: destructive actions only, red/rose border or fill depending on severity.
- `Loading`: preserve button size and show spinner/text state; never silently disable without explanation.

## World-Class UX Requirements

Every production surface should make the next safe action obvious.

| UX moment | Required behavior | Evidence to check |
|-----------|-------------------|-------------------|
| First visit | Show one recommended starting path and one docs/help path. | User can find a useful action in under 5 seconds without reading a full page. |
| Provider missing | Show setup status, impacted features, and admin link/copy. | The disabled CTA explains exactly which provider/model is missing. |
| Director degraded | Show actual engine state, not only requested mode. | Copy distinguishes `advanced_sidecar`, `advanced_fallback`, and `nextapi`. |
| Long-running work | Show queued/running/progress/retry/final states with timestamps when available. | Refreshing the page does not lose the user's place. |
| Download ready | Show a stable download/use entry beside the completed asset. | User can download, copy API output, or open the generated workflow from the result card. |
| Error | Explain whether the user can retry, change input, contact support, or wait. | Error copy includes an action and avoids raw provider stack details. |

World-class does not mean more decoration. It means fewer ambiguous states, faster recovery, and honest system feedback.

## Motion Rules

- Motion must communicate state: loading, routing, streaming, success, retry, or selection.
- Keep motion subtle and purposeful. Avoid decorative infinite motion on dense admin tables.
- Respect `prefers-reduced-motion` when adding larger animations.
- Use shimmer/sweep only for in-progress surfaces, not as permanent decoration.

## Layout Rules

- Public site: large cinematic hero, strong CTA, visual proof, less table-like UI.
- Dashboard: calm operator console with aurora depth, glass topbar/sidebar, clear active route.
- Admin: higher contrast and sharper status colors because it is an operations cockpit.
- Forms: do not tile every model or parameter. Use compact selectors, progressive disclosure, sliders for bounded values, and advanced accordions.

## Model Picker Rules

- Default to recommended models by task.
- Group by provider family: OpenAI, Anthropic, Google, BytePlus, Alibaba/Qwen, Zhipu/GLM, Moonshot/Kimi, MiniMax, DeepSeek, Black Forest Labs, Kuaishou.
- Show provider badge/logo, model name, capability tags, and live/unconfigured status.
- Do not expose unavailable models as equally actionable. They should be visible but muted until key/provider is configured.
- If a model is selected automatically, show the source: admin default, workflow template, user override, or provider fallback.
- Never switch models silently after submit. If routing changes after a failure, surface the retry model and reason before billing/launch.

## i18n Contract

- All user-visible copy in dashboard/admin/site must go through the shared i18n message files, not inline page strings.
- English and Chinese keys must be added in the same change. A missing translation is a failed review, not a later cleanup.
- Status labels, button labels, error reasons, provider names, and model capability tags must use stable keys so screenshots and support docs stay aligned.
- Machine-readable values stay English snake_case or lower-case identifiers; localized copy wraps them for users.
- Acceptance: run the existing i18n check after copy changes, or explicitly state why it was not run.

## Source Principles

- Apple HIG: color should communicate status/interactivity consistently; prominent button color should be reserved for primary actions; motion should support feedback rather than distract.
- Material Design: color roles should be semantic and tokenized; primary is for prominent actions/active states, secondary/tertiary for lower emphasis.
- Status color conventions: success/warning/error/info must be distinct and accessible, with labels or icons.
