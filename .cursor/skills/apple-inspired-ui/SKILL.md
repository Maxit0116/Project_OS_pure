---
name: apple-inspired-ui
description: >-
  Implements Apple Liquid Glass for Project OS workbench web UI.
  Two tiers: Tier B true lens (SVG feDisplacementMap, Outpace/Aave) for hero
  overlays; Tier A frost-chrome (backdrop-filter tokens) for bulk nav only.
  Glass is navigation-layer only — never on content cards/lists.
  Use when restyling workbench UI, tokens.css, liquid glass, GlassLens,
  GlassScene, or navigation chrome.
---

# Apple Liquid Glass UI (Web)

## Read This First: Blur Isn't Glass

Per [Outpace Studios — Liquid glass for the web](https://glass.outpacestudios.com/):

> Real glass **refracts** — the world behind bends at the rim. Take that away and you have a frosted panel: blur + bright border. **Blur isn't glass.**

Project OS uses **two tiers**:

| Tier | Name | Tech | Use for |
|------|------|------|---------|
| **B** | True lens | `GlassScene` + `GlassLens` + `feDisplacementMap` | Command palette, dropdowns, Welcome hero — anywhere bend must be visible |
| **A** | Frost chrome | `backdrop-filter` + tokens | Side panels, top bar, tab bars — bulk nav, performance-safe |

**Never label Tier A as "liquid glass" in code comments.** Use `frost-chrome`. Reserve `glass-lens` for Tier B.

Full engine spec: [references/true-glass-engine.md](references/true-glass-engine.md)  
Implementation recipe: [components/glass-lens.md](components/glass-lens.md)

## Core Concept (Non-Negotiable)

Liquid Glass is for the **navigation layer only** — toolbars, tab bars, side panel chrome, buttons, menus, command palette, toasts. It refracts background content and adapts continuously.

**Never apply glass (frost or lens) to content**: chat bubbles, agent timeline cards, diff/code blocks, graph nodes, file tree rows, harness cards, list items.

Content uses **solid surfaces** (`--color-bg-elevated`, `--color-bg-muted`) with subtle borders.

## Decision Tree

```
Need glass on a surface?
├─ Is it content (card, list row, chat, code)? → solid tokens, NO glass
├─ Is it bulk nav (side panel, status bar)?     → Tier A frost-chrome
└─ Is it hero overlay (palette, dropdown, hero)?  → Tier B GlassLens
       └─ User on Safari/Firefox? → MUST use copy+filter, NOT backdrop-filter SVG
```

## SwiftUI → Web Mapping

| Apple API | Web equivalent |
|-----------|----------------|
| `.glassEffect(.regular)` | Tier A `.glass-nav` OR Tier B `GlassLens` (hero only) |
| `.glassEffect(.clear)` | Tier A `--glass-bg-clear` over `--ambient-mesh` |
| `.glassEffect(.identity)` | `prefers-reduced-transparency` → solid fallback |
| `GlassEffectContainer` | Tier A: one `backdrop-filter` parent; Tier B: `GlassScene` |
| `.backgroundExtensionEffect()` | `--ambient-mesh` + canvas bleed under chrome |
| `.buttonStyle(.glass)` | Secondary button, solid inside glass container |
| `.buttonStyle(.glassProminent)` | Primary accent — no blur, no lens |
| Morphing nav glass | Single `GlassLens` spring between targets |

Full mapping: [references/web-mapping.md](references/web-mapping.md)

## Quick Start

1. Classify surface: **navigation** or **content**?
2. Navigation → **Tier A or B?** (decision tree above)
3. Tier B → [components/glass-lens.md](components/glass-lens.md)
4. Tier A → [components/](components/) recipes
5. Content → [components/content-surfaces.md](components/content-surfaces.md)
6. Sync tokens: [tokens.json](tokens.json) → `projectos/workbench/src/styles/tokens.css`

## Navigation Layer

| Surface | File | Tier |
|---------|------|------|
| Top bar | `layout/AppShell.module.css` | A frost |
| Side panel shell | `layout/LeftPanel`, `RightPanel` | A frost |
| Tab bar | `components/ui/TabBar` | A frost |
| Command palette | `CommandPalette` | **B lens** (target) |
| Demo dropdown | `AppShell.demoDropdown` | **B lens** (target) |
| Welcome hero card | `WelcomeScreen` | **B lens** (target) |
| Toasts | `components/ui/Toast` | A frost (or B if over rich bg) |
| Toolbar | `FunctionMap.toolbar` | A frost |
| Editor header | `FileEditorPanel.header` | A frost |

## Content Layer (No Glass)

| Surface | Use instead |
|---------|-------------|
| Chat bubbles | solid accent (user) / `--color-bg-elevated` (assistant) |
| Agent flow step cards | `--color-bg-elevated` + border |
| Function map nodes | solid elevated card |
| Diff / Monaco | `--color-code-bg` opaque |
| Tree rows | hover `--color-accent-subtle`, no blur |
| Harness / refinement cards | solid elevated + semantic border |

## True Glass Essentials (Tier B)

From [Outpace Studios](https://glass.outpacestudios.com/):

1. **Computed bend** — Snell's law, squircle dome, displacement map (not gradient fake)
2. **Refract a copy** — `filter` + counter-positioned backdrop copy; NOT `backdrop-filter` + SVG (Safari/Firefox trap)
3. **blob: URL** for map in `feImage` — never `data:` URI (WebKit silent fail)
4. **sRGB** on filter chain — not default linearRGB
5. **Safari**: fresh filter `id` per animated frame; clip copy to lens box
6. **One lens** morphs between menus — spring motion, conditional mount
7. **Accessibility**: reduced-transparency → opaque; reduced-motion → no spring

## 5-Phase Migration + Tier B

See [references/migration-guide.md](references/migration-guide.md).

Phases 1–5: Tier A frost + content cleanup + tokens.  
**Phase 6**: Tier B `GlassLens` on command palette, dropdowns, Welcome hero.

## Pitfalls

See [references/pitfalls-and-solutions.md](references/pitfalls-and-solutions.md).

Critical:
- **`backdrop-filter` + SVG = Chrome only** — use copy+filter for true glass
- **Blur isn't glass** — don't claim Tier A is liquid glass
- Glass on list items → jank
- Multiple ungrouped `backdrop-filter` → muddy sampling
- `data:` URI in `feImage` → flat frost on Safari

## Checklist

- [ ] Surface is navigation layer (if glass used)
- [ ] Hero overlay uses Tier B; bulk nav uses Tier A
- [ ] Content uses solid tokens, no `backdrop-filter`
- [ ] `--ambient-mesh` behind frost/lens so refraction is visible
- [ ] `prefers-reduced-transparency` → identity/solid fallback
- [ ] `prefers-reduced-motion` respected
- [ ] No hardcoded hex in CSS modules
- [ ] Tier B: blob URL, sRGB filter, lens-box clip, fresh filter id (Safari)

## Reference Files

| File | Purpose |
|------|---------|
| [references/true-glass-engine.md](references/true-glass-engine.md) | **Outpace physics + copy architecture** |
| [components/glass-lens.md](components/glass-lens.md) | Tier B React implementation |
| [tokens.json](tokens.json) | frost tokens + ambient mesh |
| [references/migration-guide.md](references/migration-guide.md) | 5-phase + Phase 6 Tier B |
| [references/pitfalls-and-solutions.md](references/pitfalls-and-solutions.md) | Known issues |
| [references/web-mapping.md](references/web-mapping.md) | SwiftUI + Tier A/B mapping |
| [components/glass-container.md](components/glass-container.md) | Tier A grouped sampling |
| [components/content-surfaces.md](components/content-surfaces.md) | Non-glass content |
| [components/elevation.md](components/elevation.md) | Nav vs content elevation |
| [components/button.md](components/button.md) | glass vs glassProminent |
| [components/overlay.md](components/overlay.md) | Palette, menus, toasts |
| [components/panel.md](components/panel.md) | Side panel chrome |
| [components/motion.md](components/motion.md) | Morphing, spring |

## Sources

- [Outpace Studios — Liquid glass for the web](https://glass.outpacestudios.com/) — true refraction engine
- Aave — Building Glass for the Web — backdrop-copy architecture
- [haider-nawaz/liquid-glass-skill](https://github.com/haider-nawaz/liquid-glass-skill) — SwiftUI semantics
- Apple: [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views)
- WWDC25 Session 323
