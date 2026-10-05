# Design Intent Engineering Skill

## Purpose

This skill defines the architectural and engineering principles for the visual design-intent subsystem of the DevTool.

The subsystem transforms human design intent into structured engineering intent through:

* sketching
* drawing
* gestures
* voice
* natural-language prompts
* screenshots
* existing UI
* project context
* code
* user interactions

The core philosophy is:

> **From Vibe Coding to Vibe Engineering.**

The system must not treat AI coding as a simple:

`Prompt → Code`

pipeline.

Instead, it should use:

`Input → Interpretation → Intent → Graph Mutation → Validation → Agent Execution`

The ultimate goal is to create a unified project representation in which:

* design
* intent
* UI
* functions
* architecture
* code
* agents
* tests
* Git history

can be connected and understood as parts of the same project.

---

# 1. Core Architecture Principle

The system should follow this conceptual pipeline:

```text
Human Input
    │
    ├── Text Prompt
    ├── Voice
    ├── Sketch
    ├── Gesture
    ├── Screenshot
    ├── Existing UI
    ├── Code
    └── Project Context
          │
          ▼
Intent Interpretation
          │
          ▼
Structured Intent
          │
          ▼
Intent Graph
          │
          ▼
Project Graph
          │
          ├── Design Map
          ├── Function Map
          ├── Architecture
          ├── UI Components
          ├── Code
          ├── APIs
          ├── Data
          ├── Agents
          ├── Tests
          └── Git History
          │
          ▼
Implementation Plan
          │
          ▼
AI Agent Execution
          │
          ▼
Validation / QA
          │
          ▼
Graph Update
```

For complex tasks, **do not implement a direct Sketch → Code pipeline**.

Instead:

```text
Sketch
+
Voice
+
Gesture
+
Project Context
+
Existing Project State
        ↓
Intent Graph
        ↓
Design / Function Graph
        ↓
Implementation Plan
        ↓
Code
        ↓
Validation
```

---

# 2. The Unified Project Graph

The long-term architecture should treat the entire project as a graph rather than a collection of disconnected artifacts.

The graph may contain:

```text
Project
├── Design
│   ├── Screen
│   ├── Component
│   ├── Region
│   ├── Layout
│   ├── Style
│   └── Interaction
│
├── Function
│   ├── Feature
│   ├── Function
│   ├── Module
│   └── Workflow
│
├── Architecture
│   ├── Service
│   ├── API
│   ├── Database
│   ├── External Service
│   └── Infrastructure
│
├── Code
│   ├── File
│   ├── Class
│   ├── Function
│   ├── Component
│   └── Hook
│
├── Agent
│   ├── Agent
│   ├── Task
│   └── Execution
│
├── QA
│   ├── Test
│   ├── Constraint
│   ├── Design Rule
│   └── Validation Result
│
└── History
    ├── Intent
    ├── Change
    ├── Commit
    └── Decision
```

Nodes should have explicit relationships.

Examples:

```text
Button
    ↓ implements
Login Function
    ↓ calls
Auth API
    ↓ accesses
User Database
```

Or:

```text
Sketch Region
    ↓ interpreted as
Login Button
    ↓ implements
Login Function
    ↓ implemented by
LoginButton.tsx
```

The graph is the central source of semantic relationships.

---

# 3. Intent Graph

The Intent Graph is the intermediate representation between human input and engineering implementation.

Do not immediately convert human input into code.

Instead convert it into structured intent.

Example:

```text
User sketches a rectangle
        +
User says:
"点击以后登录，如果失败就在下面显示错误"
        ↓
Intent
        ↓
Component: Login Button
Behavior: Trigger authentication
Failure Behavior: Show error message
Relationship: Login Button → Auth Service
```

The Intent Graph should preserve:

* what the user intended
* what the AI inferred
* where the intent came from
* how confident the AI is
* which project object it affects
* which implementation it should eventually modify

---

# 4. Sketch Representation

Do not store only the final screenshot.

The system should preserve the semantic history of the sketching session.

A sketch session should conceptually contain:

```text
SketchSession
├── Stroke
├── Gesture
├── SpatialObject
├── VoiceEvent
├── ActiveTarget
├── Intent
└── Interpretation
```

Each stroke should be associated with temporal and spatial information where possible.

Example:

```text
Stroke #01
timestamp: T1
bounds: ...
path: ...

Voice #01
timestamp: T2
text: "这是登录按钮"

Stroke #02
timestamp: T3
bounds: ...

Voice #02
timestamp: T4
text: "点这里以后登录"
```

This allows the system to reason about:

```text
what was drawn
+
what was said
+
when it was said
+
where it was said
+
what was active at that moment
```

Do not throw away this provenance prematurely.

---

# 5. Gesture Semantics

Gestures may provide semantic hints.

Possible interpretations include:

```text
Circle
→ select / highlight

Arrow
→ relationship / flow

Rectangle
→ component / container / region

Underline
→ emphasis

Strike-through
→ remove / reject

Freehand annotation
→ description / explanation
```

These are heuristics, NOT hard-coded meanings.

The AI should infer intent using:

```text
gesture
+
spatial context
+
nearby objects
+
voice
+
temporal context
+
project context
```

Never assume a gesture has one universal meaning.

---

# 6. Voice + Spatial Association

Voice should not be treated as an independent chatbot input.

Voice must be associated with the current spatial context.

For example:

User draws a rectangle around a button.

Then says:

> "把这个按钮做大一点，点击以后跳到主页。"

The system should infer:

```text
ActiveTarget:
    Button

Intent #1:
    Increase size

Intent #2:
    Add navigation behavior

Target:
    Button

Destination:
    Home Screen
```

Possible association signals include:

1. Active selection
2. Cursor position
3. Recently created object
4. Recently modified object
5. Gesture target
6. Spatial proximity
7. Temporal proximity
8. Current screen
9. Current graph node
10. Existing project context

Spatial and temporal association should be first-class concepts.

---

# 7. Active Target

The system should maintain an explicit Active Target.

The Active Target may be:

```text
Screen
Region
Component
Node
Function
File
Code Selection
Graph Node
```

Voice commands can operate on the active target.

Examples:

```text
"把这个变大"
→ ActiveTarget.size += ...

"把它移动到右边"
→ ActiveTarget.position = ...

"这个改成搜索框"
→ ActiveTarget.type = SearchInput

"点击之后打开设置"
→ ActiveTarget.onClick = Navigate(Settings)
```

If there is no reliable target, the system should ask for clarification instead of silently modifying the wrong object.

---

# 8. Intent Types

Voice and sketch interpretations should be classified into structured intent types.

Possible categories:

```text
Description
Behavior
Constraint
Modification
Relationship
DataSource
Interaction
Navigation
DesignDirection
ImplementationHint
Deletion
Creation
Grouping
Selection
```

Example:

```text
"这是一个用户头像"
→ Description

"点击以后打开个人资料"
→ Navigation / Interaction

"不能让普通用户看到这个按钮"
→ Constraint

"把这个卡片放大"
→ Modification

"这个数据来自后端 API"
→ DataSource

"这个按钮连接到登录功能"
→ Relationship
```

The classification system should remain extensible.

---

# 9. Confidence

Every non-trivial interpretation should be capable of carrying confidence.

Example:

```text
Login Button
confidence: 0.98

Password Input
confidence: 0.96

User Profile Card
confidence: 0.61

Backend Authentication Behavior
confidence: 0.43
```

High-confidence interpretations may be applied automatically.

Low-confidence interpretations should trigger clarification or visual confirmation.

The system should prefer:

> "I am not sure; let me confirm."

over:

> silently making the wrong change.

Confidence should also be explainable where practical.

---

# 10. Design IR

The system should maintain a structured intermediate representation between visual design and implementation.

Conceptually:

```text
Design IR
├── Screen
├── Region
├── Component
├── Layout
├── Style
├── Interaction
├── Data
├── Navigation
├── Constraint
└── Intent
```

Design IR should be independent of any single frontend framework.

Do not tightly couple the semantic model to:

* React
* Vue
* SwiftUI
* Flutter
* HTML
* CSS

Those are implementation targets.

The Design IR describes what the user wants.

The implementation layer describes how it is implemented.

---

# 11. Design → Function → Code

The preferred transformation is:

```text
Design
    ↓
Intent
    ↓
Function
    ↓
Implementation
    ↓
Code
```

Example:

```text
Login Screen
    ↓
Login Button
    ↓
Login Function
    ↓
Authentication Workflow
    ↓
Auth Service
    ↓
Code
```

The Function Map should therefore be connected to the Design Map.

A UI component should be able to answer:

> "What function does this implement?"

A Function node should be able to answer:

> "Which UI elements expose this function?"

The system should avoid creating a purely visual graph disconnected from actual engineering semantics.

---

# 12. Code → Function → Design

The relationship must work in both directions.

Existing code should be analyzable into:

```text
Code
    ↓
Function
    ↓
Design
```

Example:

```text
LoginButton.tsx
    ↓ implements
Login Function
    ↓ exposed by
Login Screen
```

This enables the graph to represent existing projects, not only newly generated projects.

The system should therefore support reverse synchronization where feasible:

```text
Code Change
    ↓
Graph Update
    ↓
Design / Function Impact
```

---

# 13. Design Map

The Design Map represents the visual and interaction layer of the project.

It should describe:

```text
Screens
    ↓
Regions
    ↓
Components
    ↓
Interactions
    ↓
Functions
```

Screen-to-screen navigation should be represented explicitly.

For example:

```text
Login Screen
    │
    └── Login Button
            │
            └── Auth Function
                    │
                    └── Success
                          ↓
                     Home Screen
```

M3E-style screen connections can be used as inspiration, but the Design Map should eventually be part of the larger Project Graph.

Do not create a completely isolated design editor unless there is a strong architectural reason.

---

# 14. Function Map

The Function Map is a core view of the DevTool.

It should not merely display a software architecture diagram.

It should allow users to understand:

```text
What does this project do?
How are functions related?
Where is each function implemented?
Which UI exposes it?
Which API does it use?
Which agent is working on it?
Which tests verify it?
Which commits changed it?
```

A Function node should ideally connect to:

```text
UI
Code
API
Data
Tests
Agent
Intent
Git
```

The Function Map should therefore be a semantic engineering map rather than a static architecture chart.

---

# 15. Graph Interaction

Graph nodes should be actionable.

Clicking a node should allow the user to:

```text
Inspect
Edit
Prompt
Generate
Navigate
Trace
Test
Assign to Agent
View Code
View Design
View History
```

For example:

```text
User clicks:
"Authentication"

Possible actions:

→ Show implementation
→ Show UI
→ Show API
→ Show dependencies
→ Ask AI to modify
→ Run tests
→ View recent changes
→ Assign to agent
```

The graph should become an interaction surface for development, not merely visualization.

---

# 16. Sketch-to-Intent

The sketch system should follow:

```text
Raw Sketch
    ↓
Segmentation
    ↓
Spatial Objects
    ↓
Gesture Interpretation
    ↓
Voice Association
    ↓
Intent Extraction
    ↓
Design IR
    ↓
Graph Mutation
```

Do not jump directly from pixels to production code.

For simple prototypes, a simplified path is acceptable:

```text
Sketch
    ↓
Design IR
    ↓
Prototype
```

For engineering tasks:

```text
Sketch
+
Voice
+
Context
    ↓
Intent Graph
    ↓
Function / Design Graph
    ↓
Implementation Plan
    ↓
Code Agent
```

---

# 17. Voice Interpretation

Voice should be interpreted based on context.

The AI should consider:

```text
Current screen
Current graph node
Active target
Recent strokes
Recent gestures
Recent voice commands
Existing project structure
Current development task
```

Example:

```text
User:
"这个大一点"

Insufficient context:
→ Ask which object.

Active target = Button:
→ Modify button size.

Active target = Card:
→ Modify card size.
```

The same sentence can therefore produce different intents depending on context.

---

# 18. Provenance

Every generated or inferred object should preserve provenance where practical.

Example:

```text
Login Button

created_from:
    Sketch #12

intent_source:
    Voice #07

interpreted_at:
    timestamp

confidence:
    0.96

implemented_by:
    LoginButton.tsx
```

Provenance enables:

* debugging
* explainability
* undo
* replay
* user feedback
* AI correction
* history
* graph synchronization

The system should not lose the relationship between human intent and generated implementation.

---

# 19. Design Session History

The system should be capable of representing the evolution of a design session.

Conceptually:

```text
Session
    ↓
Event #01
    ↓
Event #02
    ↓
Event #03
    ↓
Intent
    ↓
Graph Mutation
    ↓
Implementation
```

The user should eventually be able to ask:

> "Why did you make this button behave this way?"

The system should be able to trace:

```text
Code
← Function
← Intent
← Voice
← Sketch
```

This creates an explainable human-AI development loop.

---

# 20. Design QA

Design generation should not stop at producing HTML/CSS.

The system should include a Design Rule Engine.

Conceptually:

```text
DesignRuleEngine
├── AntiSlopRules
├── AccessibilityRules
├── DesignSystemRules
├── ProjectSpecificRules
└── UserRules
```

## 20.1 Gesso anti-slop (Project OS Design tab)

Gate authority for exported HTML is the open-source package `@gessobuild/anti-slop` (MIT).

- Run critique on **HTML export** derived from Sketch / Design IR — never treat JSX/TSX as the detector input.
- Host Intent rules (e.g. unlabeled sketch regions) run alongside official FLAGSHIP_RULES.
- `design.md` is a **derived** agent handoff; Design IR / design-blocks remain canonical.
- Propose / Confirm / Hand to agent require PASS, or an explicit `slopOverrideReason`.
- Optional agent install: `npx skills add Gesso-Build/skills`
- Docs: `docs/Design-Tab-Gesso-Integration-PRD.md` and `docs/Design-Tab-Gesso-Integration-Dev-Plan.md`

Rules should be deterministic whenever possible.

Examples:

```text
No invalid contrast
No missing alt text
No excessive nesting
No forbidden colors
No inconsistent typography
No accidental gradient text
No unnecessary decorative elements
No excessive border radius
No inconsistent spacing
No broken images
```

The system should separate:

```text
Generation
    ↓
Critique
    ↓
Fix
    ↓
Verification
```

Do not rely exclusively on the model to judge its own visual output.

---

# 21. Anti-Slop Philosophy

The goal of Anti-Slop is not to enforce one visual style.

It should enforce explicit quality constraints.

Rules should be:

* deterministic
* inspectable
* explainable
* configurable
* extensible

A rule should ideally provide:

```text
Rule
Severity
Evidence
Suggested Fix
Auto-fix capability
```

Intentional exceptions should be possible.

Never force a design rule when the user explicitly chose to violate it.

---

# 22. Agent Integration

AI agents should operate on structured engineering context rather than raw screenshots whenever possible.

Preferred:

```text
Agent
    ↓
Intent
    ↓
Graph
    ↓
Relevant Nodes
    ↓
Implementation Plan
    ↓
Code
```

Avoid:

```text
Agent
    ↓
Huge screenshot
    ↓
Guess everything
    ↓
Modify random files
```

When an agent receives a task from a graph node, provide:

```text
Node
+
Related Nodes
+
Intent
+
Constraints
+
Relevant Code
+
Relevant Design
+
Relevant Tests
```

This minimizes unnecessary context and reduces hallucinated relationships.

---

# 23. Prompting from Graph Nodes

A graph node can act as a semantic prompt target.

Example:

User clicks:

```text
Authentication
```

Then says:

> "支持 Google 登录。"

The agent should understand:

```text
Target:
Authentication Function

Requested Change:
Add Google OAuth

Potential Impact:
UI
Auth Service
API
Database
Environment Variables
Tests
```

Before implementation, the agent should inspect the graph and repository to identify impact.

---

# 24. Graph Mutation

AI interpretation should not directly modify arbitrary project files.

Prefer:

```text
User Input
    ↓
Intent
    ↓
Graph Mutation Proposal
    ↓
Validation
    ↓
Implementation Plan
    ↓
Code Agent
```

For safe/simple operations, graph mutation may be automatic.

For destructive or ambiguous operations, require confirmation.

---

# 25. Existing Project Support

The system must support existing repositories.

The initial project graph may be generated through:

```text
Repository
    ↓
Static Analysis
    ↓
AST / Dependency Analysis
    ↓
Component Detection
    ↓
API Detection
    ↓
Function Detection
    ↓
Graph Construction
```

Then enrich the graph with:

```text
UI
Functions
Architecture
Tests
Git
Documentation
```

The system should not assume that every project was created inside the DevTool.

---

# 26. Stable Visualization

The graph visualization should prioritize usability over mathematically perfect layouts.

For the primary Function Map:

* stable node positions are preferred
* deterministic layouts are preferred
* hierarchy should be understandable
* important nodes should remain visually stable
* repeated opening of the same project should produce a similar topology

Avoid relying exclusively on unstable force-directed layouts.

Possible strategy:

```text
Depth
    ↓
Layer
    ↓
Deterministic Position
```

Force-directed layouts may still be used as an optional exploration mode.

---

# 27. UI Architecture

The visual system should be treated as multiple views over the same underlying semantic model.

Possible views:

```text
Project Graph
├── Function Map
├── Design Map
├── Architecture Map
├── Agent Map
├── Dependency Map
└── History Map
```

Do not duplicate semantic data for each view.

Prefer:

```text
Unified Graph Model
        ↓
Multiple Views
```

This allows a node selected in one view to remain semantically identical in another.

---

# 28. Implementation Rules

When modifying the existing codebase:

1. Inspect the repository before designing the implementation.
2. Identify the existing architecture.
3. Identify existing graph models.
4. Identify existing UI/canvas systems.
5. Identify existing agent integrations.
6. Reuse existing abstractions where appropriate.
7. Avoid introducing duplicate models.
8. Avoid unnecessary rewrites.
9. Keep the semantic model framework-independent.
10. Keep UI rendering separate from semantic graph state.
11. Keep AI interpretation separate from deterministic graph operations.
12. Add tests for graph mutations and intent interpretation.
13. Preserve backward compatibility when possible.
14. Do not remove existing functionality without justification.

---

# 29. Feature Development Workflow

When implementing a new feature in this subsystem, use:

```text
1. Understand
2. Inspect
3. Model
4. Interpret
5. Design
6. Implement
7. Validate
8. Synchronize
```

Detailed process:

### Step 1 — Understand

Identify:

* user goal
* current workflow
* affected subsystem
* expected behavior

### Step 2 — Inspect

Inspect:

* existing code
* graph model
* canvas model
* UI components
* agent system
* persistence
* tests

### Step 3 — Model

Determine:

```text
What new entities are required?
What relationships are required?
What existing entities can be reused?
```

### Step 4 — Interpret

Determine how:

```text
Sketch
Voice
Gesture
Text
Context
```

become structured intent.

### Step 5 — Design

Define:

* data model
* state transitions
* graph mutations
* UI behavior
* error handling
* confidence handling

### Step 6 — Implement

Implement the smallest coherent change.

Do not prematurely rewrite unrelated architecture.

### Step 7 — Validate

Validate:

* type safety
* unit tests
* graph integrity
* UI behavior
* intent correctness
* accessibility
* design rules

### Step 8 — Synchronize

Update:

```text
Design
Function Map
Project Graph
Code
Tests
History
```

where applicable.

---

# 30. Important Architectural Principle

The most important abstraction is:

> **Input → Interpretation → Intent → Graph Mutation**

Everything else should build on top of this.

Different inputs should converge into the same semantic system:

```text
Prompt ───────┐
Voice ────────┤
Sketch ───────┤
Gesture ──────┤
Screenshot ───┤
Code ─────────┤
Click ────────┤
Existing UI ──┘
       ↓
Interpretation
       ↓
Intent
       ↓
Unified Project Graph
```

Do not create completely separate pipelines for each input type if they ultimately represent the same user intent.

---

# 31. Product Philosophy

This subsystem is not intended to become:

* another Figma clone
* another whiteboard
* another chatbot
* another code generator
* another architecture diagram tool

Its purpose is to create a new development interface where:

```text
Human Intent
      ↓
Spatial / Natural Interaction
      ↓
Structured Engineering Intent
      ↓
Project Graph
      ↓
AI Agents
      ↓
Software
```

The user should eventually be able to:

```text
Draw something
+
Say something
+
Point at something
+
Click a graph node
```

and the system should understand that as an engineering instruction.

The long-term vision is:

> **A visual, agentic engineering environment where human intent, design, architecture, functions, code, agents and verification share one semantic project graph.**

---

# 32. When This Skill Is Active

Use this skill whenever the task involves:

* Sketch-to-UI
* Sketch-to-code
* voice-driven design
* voice + canvas interaction
* gesture interpretation
* spatial prompting
* Design Map
* Function Map integration
* Intent Graph
* Design IR
* UI-to-function mapping
* function-to-code mapping
* code-to-design mapping
* visual programming
* design QA
* anti-slop
* design system validation
* graph-based development
* agent interaction with visual nodes
* multimodal development workflows

When the task is unrelated to these systems, do not force this architecture into the solution.

---

# 33. Final Rule

Always ask:

> **What is the user's intent, where does that intent live in the project graph, and how can the system preserve the relationship between human intent and implementation?**

The goal is not merely:

```text
AI generates code.
```

The goal is:

```text
Human expresses intent.
        ↓
AI understands intent.
        ↓
Intent becomes structured.
        ↓
Structure becomes graph.
        ↓
Graph guides implementation.
        ↓
Implementation updates graph.
        ↓
Validation verifies the result.
```

This is the foundation of the DevTool's transition:

> **From Vibe Coding to Vibe Engineering.**
