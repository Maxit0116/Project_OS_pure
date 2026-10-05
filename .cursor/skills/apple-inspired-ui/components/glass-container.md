# Glass Container (GlassEffectContainer)

Apple: glass cannot sample other glass. Nearby navigation elements must share one container.

## Web Pattern

One parent holds the single `backdrop-filter`. Children are visually glass-like via transparency but do not add their own blur.

```css
/* Parent — only blur in this zone */
.sidePanel {
  background: var(--glass-bg-regular);
  backdrop-filter: blur(var(--glass-blur-sm)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-sm)) saturate(var(--glass-saturate));
}

/* Children — solid or transparent, NO backdrop-filter */
.panelHeader {
  background: transparent;
  border-bottom: 1px solid var(--glass-border-subtle);
}

.treeRow:hover {
  background: var(--color-accent-subtle); /* not blur */
}
```

## Workbench Zones

```
AppShell
├── topBar          ← 1 glass layer (regular)
├── ThreeZoneLayout
│   ├── LeftPanel   ← 1 glass layer (regular) — counts as column layer 2
│   ├── CenterPanel ← NO glass (content canvas)
│   └── RightPanel  ← glass only when not overlapping left+top
└── CommandPalette  ← overlay glass (separate stacking context)
```

**Drawer open:** downgrade `RightPanel` to identity solid to avoid 3 layers.

## Grouping Controls

Demo dropdown items inside `demoDropdown` (already one overlay glass) — items use solid hover, not per-item blur.

Toolbar: `FunctionMap.toolbar` is one glass strip; search input uses `--color-bg-muted` solid inside.

## Anti-Pattern

```css
/* BAD — each button blurs separately */
.toolbar { }
.toolBtn { backdrop-filter: blur(12px); }
.toolBtn { backdrop-filter: blur(12px); }
```
