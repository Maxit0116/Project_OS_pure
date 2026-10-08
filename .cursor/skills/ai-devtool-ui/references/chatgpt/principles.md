# ChatGPT

Do not copy ChatGPT. Use this file when changing conversation surfaces, empty states, typography, or progressive disclosure.

## Borrow

* extremely clean typography
* conversational clarity
* restrained visual decoration
* generous whitespace where appropriate
* simple interaction surfaces
* progressive disclosure
* clear distinction between user intent and system execution

## The chat is not the product

The chat is one interaction surface inside the development environment.

Do not create a huge conversation occupying the entire screen unless the context requires it. Prefer contextual AI interaction.

```text
User selects node
        ↓
AI panel opens
        ↓
Prompt is scoped to node
```

```text
User selects code
        ↓
Contextual action
        ↓
Explain / Modify / Refactor
```

The AI should feel embedded into the development environment.

## Typography

Typography is one of the primary visual systems.

Use a clean modern sans-serif for UI and a high-quality monospace for code. Keep interface text and technical content distinct.

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

Avoid huge typography, excessive font-weight changes, too many font sizes, decorative fonts, and inconsistent capitalization. Text should feel precise and quiet.

## Whitespace and disclosure

Use whitespace to separate conceptual groups, not to make the interface artificially sparse.

Reveal detail as the task requires it. Do not front-load every control, badge, and explanation on the first surface.

## Empty states

Do not use a generic "No data yet."

Explain:

1. what this space is
2. why it is empty
3. what the user can do next

```text
No architecture map yet

Analyze this project to generate a visual
representation of its structure and dependencies.

[Analyze Project]
```

## Restraint

Every visual element must answer what information it communicates, what action it enables, or what relationship it establishes. If the answer is unclear, remove it.

Do not decorate the conversation with gradients, glowing avatars, illustrations, or marketing language.
