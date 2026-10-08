# Devin

Do not copy Devin. Use this file when changing agent status, activity streams, delegation, loading, errors, or review of agent work.

## Borrow

* agent-centric workflows
* task-oriented organization
* visible progress
* delegation
* execution state
* review-oriented interaction

## The agent is not a chatbot

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

Represent agent execution as a state machine:

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

Avoid giant glowing AI avatars. Prefer status indicators, progress, activity streams, tool calls, expandable execution details, and contextual notifications.

## Activity

Agent activity should be readable at a glance.

```text
● Analyzing project
  └─ 14 files inspected

● Updating architecture
  └─ src/graph/layout.ts

● Running tests
  └─ 42 passed

✓ Task completed
```

The user should be able to see progress, expand details, inspect tool calls, see errors, cancel execution, and resume when appropriate.

Progress must never be fake.

## Loading

Never make the entire interface spin. Use contextual loading. The interface should remain usable whenever possible.

```text
Analyzing project
●●●○○
128 / 340 files
```

## Errors

Errors should feel actionable. Show what happened, why it happened, what the system tried, and what the user can do next.

Avoid "Something went wrong." unless absolutely necessary.

## Review

Before the agent surface is done, confirm:

* the user can understand what the agent is doing
* the user can understand what changed
* the user can intervene
* the user can review the result
