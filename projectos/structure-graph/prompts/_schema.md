# ProjectGraph schema summary (v0.3.0)

```ts
{
  version: "0.3.0",
  projectId: string,          // must match workspace projectId
  projectName: string,
  projectType: "nextjs-app" | "nextjs-pages" | "node" | "unknown",
  analyzedAt: ISO8601 string,
  analysisStatus: "complete" | "partial" | "demo_fixture" | "error",
  architecture: {
    notation: "c4",
    defaultLevel: "context" | "container" | "component" | "code",
    layers: [{ id, label, order, description }]  // ≥1; node.layer must match an id
  },
  nodes: FunctionalNode[],
  edges: FunctionalEdge[],
  fileIndex: FileEntry[],
  topology?: { rootIds: string[], maxDepth: number, totalNodes: number },
  analysisError?: string | null
}
```

## FunctionalNode

- Required: `id`, `type` (`capability`|`suggested`), `name`, `status`, `description`, `summary`,
  `linkedFiles[]`, `upstream[]`, `downstream[]`, `confidence` (0–1), `tags[]`
- Architecture nodes also need: `level`, `elementType`, `layer`, `responsibility`
- Hierarchy: `parentId` + parent's `children` must be consistent
- Levels: system=`context`/`software_system`; containers=`container`; components=`component`
- `linkedFiles`: `{ path, role: "primary"|"supporting"|"config"|"test", summary? }`

## FunctionalEdge

- Required: `id`, `source`, `target`, `relation`, `confidence`
- v0.3.0 also requires non-empty `label` and `evidence`
- `relation`: `depends_on` | `redirects_to` | `data_flows_to` | `imports` | `shares_data` |
  `uses` | `calls` | `reads_from` | `writes_to` | `publishes_to` | `subscribes_to`

## FileEntry

- Required: `path`, `type` (`page`|`component`|`api`|`lib`|`config`|`style`|`test`|`asset`|`other`),
  `nodeIds[]`, `imports[]`, `exports[]`
- Optional: `status`, `size`, `lastModified`
