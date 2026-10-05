---
name: projectos-features
description: Maintain Project OS semantic feature maps (Epic→Feature→Step) in .projectos/features.json. Use when scanning a repo into a function story graph, syncing after code changes, or generating guided tours.
---

# Project OS Features (Semantic Flow)

Adapted from CodeSee (MIT). Semantic control lives in `.projectos/features.json`.

## When to use

- User asks to generate / update a function map or architecture story graph
- After implementing a logical feature checkpoint
- Onboarding tour for a codebase

## Workflow

1. Read `.projectos/prompts/scan.md` (or `sync.md`)
2. Follow `_schema.md` + `_rules.md`
3. Write `.projectos/features.json`
4. Prefer linking `feature.nodeId` to existing Function Map nodes when known
5. Tell the user to open Workbench → Function Map → **Story** layer

## API helpers (desktop)

- `getFeaturesScanHint(projectId)` — recommended scan route
- `saveFeatures(projectId, file)` — persist
- `getFeatureSummary(projectId)` — compact AI memory
