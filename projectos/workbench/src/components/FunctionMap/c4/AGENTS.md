# C4 diagram parallel work — file ownership

Frozen API: `buildDiagram(input) → C4Diagram` in `buildDiagram.ts`.
Do **not** change `types.ts` exports without coordinating Wave 2.
Do **not** edit `FunctionMapCanvas.tsx`, `FunctionMapContext.tsx`, or `contracts/graph.ts` in Wave 1.

| Owner | May edit |
|---|---|
| Shapes | `c4/shapes/**` only (refine visuals; keep component names) |
| Context | `c4/context/**` |
| Container | `c4/container/**` |
| Component | `c4/component/**` |
| Code | `c4/code/**` |
| Edges | `edgePresentation.ts`, `FloatingStraightEdge.tsx` (+ colocated CSS/tests) |
| Scan | `projectos/services/structure-graph-*.ts`, `projectos/structure-graph/prompts/**` |
| Merge (Wave 2) | Canvas, Context, LevelNavigator, i18n |

Shared helpers in `diagramShared.ts` / `shapeKind.ts`: prefer extend carefully; avoid breaking other builders.
