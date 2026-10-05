# Motion & Morphing

Adapted from Apple `glassEffectID` morphing and `.interactive()` behavior.

## Principles

- Enter/exit: conditional mount + animation (not `opacity: 0` alone)
- Spring easing on nav overlays
- Scale 0.98 on press for interactive controls
- Respect `prefers-reduced-motion`

## glass-overlay-enter

Menus, command palette, toasts:

```css
.glass-overlay-enter {
  animation: glassOverlayEnter var(--duration-normal) var(--ease-spring);
}
```

## glass-enter

Nav chrome sub-elements (optional, subtle):

```css
.glass-enter {
  animation: glassEnter var(--duration-normal) var(--ease-spring);
}
```

## Morphing between related glass elements

When swapping toolbar groups (e.g. demo menu open):

1. Shared parent `glass-container` stays mounted
2. Children cross-fade or scale — parent blur unchanged
3. Use `withAnimation` equivalent: React transition group or CSS on mount

## Scroll-linked chrome (tabBarMinimizeBehavior)

Future: collapse terminal bar or compact top bar on scroll — not required for MVP. Document as extension point.

## Symbol / icon transitions

Prefer lucide with CSS `transition: transform` on state change — not rotation on glass elements (causes morph artifacts on Apple platforms; avoid rotate on blurred nodes in web too).
