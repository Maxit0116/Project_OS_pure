# Wave 2 merge checklist (parent agent)

Status: **done** (2026-10-08)

1. ✅ `nodeTypes`: `c4Shape`, `c4Boundary`
2. ✅ `buildDiagram` when `architecture.notation === 'c4'`
3. ✅ C4 nodes → RF `c4Shape` with per-shape size
4. ✅ Boundaries → `c4Boundary` at `Z_C4_BOUNDARY`
5. ✅ Edges use `formatC4EdgeLabel`
6. ✅ Drill: `c4Shape` shares click/dblclick/context handlers; `defaultArchitectureScopeId` + parentId reverse links
7. ✅ Artifacts unchanged; layer bands suppressed in C4 mode
8. ✅ i18n levelDescriptions (zh/en) describe C4 boundaries + drill
9. ✅ Component diagram falls back to primary container when scope missing
10. ✅ Unit tests: architectureView + c4 + edgePresentation (45 passed)
