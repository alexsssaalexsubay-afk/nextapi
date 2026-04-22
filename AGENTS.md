# Project AGENTS

## Mission
- Build a minimal, reviewable `nextapi-v3` slice before expanding the product surface area.
- Prefer a working vertical slice over broad but unverified scaffolding.

## Required workflow
1. Read the nearest design doc or write one focused module doc.
2. Implement the smallest useful slice.
3. Run a concrete validation step.
4. Update status using only verified facts.
5. Create or recommend a commit boundary when the slice is stable.

## Hard rules
- Do not keep adding modules while the current slice is unvalidated.
- `No commit` plus `no meaningful test/build evidence` means the work is not done.
- `STATUS.md` may only mark an area `closed-loop` when there is executable evidence.
- If a feature is blocked by secrets, external services, or deployment prerequisites, mark it as blocked rather than done.

## Current priorities
- Get the monorepo to a first stable commit.
- Prefer `build/test/run` closure over more docs or new subsystems.
- Keep `dashboard`, `admin`, `site`, and the backend API aligned around one reviewable flow.

## Coordination
- Keep names aligned with the local tool stack: `context7`, `github`, `playwright`, `codex`.
- Use Codex for second-pass review, validation, and MCP troubleshooting when helpful.
- Keep file paths, routes, env vars, and terms consistent across docs and code.
