# Liquid Glass Web Migration Guide

5-phase workflow adapted from [liquid-glass-skill migration-guide](https://github.com/haider-nawaz/liquid-glass-skill/blob/main/plugins/liquid-glass/skills/liquid-glass/references/migration-guide.md).

## Phase 1: Navigation Chrome (Auto-Adopt)

Apply glass to system chrome first — highest visual impact, lowest risk.

**Targets:**
- `layout/AppShell.module.css` — topBar, demoDropdown, terminalBar
- `layout/LeftPanel.module.css` / `RightPanel.module.css` — panel shell
- `layout/ThreeZoneLayout.module.css` — drawer scrim, resize handle
- `components/ui/TabBar.module.css`
- `components/CommandPalette.module.css`
- `components/ui/Toast.module.css`

**Verify:** dev server shows translucent top bar and side panels; content area unchanged.

## Phase 2: Remove Conflicting Customizations

Strip glass and heavy custom backgrounds from **content** surfaces.

**Remove `backdrop-filter` from:**
- `ChatPanel` assistant bubbles
- `PromptRefinementCard`
- `AgentFlowStepRow` cards
- `FeatureNode`
- `HypothesisCard`
- `DiffReview` / `DiffFileView` headers (use solid)
- Any list row or scrollable item

**Replace with:**
```css
background: var(--color-bg-elevated);
border: 1px solid var(--glass-border-subtle);
```

**Remove hardcoded hex** (`#161b22`, `#30363d`, GitHub greens) — use tokens.

## Phase 3: Enhance with Glass APIs

### 3a. Glass containers

Group toolbar + adjacent controls in one blurred parent. See [components/glass-container.md](../components/glass-container.md).

### 3b. Background extension

Welcome screen / hero: let gradient canvas extend under top chrome; nav floats above.

### 3c. Glass buttons

- Primary CTA → solid accent (glassProminent)
- Secondary → glass outline in nav context only

### 3d. Morphing overlays

Command palette, drawer: use `.glass-overlay-enter`; mount/unmount with animation, not opacity hide.

### 3e. Clear glass on media-rich areas

Welcome preview decorative blocks: optional `.glass-nav-clear` over gradient — not on functional content cards.

## Phase 4: Theme & Platform

- Sync [tokens.json](../tokens.json) → `tokens.css` for dark + light
- `regular` / `clear` / `identity` glass variants per theme
- Monaco: `vs-dark` / `vs` from `resolvedTheme`
- Test light mode contrast on glass borders

## Phase 5: Accessibility & Testing

| Setting | Expected |
|---------|----------|
| `prefers-reduced-transparency` | All glass → identity (solid) |
| `prefers-reduced-motion` | No enter animations |
| Dark / Light | No broken borders or invisible text |
| Keyboard | `--glass-focus-ring` on focus-visible |

**Manual checklist:**
1. Open sample workspace — chrome is glass, editor is opaque
2. Run demo A/B — no layout regression
3. Toggle theme 3 states (system/dark/light)
4. Command palette opens with overlay glass only

## Backward Compatibility

```css
@supports not (backdrop-filter: blur(1px)) {
  .glass-nav { background: var(--color-bg-elevated); }
}
```

Keep content styles independent of glass so fallbacks degrade gracefully.

## Phase 6: True Liquid Glass (Tier B — Outpace Engine)

Apply when user needs **visible edge refraction**, not just frost.  
Spec: [true-glass-engine.md](true-glass-engine.md) · Recipe: [components/glass-lens.md](../components/glass-lens.md)  
Reference: [Outpace Studios](https://glass.outpacestudios.com/)

### Prerequisites

- `--ambient-mesh` or rich backdrop behind lenses (Phase 3b)
- Tier A frost on bulk nav already in place
- Content surfaces remain solid (Phase 2)

### 6a. Add Glass components

```
projectos/workbench/src/components/Glass/
  GlassScene.tsx
  GlassLens.tsx
  displacementMap.ts
```

### 6b. Migrate hero surfaces (priority order)

1. `CommandPalette` — highest visual impact, over mesh + workspace
2. `AppShell.demoDropdown` — morphing single lens between items
3. `WelcomeScreen.card` — hero over `--ambient-mesh`

Leave side panels / top bar on **Tier A frost** (performance).

### 6c. Verify cross-browser

| Browser | Expect |
|---------|--------|
| Chrome | Refraction + optional chromatic fringe |
| Safari | Refraction + rim highlight (single pass) |
| Firefox | Refraction via copy+filter (not backdrop-filter SVG) |

### 6d. Verify accessibility

| Setting | Tier B behavior |
|---------|-----------------|
| `prefers-reduced-transparency` | Opaque `--color-bg-elevated` panel, no displacement |
| `prefers-reduced-motion` | Lens snaps to position, no spring |

### Anti-patterns during Phase 6

- Do not add `backdrop-filter: url(#filter)` — use `GlassLens` copy pattern
- Do not use `data:` URI for displacement map — use `blob:`
- Do not displace UI text — only the backdrop copy is filtered
