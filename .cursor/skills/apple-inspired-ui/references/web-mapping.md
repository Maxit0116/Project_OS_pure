# SwiftUI Liquid Glass → Web Mapping

Sources: [liquid-glass-skill](https://github.com/haider-nawaz/liquid-glass-skill), [Outpace Studios true glass](https://glass.outpacestudios.com/).  
Web targets `projectos/workbench`.

## Tier Overview

| Tier | Web | Real refraction? |
|------|-----|------------------|
| **A — Frost** | `backdrop-filter` + tokens | No — blur only |
| **B — Lens** | `GlassScene` + `GlassLens` + `feDisplacementMap` | Yes — Snell's law bend |

## Modifiers

### glassEffect(.regular)

**Tier A** — bulk nav (side panels, top bar):

```css
.glass-nav {
  background: var(--glass-bg-regular);
  backdrop-filter: blur(var(--glass-blur-md)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-md)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow-regular);
}
```

**Tier B** — hero overlay where bend must show:

```tsx
<GlassScene content={<Backdrop />}>
  <GlassLens x={x} y={y} width={W} height={H}>{children}</GlassLens>
</GlassScene>
```

See [true-glass-engine.md](true-glass-engine.md), [components/glass-lens.md](../components/glass-lens.md).

### glassEffect(.clear)

High transparency for bold/bright content behind (hero images, welcome gradient).

```css
.glass-nav-clear {
  background: var(--glass-bg-clear);
  backdrop-filter: blur(var(--glass-blur-lg)) saturate(var(--glass-saturate));
  /* ... */
}
```

### glassEffect(.identity)

No glass — accessibility or legacy browsers.

```css
.glass-nav-identity {
  background: var(--color-bg-elevated);
  backdrop-filter: none;
}
```

### GlassEffectContainer

One sampling region for all child glass chrome.

```css
.glass-container {
  position: relative;
  isolation: isolate;
}
.glass-container::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--glass-bg-regular);
  backdrop-filter: blur(var(--glass-blur-md)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-md)) saturate(var(--glass-saturate));
  z-index: 0;
  pointer-events: none;
}
.glass-container > * {
  position: relative;
  z-index: 1;
  /* children: solid fills, no individual backdrop-filter */
}
```

Prefer structural grouping: e.g. entire `AppShell.topBar` is one frost layer; items inside are solid transparent.

**Tier B equivalent:** `GlassScene` shares one backdrop; each `GlassLens` bends a clipped copy.

### backgroundExtensionEffect

Content extends visually under navigation chrome.

```css
.heroCanvas {
  /* content layer — full bleed */
  background: var(--color-bg-canvas);
  margin-top: calc(-1 * var(--topbar-height));
  padding-top: var(--topbar-height);
}
.topBar {
  position: relative;
  z-index: 10;
  /* glass nav floats above extended content */
}
```

Workbench: `--ambient-mesh` on `body` / `AppShell`; centre canvas opaque; frost chrome floats above colourful mesh.

### feDisplacementMap / true refraction

| Concept | Web |
|---------|-----|
| Squircle dome lens | Displacement map from Snell's law (n=1.5) |
| Rim bend | Displacement max at SDF edge, zero at centre |
| Specular rim | Blue channel in displacement map |
| Live refraction | Counter-positioned backdrop copy + CSS `filter` |
| Chromatic fringe | Chromium: 3 displacement passes; Safari: 1 pass |

**Do not** map to `backdrop-filter` + SVG — Chromium-only trap.

### buttonStyle(.glass) / .glassProminent

| Style | Web | Blur |
|-------|-----|------|
| `.glass` | `Button` variant `secondary` | yes (in nav context) |
| `.glassProminent` | `Button` variant `primary` | no — solid `--color-accent` |

### glassEffectID / morphing

Use shared `data-glass-id` + CSS transitions on enter/exit. Conditional mount (not `opacity: 0`) triggers morph.

```tsx
{open && <div className="glass-overlay-enter" data-glass-id="palette" />}
```

### Toolbar / TabBar / Sheet

| SwiftUI | Workbench component |
|---------|---------------------|
| Toolbar | `AppShell.topBar`, `FunctionMap.toolbar` |
| TabBar | `TabBar`, `RightPanel` tabs |
| Sheet | `CommandPalette`, `ThreeZoneLayout` drawer |
| Searchable | `CommandPalette.input` |

## What NOT to Map

Do not add `backdrop-filter` to simulate glass on:
- `LazyVStack` / list rows
- Chat message bodies
- Agent step timeline items
- React Flow nodes (use solid cards)
- Monaco / diff code areas

Use `--color-bg-elevated` instead.
