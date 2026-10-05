<!-- BEGIN:PROJECTOS-FEATURES -->
## Project OS Semantic Feature Map

When the user asks to scan / sync a function story map, or after finishing a logical feature checkpoint:

1. Read `.projectos/prompts/scan.md` or `sync.md` (and `_schema.md` / `_rules.md`).
2. Prefer `features_scan` / `features_sync` tools when available.
3. Write `.projectos/features.json` only after Zod-valid content; never invent epic_flow in the UI.
4. Respect `locked: true`. Upgrade `planned` → implemented only with refs evidence.
5. Tell the user to open Workbench → Function Map → **Story**.
<!-- END:PROJECTOS-FEATURES -->

<!-- BEGIN:PROJECTOS-DESIGN-ANTISLOP -->
## Project OS Design tab · anti-slop

Design tab Sketch uses `@gessobuild/anti-slop` as the gate authority on **exported HTML** (not JSX). Host Intent rules (sketch regions, etc.) run alongside.

- Install skill (optional, for agents): `npx skills add Gesso-Build/skills`
- CLI check: `npx -y @gessobuild/anti-slop check path/to/screen.html`
- In Workbench: Critique → PASS (or override reason) before Propose / Confirm / Hand to agent
- `design.md` is a **derived** handoff; Design IR / design-blocks remain canonical
- Do **not** Sketch → Code; keep Input → Intent → Graph Mutation → Confirm
<!-- END:PROJECTOS-DESIGN-ANTISLOP -->

