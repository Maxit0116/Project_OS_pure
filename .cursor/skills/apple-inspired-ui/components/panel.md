# Navigation Panel Chrome

Side panels are **navigation shell** — glass on the outer shell only. Inner scroll content is solid.

## Side panel shell (glass)

```css
.sidePanel {
  background: var(--glass-bg-regular);
  backdrop-filter: blur(var(--glass-blur-sm)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm)) saturate(var(--glass-saturate));
  border-right: 1px solid var(--glass-border-subtle);
}
```

## Panel header (no extra blur)

```css
.header {
  background: transparent;
  border-bottom: 1px solid var(--glass-border-subtle);
}
```

## Content cards inside panel

Use [content-surfaces.md](content-surfaces.md) — **no** glass on PromptRefinementCard, harness cards, etc.

## Center panel

Passthrough — children (FunctionMap canvas, editor) provide content. No glass on `CenterPanel` wrapper.

## Resize handles

Solid 1px border, accent glow on hover — not glass.

## backgroundExtensionEffect

Optional: center canvas gradient extends 8–12px under adjacent glass sidebars for depth. Keep editor/graph opaque.
