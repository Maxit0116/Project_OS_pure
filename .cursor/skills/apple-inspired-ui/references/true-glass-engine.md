# True Liquid Glass Engine (Web)

Source: [Outpace Studios — Liquid glass for the web](https://glass.outpacestudios.com/)  
Architecture credit: [Aave — Building Glass for the Web](https://aave.com) (backdrop-copy pattern)  
SwiftUI semantics: [haider-nawaz/liquid-glass-skill](https://github.com/haider-nawaz/liquid-glass-skill)

## The Core Insight

> **Blur isn't glass.**

Most web "liquid glass" — including `backdrop-filter: blur()` — is a **frosted panel**: blur + bright border. Real glass **refracts**: light bends through a curved surface, hardest at the rim where the dome curves down. That edge warp is the tell.

Apple Liquid Glass on native platforms computes this bend from optics. On the web, the honest route is **SVG `feDisplacementMap`** driven by a physics-based displacement map — not a radial gradient painted to look close.

## Two Tiers in Project OS

| Tier | Name | Technique | When to use |
|------|------|-----------|-------------|
| **A** | Frost chrome | `backdrop-filter` + tokens | Bulk nav: side panels, tab bars, status bars. Fast, cheap. **Not true glass** — document as frost. |
| **B** | True lens | `GlassScene` + `GlassLens` + `feDisplacementMap` | Hero surfaces: command palette, dropdowns, Welcome card, morphing nav menus. **Required** when user asks for "real" / "Apple" liquid glass. |

**Rule:** Never call Tier A "liquid glass" in copy or comments. Call it `frost-chrome`. Reserve "liquid glass" / `glass-lens` for Tier B.

## Physics: Computed Bend (Not Painted)

Model the lens as a **convex squircle dome** — flat centre, curving rim (same superellipse Apple uses for corners).

Per pixel:
1. `x` = depth in from rim (0 = edge, 1 = flat centre)
2. Compute dome **slope** from squircle geometry
3. Refract a straight-down view ray with **Snell's law** at index of refraction **1.5** (glass)
4. Sideways throw of bent ray → displacement along SDF normal of rounded rect
5. Blue channel = specular height → rim highlight

```js
// Squircle dome slope
const slope  = (1 - x) ** 3 / (1 - (1 - x) ** 4) ** 0.75
const thetaI = Math.atan(slope)
const thetaT = Math.asin(Math.sin(thetaI) / 1.5) // Snell's law, n=1.5
const bend   = Math.sin(thetaI - thetaT)          // 0 at centre, max at rim

// Displacement map R/G channels (128 = no offset)
map.r = 128 + nx * bend * gain
map.g = 128 + ny * bend * gain
// B channel: specular rim light
```

Centre stays clear (slope → 0); all bending concentrates at the rim — matches thick real glass.

## Architecture: Refract a Copy, Not the Backdrop

### The trap

`backdrop-filter` + SVG displacement **only works in Chromium**. Safari and Firefox accept `backdrop-filter` but **silently drop the SVG filter** → flat frost only. This is why most web glass looks good in Chrome and wrong elsewhere.

### The solution

`feDisplacementMap` runs through ordinary CSS **`filter`** everywhere. Only `backdrop-filter` + SVG is Chromium-only.

```
┌─────────────────────────────────────┐
│  GlassScene                         │
│  ┌─────────────────────────────────┐│
│  │ Backdrop (live, interactive)    ││
│  └─────────────────────────────────┘│
│  ┌─ GlassLens ─────────────────────┐│
│  │ Counter-positioned backdrop copy││
│  │ + feDisplacementMap (bent)      ││
│  │ + UI content (labels, items)    ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

- **Backdrop** renders once, stays interactive underneath
- **GlassLens** drops a 1:1 counter-positioned copy, bends the copy
- Copy tracks backdrop frame-by-frame → live refraction on scroll/animation

```tsx
<GlassScene content={<Backdrop />}>
  <nav>{triggers}</nav>
  {open && (
    <GlassLens x={x} y={y} width={W} height={H}>
      {menuItems}
    </GlassLens>
  )}
</GlassScene>
```

### Why not alternatives?

| Approach | Problem |
|----------|---------|
| WebGL screenshot | Frozen texture; page not interactive |
| Firefox `element()` | Firefox only |
| Houdini paint worklets | Cannot read existing pixels |
| Pure CSS blur + border | Photo of glass, not glass |
| Live copy + `filter` | ✅ Honest + cross-browser |

## Shipping Details (Non-Obvious)

### Displacement map URL

Use **`blob:` URL** for the map inside `feImage`.  
**Never `data:` URI** — WebKit silently refuses `data:` in `feImage`; glass collapses to flat frost.

### Color space

SVG filters default to **linearRGB** — displaces differently than expected. Force **sRGB** on the filter chain so map values mean what they say.

### Safari-specific

1. **Filter id caching** — Safari caches filter output by `id`. Animated/morphing lens needs a **fresh filter `id` on every rebuild** or it freezes on frame 1.
2. **Source size cap** — Clip refraction copy to **lens box** before rasterize. Full-viewport source → filter silently produces nothing.

### Browser performance tiers

| Browser | Chain |
|---------|-------|
| Chromium | GPU filters; 3 displacement passes (chromatic fringe at rim) + specular — essentially free |
| Safari | Software filters; **one pass** (dome refraction + rim highlight, no chromatic fringe) to hold frame budget on animated backdrops |

Same material, scaled per browser. Never fall back to flat blur silently — degrade fringe, not refraction.

## One Lens, Alive (Morphing)

Apple nav uses **one moving pane of glass**, not one lens per menu item.

- Single `GlassLens` travels between triggers, resizes to target dropdown shape
- **Spring-driven, interruptible** motion
- Menu rows stagger in after lens arrives
- Conditional mount (`{open && <Lens />}`), not `opacity: 0` — opacity doesn't morph glass

Workbench targets: `AppShell.demoDropdown`, `CommandPalette`, future nav morph.

## Accessibility

Glass is enhancement; interface works without it.

| Setting | Behavior |
|---------|----------|
| `prefers-reduced-motion` | Lens cuts to position — no spring |
| `prefers-reduced-transparency` | Drop refraction entirely → opaque `--color-bg-elevated` panel at full contrast |

Tier A frost chrome uses the same `prefers-reduced-transparency` fallback in `global.css`.

## Project OS Implementation Status

| Surface | Current | Target |
|---------|---------|--------|
| Command palette | Tier A frost | **Tier B** `GlassLens` |
| Demo dropdown | Tier A frost | **Tier B** |
| Welcome hero card | Tier A frost | **Tier B** |
| Top bar / side panels | Tier A frost | Stay Tier A (perf) |
| Content cards | Solid | Stay solid |

Implementation recipe: [components/glass-lens.md](../components/glass-lens.md)

## References

- [Outpace Studios — Liquid glass for the web](https://glass.outpacestudios.com/)
- Aave — Building Glass for the Web (backdrop-copy architecture)
- Apple — [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views)
