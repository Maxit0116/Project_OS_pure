# Pitfalls and Solutions (Web)

Sources: [liquid-glass-skill pitfalls](https://github.com/haider-nawaz/liquid-glass-skill), [Outpace Studios true glass](https://glass.outpacestudios.com/).

## Blur isn't glass (calling frost "liquid glass")

**Problem:** User expects Apple-style edge refraction; sees only flat blur.

**Cause:** Tier A `backdrop-filter` is frosted panel, not true lens. No rim bend.

**Solution:** Hero overlays (palette, dropdown, Welcome card) → Tier B `GlassLens`. Bulk nav stays Tier A but label it `frost-chrome` in code. See [true-glass-engine.md](true-glass-engine.md).

## backdrop-filter + SVG displacement (Safari/Firefox trap)

**Problem:** Glass looks correct in Chrome, flat frost in Safari/Firefox.

**Cause:** Only Chromium runs SVG filters inside `backdrop-filter`. Safari/Firefox silently drop the SVG part.

**Solution:** Tier B — render counter-positioned backdrop **copy**, apply `filter: url(#id)` (not `backdrop-filter`). See [components/glass-lens.md](../components/glass-lens.md).

## data: URI in feImage (WebKit silent fail)

**Problem:** Displacement map never loads; glass is flat frost.

**Cause:** WebKit refuses `data:` URIs inside `feImage`.

**Solution:** Generate map → `canvas.toBlob()` → `URL.createObjectURL(blob)`.

## Safari filter id cache

**Problem:** Animated/morphing lens freezes on first frame.

**Cause:** Safari caches SVG filter output by `id`.

**Solution:** New unique filter `id` on every rebuild during animation.

## Safari filter source size cap

**Problem:** Filter produces nothing; blank lens.

**Cause:** Full-viewport source graphic exceeds Safari limit.

**Solution:** Clip refraction copy to lens bounding box before rasterize.

## Glass on content (lists, cards, chat)

**Problem:** Looks like generic glassmorphism, not Apple Liquid Glass; causes scroll jank.

**Cause:** Apple restricts glass to navigation layer. Content should be solid.

**Solution:** Remove `backdrop-filter` from content. Use `--color-bg-elevated`.

## Inconsistent glass near siblings

**Problem:** Adjacent toolbar buttons/panels look mismatched.

**Cause:** Each element samples backdrop independently (like glass outside `GlassEffectContainer`).

**Solution:** One `.glass-container` parent per chrome zone. Children use transparent/solid fills.

## Too many backdrop layers

**Problem:** GPU cost, muddy blur, 3+ offscreen textures.

**Solution:** Max **2** blurred layers per column (e.g. topBar + one side panel). Drawer open → reduce side panel to identity solid.

## Custom opaque nav backgrounds

**Problem:** Flat `#161b22` blocks glass refraction.

**Solution:** Remove solid fills on toolbars; use `--glass-bg-regular` or remove conflicting `background` overrides.

## Text illegibility on extended heroes

**Problem:** Text over `backgroundExtensionEffect`-style bleed is hard to read.

**Solution:** Gradient scrim under text:
```css
.heroText {
  background: linear-gradient(transparent, var(--scrim));
}
```

## Hit-testing too small

**Problem:** Clicks only register on label, not full glass button.

**Solution:** Adequate padding; min 44×32px touch targets on icon buttons.

## Morphing with opacity

**Problem:** Overlay doesn't morph smoothly.

**Cause:** `opacity: 0` doesn't trigger glass morph (Apple: use conditional render).

**Solution:** `{open && <Palette />}` with enter animation class.

## Sheet / modal double background

**Problem:** Custom scrim + glass panel both opaque — looks heavy.

**Solution:** Scrim: `var(--scrim)` + light blur. Panel: overlay glass only. Don't stack two full opaque layers.

## Reduced transparency ignored

**Problem:** Glass unreadable with a11y setting on.

**Solution:** Global block in `global.css`:
```css
@media (prefers-reduced-transparency: reduce) {
  .glass-nav, .glass-raised, .glass-elevated, .glass-overlay {
    backdrop-filter: none !important;
    background: var(--color-bg-elevated) !important;
  }
}
```

## Primary button with blur

**Problem:** Prominent CTAs look washed out.

**Solution:** Primary = solid `--color-accent` (glassProminent). No `backdrop-filter` on primary.
