# Codex

Do not copy Codex. Use this file when changing code surfaces, diffs, technical output, or the boundary between user intent and system execution.

Codex is the execution side of the ChatGPT / Codex influence in this skill. Keep intent readable, and keep execution inspectable.

## Borrow

* clear distinction between user intent and system execution
* simple interaction surfaces
* progressive disclosure
* restrained visual decoration
* clean separation between interface text and technical content

## Intent versus execution

The user states intent in context: a selected node, a selected range, or a scoped prompt.

The system then shows execution as something separate and reviewable:

* files inspected or changed
* commands run
* results, failures, and the next action

Do not collapse intent and execution into one undifferentiated transcript. Do not hide the code behind the conversation.

## Code as a native surface

The editor is part of the workspace, not a card inside a chat.

Maintain:

* predictable indentation
* clear line hierarchy
* readable syntax colors
* minimal chrome
* strong selection state
* contextual AI actions

Contextual actions on a selection — Explain, Modify, Refactor — stay attached to the code.

Use monospace for code and technical output. Use the UI sans-serif for labels, status, and controls.

## Review

The developer must be able to understand what changed and review the result without opening five additional screens.

Progress must never be fake. Show real files, real counts, and real failures.

## Reject

* a chat transcript that replaces the workspace
* decorative AI chrome around code
* generic "AI-powered" marketing language on engineering surfaces
* wrapping the editor in unnecessary cards
