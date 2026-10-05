# Glass Buttons

Maps to `.buttonStyle(.glass)` and `.buttonStyle(.glassProminent)`.

## glassProminent (primary)

Solid accent — **no blur**. Primary actions only.

```css
.primary {
  color: #fff;
  background: var(--color-accent);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.2) inset, 0 2px 8px rgba(10, 132, 255, 0.35);
  border-radius: var(--radius-glass-sm);
}
.primary:hover:not(:disabled) {
  background: var(--color-accent-strong);
  transform: translateY(-1px);
}
.primary:active:not(:disabled) {
  transform: scale(0.98);
}
```

## glass (secondary)

Glass outline — only in **navigation context** (toolbar, top bar). Inside a glass-container.

```css
.secondary {
  color: var(--color-text-primary);
  background: var(--glass-bg-regular);
  backdrop-filter: blur(var(--glass-blur-sm)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);
}
```

If parent toolbar is already glass, secondary buttons can be **transparent** with border only (no second blur).

## ghost

Tertiary nav actions — transparent, hover muted solid.

## danger

Semantic error color — never glassProminent red.

## Interactive (.interactive() on iOS)

Web equivalent: `:active { transform: scale(0.98) }`, spring easing, optional subtle brightness on hover.

## Hit target

Full padded area clickable — min padding `8px 16px` for md size.

## Focus

```css
.btn:focus-visible {
  outline: none;
  box-shadow: var(--glass-focus-ring);
}
```
