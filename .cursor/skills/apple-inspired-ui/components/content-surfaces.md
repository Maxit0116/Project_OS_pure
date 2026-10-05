# Content Surfaces (No Glass)

Content layer uses **solid** materials. Apple uses `Material` / `windowBackground` for editing areas — not Liquid Glass.

## Card (default content)

```css
.card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--glass-border-subtle);
  border-radius: var(--radius-glass-md);
  box-shadow: none; /* no heavy Material shadows */
}
```

## Inset detail panel

```css
.inset {
  background: var(--color-bg-muted);
  border: 1px solid var(--glass-border-subtle);
  border-radius: var(--radius-md);
}
```

## Chat bubbles

```css
/* User — solid accent (glassProminent semantics) */
.userBubble {
  background: var(--color-accent);
  color: #fff;
  border-radius: var(--radius-glass-sm);
}

/* Assistant — solid elevated, NO blur */
.assistantBubble {
  background: var(--color-bg-elevated);
  border: 1px solid var(--glass-border-subtle);
}
```

## Input fields (in content area)

```css
.input {
  background: var(--color-bg-muted);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-glass-sm);
}
/* No backdrop-filter — inputs are content, not nav chrome */
```

## Code / diff

```css
.codePane {
  background: var(--color-code-bg);
  /* always opaque for syntax highlighting */
}
```

## List row hover

```css
.row:hover {
  background: var(--color-accent-subtle);
}
.rowSelected {
  background: var(--color-accent-subtle);
}
```

## Graph nodes (Function Map)

```css
.node {
  background: var(--color-bg-elevated);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow-raised); /* specular rim OK, no blur */
}
.node.selected {
  border-color: var(--color-accent);
  box-shadow: var(--glass-focus-ring);
}
```

## Semantic status borders

Use border-color for state — not glass tint on entire card:

```css
.running { border-color: var(--color-warning); }
.error { border-color: var(--color-error); }
.complete { border-color: var(--color-success); }
```
