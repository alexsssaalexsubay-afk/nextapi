# Design System

**Reference**: shadcn/ui + Radix primitives + Tailwind v4 · aesthetic inspired by Vercel / Linear / Raycast.

## Principles
1. Dark-first (zinc-950 canvas). Light theme ships later.
2. One accent color: **violet-500** for primary CTAs and status=success highlight.
3. Typography scale is Tailwind defaults — `text-sm` is body, `text-2xl font-semibold` is page H1. Never invent new sizes.
4. Borders are the default divider — no box-shadows for structure.
5. Status colors are GLOBAL, not per-page:

| Status      | Token                  | Usage                                    |
|-------------|------------------------|------------------------------------------|
| queued      | zinc-400 / zinc-800    | neutral badge                            |
| running     | sky-400 / sky-950      | in-progress animation (pulse)            |
| succeeded   | emerald-400 / emerald-950 | green badge                           |
| failed      | red-400 / red-950      | red badge + destructive outline          |
| revoked     | zinc-500 / zinc-800    | muted strike                             |

## Components (in packages/ui)
- `Button` — variants: default (violet), secondary (zinc outline), destructive, ghost.
- `Badge` — variants: neutral, success, warning, destructive, info.
- `Card` — border zinc-800, bg zinc-900, padding p-6.
- `Input` — bg zinc-900, border zinc-700, focus ring violet-500/40.
- `Table` — header text-zinc-400 uppercase tracking-wider text-xs.
- `StatusBadge(status)` — single helper that maps job status → Badge variant.

## Layout
- Dashboard shell: sidebar (w-60) + top bar (h-14) + content (max-w-6xl, px-8 py-10).
- Marketing (`apps/site`): centered, max-w-6xl, generous vertical rhythm.
- Admin: same shell as dashboard but red accent (admin-only danger color).

## Forbidden
- Inline hex colors. Always Tailwind tokens.
- Custom CSS files beyond `globals.css`.
- Mixing Tailwind arbitrary values for status colors.
