import { describe, expect, it } from "vitest";
import type { ProjectGraph } from "../contracts/graph.js";
import { diffStructureGraphs } from "./structure-graph-diff.js";

function graph(partial: Partial<ProjectGraph> & Pick<ProjectGraph, "nodes" | "edges">): ProjectGraph {
  return {
    version: "0.5.0",
    projectId: "p1",
    projectName: "P",
    projectType: "node",
    analyzedAt: new Date().toISOString(),
    analysisStatus: "complete",
    architecture: {
      notation: "c4",
      defaultLevel: "context",
      layers: [
        { id: "application", label: "App", order: 0, description: "App" },
      ],
    },
    fileIndex: [],
    views: [
      { key: "view_context", title: "Context", level: "context", sourceKind: "ai" },
    ],
    ...partial,
  };
}

describe("diffStructureGraphs", () => {
  it("reports added/removed/changed nodes and affected views", () => {
    const from = graph({
      nodes: [
        {
          id: "a",
          type: "capability",
          name: "A",
          status: "active",
          description: "A",
          summary: "A",
          responsibility: "A",
          elementType: "software_system",
          level: "context",
          layer: "application",
          linkedFiles: [],
          upstream: [],
          downstream: [],
          confidence: 1,
          tags: [],
        },
      ],
      edges: [],
    });
    const to = graph({
      nodes: [
        {
          id: "a",
          type: "capability",
          name: "A renamed",
          status: "active",
          description: "A",
          summary: "A",
          responsibility: "A",
          elementType: "software_system",
          level: "context",
          layer: "application",
          linkedFiles: [],
          upstream: [],
          downstream: [],
          confidence: 1,
          tags: [],
        },
        {
          id: "b",
          type: "capability",
          name: "B",
          status: "active",
          description: "B",
          summary: "B",
          responsibility: "B",
          elementType: "person",
          level: "context",
          layer: "application",
          linkedFiles: [],
          upstream: [],
          downstream: [],
          confidence: 1,
          tags: [],
        },
      ],
      edges: [
        {
          id: "e1",
          source: "b",
          target: "a",
          relation: "uses",
          label: "Uses",
          confidence: 1,
          evidence: "x",
        },
      ],
    });
    const diff = diffStructureGraphs(from, to);
    expect(diff.nodes.added).toEqual(["b"]);
    expect(diff.nodes.changed).toEqual(["a"]);
    expect(diff.edges.added).toEqual(["e1"]);
    expect(diff.views.affected).toContain("view_context");
  });
});
