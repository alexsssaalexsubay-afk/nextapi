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

## Source Principles

- Apple HIG: color should communicate status/interactivity consistently; prominent button color should be reserved for primary actions; motion should support feedback rather than distract.
- Material Design: color roles should be semantic and tokenized; primary is for prominent actions/active states, secondary/tertiary for lower emphasis.
- Status color conventions: success/warning/error/info must be distinct and accessible, with labels or icons.
