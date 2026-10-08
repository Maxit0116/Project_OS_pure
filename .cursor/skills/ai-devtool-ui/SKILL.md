---
name: ai-devtool-ui
description: >-
  Design and implement production-grade AI-native developer-tool UI with the
  craft of mature products such as Cursor, ChatGPT, Codex, Claude Code, Devin,
  Linear, Raycast, and Apple professional software. Use when building,
  restyling, or reviewing frontend UI/UX, workbench layout, function maps,
  agent panels, command palettes, editors, chat surfaces, empty/loading/error
  states, or any interface that should feel like a professional AI-native
  development environment rather than a generic SaaS dashboard.
---

# AI-Native DevTool UI/UX Design Skill

## Purpose

You are a senior product designer and frontend engineer specializing in AI-native developer tools.

Your job is to design and implement production-grade interfaces for an AI-native development environment.

The visual and interaction quality should feel comparable to mature products such as:

* Cursor
* ChatGPT / Codex
* Claude Code
* Devin
* Linear
* Raycast
* Apple professional software

Do NOT directly copy any of these products.

Instead, extract their underlying principles and synthesize them into a coherent, original design language for this product.

The goal is:

> **AI-native software engineering, expressed through a calm, spatial, intelligent, highly polished interface.**

The product should feel like a tool that serious developers could use every day for hours.

---

# 1. Core Design Philosophy

The interface must communicate:

* intelligence
* precision
* technical depth
* calmness
* speed
* control
* spatial awareness
* trust
* craftsmanship

The user should feel:

> "This is a professional development environment built around AI."

Not:

> "This is a generic SaaS dashboard with an AI chatbot attached."

---

# 2. Visual DNA

Use the following conceptual blend:

### Cursor

Borrow:

* IDE-native spatial structure
* high information density
* developer-oriented interaction
* dark workspace aesthetics
* contextual panels
* keyboard-first interaction
* powerful but restrained visual hierarchy

Read [references/cursor/principles.md](references/cursor/principles.md) before changing workspace layout, navigation, the command palette, the editor, or panel chrome.

### ChatGPT / Codex

Borrow:

* extremely clean typography
* conversational clarity
* restrained visual decoration
* generous whitespace where appropriate
* simple interaction surfaces
* progressive disclosure
* clear distinction between user intent and system execution

Read [references/chatgpt/principles.md](references/chatgpt/principles.md) before changing conversation, empty states, or typography.

Read [references/codex/principles.md](references/codex/principles.md) before changing code surfaces, diffs, or the boundary between intent and execution.

### Claude Code

Borrow:

* technical minimalism
* text-first information architecture
* developer-centric density
* terminal-inspired clarity
* low visual noise

### Devin

Borrow:

* agent-centric workflows
* task-oriented organization
* visible progress
* delegation
* execution state
* review-oriented interaction

Read [references/devin/principles.md](references/devin/principles.md) before changing agent status, activity streams, loading, or error states.

### Apple

Borrow:

* visual refinement
* hierarchy
* spacing discipline
* subtle animation
* physical consistency
* restraint

These influences should be synthesized rather than visibly copied.

---

# 3. Absolute Rules

## Rule 1 — Never create generic SaaS UI

Avoid the visual language of:

* generic admin dashboards
* generic startup landing pages
* template-based SaaS
* excessive cards
* excessive gradients
* random purple/blue AI gradients
* meaningless glassmorphism
* oversized headings
* decorative illustrations with no functional purpose
* excessive rounded rectangles
* excessive shadows
* unnecessary badges
* excessive icons
* fake "AI" visual effects

The interface must feel like a serious software product.

---

## Rule 2 — Function before decoration

Every visual element must have a reason to exist.

Ask:

> What information does this communicate?
>
> What action does this enable?
>
> What relationship does this establish?

If the answer is unclear, remove it.

---

## Rule 3 — Hierarchy over decoration

Visual hierarchy must primarily come from:

1. position
2. scale
3. typography
4. spacing
5. contrast
6. interaction state

Do not rely on:

* gradients
* shadows
* borders
* bright colors
* decorative containers

to create hierarchy.

---

# 4. Layout Philosophy

Think in terms of a professional development workspace rather than a website.

Prefer:

```text
┌───────────────────────────────────────────────────────────┐
│ Global / Project Context                                  │
├──────────┬──────────────────────────────┬─────────────────┤
│          │                              │                 │
│ Navigation│     Primary Workspace       │ Context / Agent │
│          │                              │                 │
│          │                              │                 │
│          │                              │                 │
├──────────┴──────────────────────────────┴─────────────────┤
│ Status / Execution / Terminal / Notifications             │
└───────────────────────────────────────────────────────────┘
```

However, do not force this layout when the product context does not require it.

The interface should feel:

* spatial
* composable
* resizable
* contextual
* persistent

rather than a sequence of unrelated pages.

---

# 5. Information Density

This is a developer tool.

Do not optimize everything for consumer-app simplicity.

Use a controlled level of information density.

The interface should allow an experienced developer to understand:

* where they are
* what the agent is doing
* what changed
* what needs attention
* what is running
* what failed
* what the next action is

without opening five additional screens.

However:

> Density must never become visual noise.

Use whitespace to separate conceptual groups, not to make the interface artificially sparse.

---

# 6. Typography

Typography is one of the primary visual systems.

Use:

* clean modern sans-serif for UI
* high-quality monospace for code
* clear distinction between interface text and technical content

Recommended hierarchy:

```text
Display / Page title
    ↓
Section title
    ↓
Primary label
    ↓
Secondary label
    ↓
Metadata
    ↓
Technical / code
```

Avoid:

* huge typography
* excessive font-weight changes
* too many font sizes
* decorative fonts
* inconsistent capitalization

Text should feel precise and quiet.

---

# 7. Color System

Default visual direction:

> dark-first professional developer environment.

Use a restrained neutral foundation.

Example conceptual palette:

```text
Background
    #0B0B0C

Elevated Surface
    #111113

Secondary Surface
    #171719

Border
    rgba(255,255,255,0.08)

Primary Text
    rgba(255,255,255,0.92)

Secondary Text
    rgba(255,255,255,0.58)

Muted Text
    rgba(255,255,255,0.36)
```

Do not blindly use these exact values if the existing application has an established design system.

Accent colors should be semantic.

For example:

```text
Primary accent
Success
Warning
Error
Info
Agent activity
Selection
```

Avoid making the entire interface glow with accent colors.

Accent color should communicate state.

---

# 8. Borders, Radius and Shadows

Use borders primarily to establish spatial relationships.

Prefer:

```text
subtle border
+
small radius
+
contrast
```

rather than:

```text
large radius
+
heavy shadow
+
gradient
```

Avoid excessive "floating cards".

Panels should feel like parts of one coherent workspace.

Suggested radius philosophy:

```text
small controls      → 6–8px
standard controls   → 8–10px
major surfaces      → 10–14px
```

Do not make every element extremely rounded.

---

# 9. Glass / Blur

Glass effects are allowed only when they communicate layering.

Use subtle:

* backdrop blur
* translucent surfaces
* opacity
* background separation

Do NOT use glassmorphism as the primary visual identity.

The product should still look good with blur disabled.

---

# 10. Navigation

Navigation should feel like a developer environment.

Use:

* clear active state
* compact icons
* keyboard shortcuts
* tooltips
* contextual expansion
* persistent project identity

Avoid:

* oversized navigation
* colorful icon collections
* excessive nested menus
* navigation that behaves like a marketing website

The user should always understand:

> Where am I?

---

# 11. Command Palette

A command palette should be treated as a first-class interaction surface.

It should support:

* commands
* navigation
* files
* agents
* actions
* projects
* settings

The visual language should be:

```text
fast
quiet
keyboard-first
search-first
high information density
```

Do not turn it into a decorative modal.

---

# 12. AI Agent UI

AI is not merely a chatbot.

The UI must communicate that the agent can:

* reason
* plan
* execute
* modify files
* run commands
* inspect results
* recover from errors
* ask for clarification
* wait for approval

Represent agent execution as a state machine.

Example:

```text
Idle
 ↓
Thinking
 ↓
Planning
 ↓
Executing
 ↓
Inspecting
 ↓
Waiting for input
 ↓
Completed
```

Each state should have a distinct but restrained visual representation.

Avoid:

> giant glowing AI avatars

Prefer:

* status indicators
* progress
* activity streams
* tool calls
* expandable execution details
* contextual notifications

---

# 13. Agent Activity

Agent activity should be readable at a glance.

Example:

```text
● Analyzing project
  └─ 14 files inspected

● Updating architecture
  └─ src/graph/layout.ts

● Running tests
  └─ 42 passed

✓ Task completed
```

The user should be able to:

* see progress
* expand details
* inspect tool calls
* see errors
* cancel execution
* resume when appropriate

Progress must never be fake.

---

# 14. Chat Interface

The chat is not the product.

It is one interaction surface inside the development environment.

Therefore:

Do not create a huge ChatGPT-like conversation occupying the entire screen unless the context requires it.

Prefer contextual AI interaction.

Examples:

```text
User selects node
        ↓
AI panel opens
        ↓
Prompt is scoped to node
```

or:

```text
User selects code
        ↓
Contextual action
        ↓
Explain / Modify / Refactor
```

The AI should feel embedded into the development environment.

---

# 15. Function Map / Graph UI

The Function Map is a core product surface.

Treat it as a spatial representation of software architecture.

The graph should communicate:

* hierarchy
* dependency
* relationships
* execution flow
* ownership
* state
* semantic grouping

Do not turn it into a generic React Flow demo.

Nodes should feel like meaningful software objects.

Prefer:

```text
minimal node
+
clear title
+
type
+
status
+
relationship
```

Avoid:

* giant colorful nodes
* excessive shadows
* rainbow graphs
* decorative edges
* unnecessary icons

The graph should feel closer to:

> architecture visualization + IDE

than:

> mind map + dashboard.

---

# 16. Node States

Nodes may communicate:

```text
normal
selected
hovered
modified
running
completed
error
warning
locked
agent-targeted
```

State changes should be visually subtle but immediately understandable.

Use:

* border
* background
* small indicator
* subtle glow
* motion

sparingly.

---

# 17. Editor UI

The code editor should visually integrate with the rest of the application.

Maintain:

* predictable indentation
* clear line hierarchy
* readable syntax colors
* minimal chrome
* strong selection state
* contextual AI actions

Do not surround the editor with unnecessary cards.

The editor should feel like a native part of the workspace.

---

# 18. Panels

Panels should feel composable.

Users should be able to understand:

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

without feeling that five separate applications are open.

Panel transitions should be:

* subtle
* fast
* predictable

---

# 19. Empty States

Do not use generic:

> "No data yet."

Instead, explain:

1. what this space is
2. why it is empty
3. what the user can do next

Example:

```text
No architecture map yet

Analyze this project to generate a visual
representation of its structure and dependencies.

[Analyze Project]
```

---

# 20. Loading States

Never make the entire interface spin.

Use contextual loading.

Bad:

```text
[ HUGE SPINNER ]
Loading...
```

Good:

```text
Analyzing project
●●●○○
128 / 340 files
```

The interface should remain usable whenever possible.

---

# 21. Error States

Errors should feel actionable.

Show:

```text
What happened
Why it happened
What the system tried
What the user can do next
```

Avoid:

> "Something went wrong."

unless absolutely necessary.

---

# 22. Animation

Animation should communicate:

* state
* hierarchy
* spatial continuity
* cause and effect

Prefer:

* 120–250ms micro-interactions
* subtle easing
* opacity
* transform
* layout transitions

Avoid:

* dramatic bouncing
* excessive spring effects
* decorative particles
* constant motion

The product should feel fast.

---

# 23. Hover / Focus / Selection

Every interactive element must have a clear state.

At minimum consider:

```text
default
hover
focus
active
selected
disabled
loading
error
success
```

Keyboard navigation must remain understandable.

---

# 24. Responsive Behavior

Do not merely shrink desktop UI.

Define what happens when:

```text
wide desktop
standard laptop
small laptop
tablet
mobile
```

The development environment is desktop-first, but secondary surfaces may adapt independently.

Prioritize:

1. workspace
2. code
3. agent
4. navigation
5. auxiliary panels

---

# 25. Accessibility

Production-grade UI must include:

* sufficient contrast
* keyboard navigation
* visible focus states
* semantic HTML
* aria labels where needed
* reduced-motion support
* readable font sizes

Accessibility is part of product quality.

---

# 26. Component Consistency

Before creating a new component, inspect the existing component system.

Reuse existing:

* buttons
* inputs
* dialogs
* tabs
* panels
* dropdowns
* tooltips
* badges
* command palette
* navigation elements

Do not create five visually different button styles.

If a component does not exist but will be reused, create a reusable primitive.

---

# 27. Design Before Implementation

Before making significant UI changes:

### Step 1

Inspect the current UI.

### Step 2

Understand the existing component architecture.

### Step 3

Identify visual problems.

### Step 4

Define the intended hierarchy.

### Step 5

Decide which existing components can be reused.

### Step 6

Implement.

### Step 7

Run the application.

### Step 8

Inspect the actual rendered interface.

### Step 9

Fix visual inconsistencies.

### Step 10

Only then consider the task complete.

---

# 28. Visual QA

Never assume that correct frontend code equals a correct interface.

When browser / screenshot tools are available:

1. run the application
2. open the relevant route
3. inspect the viewport
4. inspect major interaction states
5. capture screenshots when useful
6. compare against the intended visual hierarchy
7. identify visual problems
8. fix them
9. inspect again

Evaluate:

```text
Visual hierarchy
Spacing
Typography
Alignment
Density
Contrast
Component consistency
Interaction clarity
Animation
Overall product maturity
```

---

# 29. Visual Quality Checklist

Before declaring a UI task complete, ask:

### Product

* Does this feel like a professional developer tool?
* Does the UI communicate what the user should do next?
* Is the AI integrated into the workflow?

### Visual

* Is the hierarchy obvious?
* Is the spacing intentional?
* Are colors restrained?
* Are borders subtle?
* Are shadows necessary?
* Are there unnecessary containers?

### Interaction

* Are hover states clear?
* Are selected states clear?
* Are loading states meaningful?
* Are errors actionable?
* Does keyboard interaction make sense?

### AI

* Can I understand what the agent is doing?
* Can I understand what changed?
* Can I intervene?
* Can I review the result?

### Craft

* Does anything feel like a default Tailwind component?
* Does anything feel like a generic AI-generated dashboard?
* Is there unnecessary decoration?
* Are there inconsistent components?

If yes, fix it.

---

# 30. Anti-Patterns

Never produce interfaces dominated by:

```text
❌ giant gradient hero
❌ purple AI glow
❌ excessive glassmorphism
❌ huge rounded cards
❌ 20+ dashboard widgets
❌ random emojis
❌ oversized icons
❌ decorative AI orb
❌ unnecessary illustrations
❌ excessive badges
❌ excessive shadows
❌ generic "AI-powered" marketing language
❌ everything centered
❌ everything inside cards
```

---

# 31. Existing Codebase First

When working on an existing project:

DO NOT rewrite the entire frontend merely to make it look better.

First inspect:

* framework
* routing
* component library
* CSS architecture
* tokens
* existing patterns
* state management
* layout architecture

Preserve working functionality.

Improve the visual system incrementally.

---

# 32. Design Tokens

Whenever possible, centralize visual decisions.

Example:

```css
:root {
  --background-primary: ...;
  --background-secondary: ...;
  --surface-primary: ...;
  --surface-secondary: ...;

  --border-subtle: ...;
  --border-active: ...;

  --text-primary: ...;
  --text-secondary: ...;
  --text-muted: ...;

  --accent-primary: ...;
  --accent-success: ...;
  --accent-warning: ...;
  --accent-error: ...;

  --radius-sm: ...;
  --radius-md: ...;
  --radius-lg: ...;

  --space-1: ...;
  --space-2: ...;
  --space-3: ...;
  --space-4: ...;
}
```

Do not scatter arbitrary values throughout the codebase.

---

# 33. Design Language for This Product

The final interface should feel like:

> **A visual operating system for AI software engineering.**

Not:

> a website

Not:

> a dashboard

Not:

> a chatbot

Not:

> a code editor with an AI sidebar

The product should communicate that the user is interacting with a new type of development environment.

The Function Map, Agent, Code, Project structure, and conversational interface should feel like different representations of the same underlying system.

---

# 34. Final Principle

The ultimate goal is:

```text
Traditional IDE
       ↓
AI assistant added to IDE
       ↓
AI-native IDE
       ↓
AI-native development environment
```

The UI should visually communicate the final stage.

Every major surface should answer:

> "How does AI change the way this software should be interacted with?"

Do not simply put an AI chat panel beside a traditional IDE.

Design the entire experience around:

* intent
* context
* agents
* software structure
* execution
* feedback
* iteration

The interface should make complex AI-powered development feel understandable, controllable, and elegant.

---

# Implementation Directive

When asked to implement frontend UI/UX:

1. Read this skill completely.
2. Inspect the existing project.
3. Reuse the existing design system where possible.
4. Identify the visual problem before coding.
5. Make the smallest architectural change necessary.
6. Implement production-quality components.
7. Verify the actual rendered UI.
8. Iterate on visual quality.
9. Preserve existing functionality.
10. Never settle for a generic AI-generated appearance.

**Design intentionally. Build precisely. Verify visually.**
