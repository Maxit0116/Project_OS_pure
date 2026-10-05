# GlassLens Component Recipe (Tier B — True Glass)

Use when implementing **real refraction** per [true-glass-engine.md](../references/true-glass-engine.md).  
Do **not** use for bulk side panels — use Tier A frost tokens instead.

## When to Apply

- Command palette overlay
- Dropdown / popover menus (`AppShell.demoDropdown`)
- Welcome screen hero card (over `--ambient-mesh`)
- Any surface where user expects **visible edge bend** on scroll

## File Layout (Future)

```
projectos/workbench/src/components/Glass/
  GlassScene.tsx       # Shares backdrop context
  GlassLens.tsx        # Counter-positioned copy + SVG filter
  displacementMap.ts   # Snell's law squircle dome map generator
  glassFilter.svg.tsx  # feDisplacementMap + specular chain
  Glass.module.css     # Lens chrome, reduced-transparency fallback
```

## GlassScene

Responsibilities:
1. Render `content` (the live backdrop) once
2. Provide backdrop position/size via context for counter-positioning
3. On scroll/resize/animation frame, update copy offset

```tsx
interface GlassSceneProps {
  content: React.ReactNode
  children: React.ReactNode
}

// Context: { backdropRef, scrollOffset, bounds }
export function GlassScene({ content, children }: GlassSceneProps) {
  return (
    <div className={styles.scene}>
      <div ref={backdropRef} className={styles.backdrop}>{content}</div>
      <GlassSceneProvider value={...}>
        {children}
      </GlassSceneProvider>
    </div>
  )
}
```

## GlassLens

Responsibilities:
1. Clip refraction source to lens box (Safari size cap)
2. Render counter-positioned backdrop **copy** aligned 1:1 with live backdrop
3. Apply SVG `filter` (not `backdrop-filter`) with `feDisplacementMap`
4. Render UI children above bent layer (labels stay sharp)
5. Fresh filter `id` per rebuild when animating (Safari cache)

```tsx
interface GlassLensProps {
  x: number
  y: number
  width: number
  height: number
  filterId: string // regenerate when morphing
  children: React.ReactNode
}

export function GlassLens({ x, y, width, height, filterId, children }: GlassLensProps) {
  const mapUrl = useDisplacementMapBlob(width, height) // blob: URL, never data:

  return (
    <div
      className={styles.lens}
      style={{ left: x, top: y, width, height }}
    >
      <div
        className={styles.refractCopy}
        style={{ filter: `url(#${filterId})` }}
        aria-hidden
      >
        {/* counter-positioned snapshot of backdrop */}
      </div>
      <div className={styles.lensContent}>{children}</div>
      <svg aria-hidden>
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feImage href={mapUrl} result="map" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale={displacementScale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
          {/* Chromium: optional 2nd/3rd pass for chromatic fringe */}
        </filter>
      </svg>
    </div>
  )
}
```

## Displacement Map Generator

```ts
// displacementMap.ts — run once per lens size change
export function buildDisplacementMap(w: number, h: number): Blob {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  // For each pixel: SDF distance from rounded-rect edge → x → Snell bend → R/G/B
  // Return canvas.toBlob() → URL.createObjectURL(blob)
}
```

Constants:
- Index of refraction: **1.5**
- Dome profile: squircle superellipse (match `--radius-glass-*` tokens)
- `gain`: tune displacement scale; start ~8–16px at rim for 400px-wide lens

## Morphing (One Lens)

```tsx
const [lensBounds, setLensBounds] = useState({ x, y, width, height })
const filterId = useMemo(() => `glass-${Date.now()}`, [lensBounds]) // Safari: new id per frame rebuild

// Spring animate bounds when active trigger changes
useSpring(bounds, { stiffness: 380, damping: 32 })
```

Mount lens with `{open && <GlassLens ... />}`. Unmount on close — do not hide with opacity.

## CSS Fallback

```css
@media (prefers-reduced-transparency: reduce) {
  .lens .refractCopy { display: none; }
  .lens {
    background: var(--color-bg-elevated);
    border: 1px solid var(--glass-border);
    backdrop-filter: none;
  }
}
```

## Integration Checklist

- [ ] `blob:` URL for displacement map (not `data:`)
- [ ] Filter `colorInterpolationFilters="sRGB"`
- [ ] Copy clipped to lens box, not full viewport
- [ ] `filter` on copy, not `backdrop-filter`
- [ ] Fresh filter `id` when animating (Safari)
- [ ] Chromium: optional chromatic fringe passes; Safari: single pass
- [ ] `prefers-reduced-transparency` → opaque panel
- [ ] `prefers-reduced-motion` → instant position, no spring
- [ ] UI text/controls on top of refract layer (never displaced)
- [ ] `--ambient-mesh` or rich content behind lens so bend is visible

## Anti-Patterns

```tsx
// ❌ backdrop-filter with SVG url — Safari/Firefox drop displacement
.menu { backdrop-filter: blur(20px) url(#glass-filter); }

// ❌ data: URI in feImage — WebKit silent fail
<feImage href="data:image/png;base64,..." />

// ❌ Full viewport filter source — Safari produces nothing
<feImage href={fullPageScreenshot} />

// ❌ opacity: 0 to hide lens — breaks morph semantics
<GlassLens style={{ opacity: open ? 1 : 0 }} />
```
