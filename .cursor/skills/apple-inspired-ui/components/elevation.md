# Elevation: Navigation vs Content

Apple Liquid Glass splits the UI into two layers.

## Navigation Layer (Glass)

Floats above content. Refracts what's behind.

| Level | Apple style | Web token | Use |
|-------|-------------|-----------|-----|
| Overlay | sheet / popover | `--glass-bg-overlay` + `blur(lg)` | CommandPalette, menus, toasts |
| Elevated | toolbar | `--glass-bg-regular` + `blur(md)` | AppShell topBar |
| Raised | sidebar chrome | `--glass-bg-regular` + `blur(sm)` | Left/Right panel shell |
| Clear | over hero media | `--glass-bg-clear` + `blur(lg)` | Welcome decorative preview |

## Content Layer (Solid)

No `backdrop-filter`.

| Level | Token | Use |
|-------|-------|-----|
| Canvas | `--color-bg-canvas` | Editor, graph, diff body |
| Elevated | `--color-bg-elevated` | Cards, bubbles, nodes |
| Muted | `--color-bg-muted` | Inset panels, inputs, chips |

## Stack Diagram

```
┌─ Overlay glass ─ CommandPalette ─────────────┐
├─ Nav glass ─── AppShell.topBar ────────────┤
├─ Nav glass ─── SidePanel shell ────────────┤
│  ┌─ Content ── AgentFlow cards (solid) ───┐│
│  ┌─ Content ── Monaco (opaque) ───────────┐│
└────────────────────────────────────────────┘
```

## Nesting Rule

Max 2 navigation glass layers visible per column. Content never adds a third blur.
