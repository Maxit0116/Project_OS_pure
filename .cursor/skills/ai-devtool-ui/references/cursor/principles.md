# Cursor

Do not copy Cursor. Use this file when changing workspace layout, navigation, the command palette, the editor, or panel chrome.

## Borrow

* IDE-native spatial structure
* high information density
* developer-oriented interaction
* dark workspace aesthetics
* contextual panels
* keyboard-first interaction
* powerful but restrained visual hierarchy

## Workspace

Think in terms of a professional development workspace rather than a website.

The interface should feel spatial, composable, resizable, contextual, and persistent. Do not force a three-column shell when the product context does not require it.

Preferred structure when the product does require it:

```text
┌───────────────────────────────────────────────────────────┐
│ Global / Project Context                                  │
├──────────┬──────────────────────────────┬─────────────────┤
│          │                              │                 │
│ Navigation│     Primary Workspace       │ Context / Agent │
│          │                              │                 │
├──────────┴──────────────────────────────┴─────────────────┤
│ Status / Execution / Terminal / Notifications             │
└───────────────────────────────────────────────────────────┘
```

Panels are parts of one workspace:

```text
Main workspace
    +
Agent
    +
Inspector
    +
Terminal
    +
Function Map
```

Transitions are subtle, fast, and predictable. The user should not feel that five separate applications are open.

## Density

This is a developer tool. Do not optimize everything for consumer-app simplicity.

An experienced developer should be able to see, without opening five additional screens:

* where they are
* what the agent is doing
* what changed
* what needs attention
* what is running
* what failed
* what the next action is

Density must never become visual noise. Whitespace separates conceptual groups. It does not make the interface artificially sparse.

## Navigation

Navigation should feel like a developer environment.

Use:

* clear active state
* compact icons
* keyboard shortcuts
* tooltips
* contextual expansion
* persistent project identity

Avoid oversized navigation, colorful icon collections, excessive nested menus, and navigation that behaves like a marketing website.

The user should always understand: where am I?

## Command palette

Treat the command palette as a first-class interaction surface.

It should support commands, navigation, files, agents, actions, projects, and settings.

The visual language is fast, quiet, keyboard-first, search-first, and high information density. Do not turn it into a decorative modal.

## Editor

The code editor visually integrates with the rest of the application.

Maintain predictable indentation, clear line hierarchy, readable syntax colors, minimal chrome, a strong selection state, and contextual AI actions.

Do not surround the editor with unnecessary cards. The editor should feel like a native part of the workspace.

## Hierarchy

Hierarchy comes from position, scale, typography, spacing, contrast, and interaction state. Do not build it from gradients, heavy shadows, bright colors, or decorative containers.

Prefer a subtle border, a small radius, and contrast. Suggested radii: small controls 6–8px, standard controls 8–10px, major surfaces 10–14px. Do not make every element extremely rounded.
