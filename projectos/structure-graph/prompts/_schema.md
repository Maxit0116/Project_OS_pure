# ProjectGraph scan schema (L2 rounds)

Model output is **not** a full ProjectGraph. Two small objects:

## Round A

```ts
{
  architecture: { notation: "c4", defaultLevel: "context", layers: [{ id, label, order, description }] },
  nodes: FunctionalNode[],  // person + software_system + external_system + container/data_store
  edges: FunctionalEdge[]
}
```

## Round B

```ts
{
  components: [{
    id, name, parentId, description, summary, responsibility, layer,
    technology?,  // optional short stack label
    pathHints: string[],   // real path prefixes from the file list
    notes?, owners?, openQuestions?, confidence?
  }],
  edges: FunctionalEdge[]
}
```

Do **not** emit `fileIndex` or `fileRelations`.
Do **not** emit layout coordinates, canvas positions, or view state.

## FunctionalNode field roles (one line each)

| Field | Role |
|-------|------|
| `id` | Stable identifier; keep across refine when possible |
| `name` | Product-facing label (not a directory shell) |
| `summary` | Card line. ≤24 CJK characters or ≤12 words. Do not repeat `name`. |
| `description` | Hover preview. 1–2 sentences, about 40–120 CJK characters. Add who uses it, what it connects to, and the boundary. Do not repeat `summary`. |
| `responsibility` | One ownership sentence for the detail drawer. Do not repeat `summary`. |
| `level` + `elementType` | C4 placement (see below) |
| `layer` | experience / application / infrastructure |
| `technology` | Short stack for shape selection (Next.js, PostgreSQL, …) |
| `parentId` | Nesting: container → system; component → container |
| `confidence` | 0–1; below 0.6 should include `openQuestions` |
| `notes` | Evidence notes (real paths / ownership hints) |
| `openQuestions` | Unresolved architecture questions |
| `owners` | Optional team / CODEOWNERS-style owners |
| `tags` | Optional; use `External` for external systems |

## FunctionalNode (architecture fields)

- Required conceptually: `id`, `name`, `description`, `summary`, `responsibility`, `level`, `elementType`, `layer`
- Optional: `technology` — short string used by UI `resolveC4ShapeKind` (e.g. `Next.js`, `PostgreSQL`, `Kafka`, `React Native`)
- person: level=`context`, elementType=`person`
- system: level=`context`, elementType=`software_system`
- external: level=`context`, elementType=`external_system`, prefer a `technology` or product name; tag `External`
- containers: level=`container`, elementType=`container`, **set `technology`**, parentId = system
- databases/caches: level=`container`, elementType=`data_store`, **set `technology`** (`PostgreSQL`, `Redis`, …), parentId = system
- components: level=`component`, elementType=`component`, parentId = container

Allowed `elementType` values only: `person` | `software_system` | `external_system` | `container` | `component` | `code_element` | `data_store`

## FunctionalEdge

- `id`, `source`, `target`, `relation`, `label`, `evidence`, `confidence`
- **Required when known**: `technology` — protocol / transport (`HTTP`, `HTTPS`, `gRPC`, `Kafka`, `SQL`, `WebSocket`, …)
- Optional: `purpose`
