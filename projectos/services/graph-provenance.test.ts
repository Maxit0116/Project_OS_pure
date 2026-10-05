import { describe, expect, it } from "vitest";

import {
  GraphProductOverlaySchema,
  ProjectGraphSchema,
  type GraphProductOverlay,
  type ProjectGraph,
} from "../contracts/index.js";
import {
  GraphProvenanceError,
  composeProjectGraph,
  deriveGraphProductOverlay,
  resolveHybridGraphFreshness,
} from "./graph-provenance.js";

describe("graph provenance composition", () => {
  it("derives and composes product fields, topology, created nodes, files, and tombstones", async () => {
    const base = makeGraph();
    const effective = makeProductGraph(base);
    const overlay = await deriveGraphProductOverlay({
      analyzerBase: base,
      effectiveGraph: effective,
      revision: 1,
      updatedAt: "2026-07-19T01:00:00.000Z",
      analyzerEvidenceStale: true,
    });

    expect(overlay.tombstoneNodeIds).toEqual(["code_a"]);
    expect(overlay.createdNodes.map((node) => node.id)).toEqual(["code_product"]);
    expect(overlay.nodeProductOverrides).toEqual([
      { nodeId: "component_a", fields: { summary: "Product-owned summary" } },
    ]);
    expect(composeProjectGraph(base, overlay)).toEqual(effective);
  });

  it("keeps product overlay and tombstones across analyzer-base replacement", async () => {
    const base = makeGraph();
    const effective = makeProductGraph(base);
    const overlay = await deriveGraphProductOverlay({
      analyzerBase: base,
      effectiveGraph: effective,
      revision: 2,
      updatedAt: "2026-07-19T02:00:00.000Z",
      analyzerEvidenceStale: true,
    });
    const reanalyzed = structuredClone(base);
    reanalyzed.analyzedAt = "2026-07-20T00:00:00.000Z";
    reanalyzed.nodes.find((node) => node.id === "component_a")!.description = "Fresh analyzer evidence";
    reanalyzed.nodes.find((node) => node.id === "code_a")!.summary = "Analyzer tried to resurrect this";

    const composed = composeProjectGraph(reanalyzed, overlay);
    expect(composed.nodes.find((node) => node.id === "component_a")).toMatchObject({
      summary: "Product-owned summary",
      description: "Fresh analyzer evidence",
    });
    expect(composed.nodes.some((node) => node.id === "code_a")).toBe(false);
    expect(composed.nodes.some((node) => node.id === "code_product")).toBe(true);

    const analyzerWithoutTombstonedNode = structuredClone(reanalyzed);
    analyzerWithoutTombstonedNode.nodes = analyzerWithoutTombstonedNode.nodes.filter(
      (node) => node.id !== "code_a",
    );
    analyzerWithoutTombstonedNode.nodes.find((node) => node.id === "component_a")!.children = [];
    analyzerWithoutTombstonedNode.fileIndex = [];
    analyzerWithoutTombstonedNode.topology = { rootIds: ["root"], maxDepth: 2, totalNodes: 3 };
    const productOnNewBase = composeProjectGraph(analyzerWithoutTombstonedNode, overlay);
    const refreshedOverlay = await deriveGraphProductOverlay({
      analyzerBase: analyzerWithoutTombstonedNode,
      effectiveGraph: productOnNewBase,
      previousOverlay: overlay,
      revision: 3,
      updatedAt: "2026-07-20T01:00:00.000Z",
      analyzerEvidenceStale: true,
    });
    expect(refreshedOverlay.tombstoneNodeIds).toContain("code_a");
    expect(refreshedOverlay.nodeProductOverrides).toContainEqual({
      nodeId: "component_a",
      fields: { summary: "Product-owned summary" },
    });
  });

  it("tombstones a deleted product-created node so later analysis cannot resurrect its id", async () => {
    const base = makeGraph();
    const productGraph = makeProductGraph(base);
    const createdOverlay = await deriveGraphProductOverlay({
      analyzerBase: base,
      effectiveGraph: productGraph,
      revision: 1,
      updatedAt: "2026-07-19T01:00:00.000Z",
      analyzerEvidenceStale: true,
    });
    const deleted = structuredClone(productGraph);
    deleted.nodes = deleted.nodes.filter((node) => node.id !== "code_product");
    deleted.nodes.find((node) => node.id === "component_a")!.children = [];
    deleted.fileIndex = [];
    deleted.topology = { rootIds: ["root"], maxDepth: 2, totalNodes: 3 };
    const deletedOverlay = await deriveGraphProductOverlay({
      analyzerBase: base,
      effectiveGraph: deleted,
      previousOverlay: createdOverlay,
      revision: 2,
      updatedAt: "2026-07-19T02:00:00.000Z",
      analyzerEvidenceStale: true,
    });
    expect(deletedOverlay.createdNodes).toEqual([]);
    expect(deletedOverlay.tombstoneNodeIds).toEqual(expect.arrayContaining(["code_a", "code_product"]));

    const reanalyzed = structuredClone(base);
    const resurrected = reanalyzed.nodes.find((node) => node.id === "code_a")!;
    resurrected.id = "code_product";
    resurrected.linkedFiles = [];
    reanalyzed.nodes.find((node) => node.id === "component_a")!.children = ["code_product"];
    reanalyzed.fileIndex = [];
    expect(composeProjectGraph(reanalyzed, deletedOverlay).nodes.some(
      (node) => node.id === "code_product",
    )).toBe(false);
  });

  it("rejects dangling overlay references and project mismatches", async () => {
    const base = makeGraph();
    const overlay = await deriveGraphProductOverlay({
      analyzerBase: base,
      effectiveGraph: makeProductGraph(base),
      revision: 1,
      updatedAt: "2026-07-19T01:00:00.000Z",
      analyzerEvidenceStale: false,
    });
    const dangling: GraphProductOverlay = {
      ...overlay,
      nodeProductOverrides: [{ nodeId: "missing", fields: { name: "Missing" } }],
    };
    expect(() => composeProjectGraph(base, dangling)).toThrowError(
      expect.objectContaining<Partial<GraphProvenanceError>>({ code: "dangling_overlay_reference" }),
    );
    expect(() => composeProjectGraph(base, { ...overlay, projectId: "other" })).toThrowError(
      expect.objectContaining<Partial<GraphProvenanceError>>({ code: "project_mismatch" }),
    );
  });

  it("keeps structural revision separate from analyzer evidence freshness", async () => {
    const base = makeGraph();
    const overlay = await deriveGraphProductOverlay({
      analyzerBase: base,
      effectiveGraph: makeProductGraph(base),
      revision: 7,
      updatedAt: "2026-07-19T03:00:00.000Z",
      analyzerEvidenceStale: true,
    });
    expect(overlay.structuralRevision).toMatchObject({ revision: 7, updatedAt: "2026-07-19T03:00:00.000Z" });
    expect(overlay.analyzerEvidence).toMatchObject({
      stale: true,
      staleSince: "2026-07-19T03:00:00.000Z",
      lastAnalyzedAt: base.analyzedAt,
    });
    expect(GraphProductOverlaySchema.safeParse({
      ...overlay,
      analyzerEvidence: { ...overlay.analyzerEvidence, stale: false },
    }).success).toBe(false);

    const reanalyzed = structuredClone(base);
    reanalyzed.analyzedAt = "2026-07-20T00:00:00.000Z";
    reanalyzed.nodes[0]!.description = "fresh evidence";
    const freshness = await resolveHybridGraphFreshness(reanalyzed, {
      ...overlay,
      analyzerEvidence: {
        ...overlay.analyzerEvidence,
        stale: false,
        staleSince: undefined,
      },
    });
    expect(freshness).toMatchObject({
      stale: true,
      structuralRevision: { revision: 7 },
      analyzerEvidence: { stale: true, lastAnalyzedAt: reanalyzed.analyzedAt },
    });
  });
});

function makeProductGraph(base: ProjectGraph): ProjectGraph {
  const graph = structuredClone(base);
  const component = graph.nodes.find((node) => node.id === "component_a")!;
  component.summary = "Product-owned summary";
  component.children = ["code_product"];
  graph.nodes = graph.nodes.filter((node) => node.id !== "code_a");
  graph.nodes.push({
    ...makeNode("code_product", "code", "code_element", "component_a", []),
    linkedFiles: [{ path: "src/product.ts", role: "primary" }],
  });
  graph.fileIndex = [{
    path: "src/product.ts",
    type: "component",
    nodeIds: ["code_product"],
    imports: [],
    exports: [],
    status: "normal",
  }];
  graph.nodes.find((node) => node.id === "root")!.depth = 0;
  graph.nodes.find((node) => node.id === "container_a")!.depth = 1;
  graph.nodes.find((node) => node.id === "component_a")!.depth = 2;
  graph.nodes.find((node) => node.id === "code_product")!.depth = 3;
  graph.topology = { rootIds: ["root"], maxDepth: 3, totalNodes: 4 };
  return ProjectGraphSchema.parse(graph);
}

function makeGraph(): ProjectGraph {
  return ProjectGraphSchema.parse({
    version: "0.3.0",
    projectId: "project",
    projectName: "Project",
    projectType: "nextjs-app",
    analyzedAt: "2026-07-18T00:00:00.000Z",
    analysisStatus: "complete",
    architecture: {
      notation: "c4",
      defaultLevel: "component",
      layers: [
        { id: "context", label: "Context", order: 0, description: "context" },
        { id: "container", label: "Container", order: 1, description: "container" },
        { id: "component", label: "Component", order: 2, description: "component" },
        { id: "code", label: "Code", order: 3, description: "code" },
      ],
    },
    nodes: [
      makeNode("root", "context", "software_system", null, ["container_a"]),
      makeNode("container_a", "container", "container", "root", ["component_a"]),
      makeNode("component_a", "component", "component", "container_a", ["code_a"]),
      {
        ...makeNode("code_a", "code", "code_element", "component_a", []),
        linkedFiles: [{ path: "src/a.ts", role: "primary" }],
      },
    ],
    edges: [],
    fileRelations: [],
    fileIndex: [{
      path: "src/a.ts",
      type: "component",
      nodeIds: ["code_a"],
      imports: [],
      exports: [],
      status: "normal",
    }],
    topology: { rootIds: ["root"], maxDepth: 3, totalNodes: 4 },
  });
}

function makeNode(
  id: string,
  level: "context" | "container" | "component" | "code",
  elementType: "software_system" | "container" | "component" | "code_element",
  parentId: string | null,
  children: string[],
) {
  return {
    id,
    type: "capability" as const,
    name: id,
    status: "active" as const,
    description: `${id} description`,
    summary: `${id} summary`,
    responsibility: id,
    elementType,
    level,
    layer: level,
    linkedFiles: [],
    upstream: [],
    downstream: [],
    confidence: 1,
    tags: [],
    parentId,
    children,
    refs: [],
    depth: 0,
  };
}
