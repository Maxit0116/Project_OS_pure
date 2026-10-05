# Glass Overlays (Navigation Layer)

Sheets, command palette, menus, toasts — all **navigation-layer** glass (overlay style).

## Command Palette

```css
.overlay {
  background: var(--scrim-heavy);
  backdrop-filter: blur(var(--glass-blur-sm));
}
.palette {
  background: var(--glass-bg-overlay);
  backdrop-filter: blur(var(--glass-blur-lg)) saturate(var(--glass-saturate));
  border-radius: var(--radius-glass-lg);
  box-shadow: var(--glass-shadow-overlay);
}
```

Mount with `.glass-overlay-enter` — conditional render, not opacity hide.

## Dropdown Menu

Single overlay glass on container; items use solid hover:

```css
.menuItem:hover {
  background: var(--color-accent-subtle);
}
```

Do not add per-item `backdrop-filter`.

## Toast

Overlay glass + semantic left border. Toasts are transient nav feedback.

## Z-Index

| Layer | z-index |
|-------|---------|
| Dropdown | 100 |
| Command palette | 200 |
| Toast | 300 |
| Drawer scrim | 40 (layout) |

## Do NOT

- Add `.presentationBackground()` equivalent — custom opaque sheet bg conflicts with glass (Apple pitfall)
- Stack two full opaque scrims + panel
