import { describe, expect, it } from "vitest";

import type { ProjectGraph } from "../contracts/graph.js";
import { ProjectOSError } from "../errors.js";
import {
  assertPersistableProjectGraph,
  collectPersistableGraphErrors,
} from "./persistable-graph.js";

function baseGraph(overrides?: Partial<ProjectGraph>): ProjectGraph {
  return {
    version: "0.5.0",
    projectId: "p1",
    projectName: "Demo",
    projectType: "node",
    analyzedAt: new Date().toISOString(),
    analysisStatus: "complete",
    architecture: {
      notation: "c4",
      defaultLevel: "component",
      layers: [
        { id: "experience", label: "Experience", order: 0, description: "Users" },
        { id: "application", label: "Application", order: 1, description: "Core" },
        { id: "infrastructure", label: "Infrastructure", order: 2, description: "Platform" },
      ],
    },
    nodes: [
      {
        id: "a",
        type: "capability",
        name: "A",
        status: "active",
        description: "A",
        summary: "A",
        responsibility: "A",
        level: "container",
        elementType: "container",
        layer: "application",
        linkedFiles: [],
        upstream: [],
        downstream: ["b"],
        confidence: 0.8,
        tags: [],
        children: ["b"],
      },
      {
        id: "b",
        type: "capability",
        name: "B",
        status: "active",
        description: "B",
        summary: "B",
        responsibility: "B",
        level: "component",
        elementType: "component",
        layer: "application",
        linkedFiles: [],
        upstream: ["a"],
        downstream: [],
        confidence: 0.8,
        tags: [],
        parentId: "a",
        children: [],
      },
    ],
    edges: [
      {
        id: "edge_ok",
        source: "a",
        target: "b",
        relation: "calls",
        label: "A calls B",
        evidence: "src/app.ts",
        confidence: 0.9,
      },
    ],
    fileIndex: [],
    topology: { rootIds: ["a"], maxDepth: 2, totalNodes: 2 },
    analysisError: null,
    ...overrides,
  };
}

describe("persistable-graph", () => {
  it("accepts a topologically valid graph", () => {
    expect(collectPersistableGraphErrors(baseGraph())).toEqual([]);
    expect(() => assertPersistableProjectGraph(baseGraph())).not.toThrow();
  });

  it("rejects empty / dangling / self-loop edges before write", () => {
    const graph = baseGraph({
      edges: [
        {
          id: "edge_api_engine",
          source: "",
          target: "",
          relation: "depends_on",
          confidence: 0.7,
        },
      ],
    });
    const errors = collectPersistableGraphErrors(graph);
    expect(errors.length).toBeGreaterThan(0);
    expect(() => assertPersistableProjectGraph(graph)).toThrowError(
      expect.objectContaining({
        code: "agent_orchestration_failed",
        name: "ProjectOSError",
      }),
    );
    try {
      assertPersistableProjectGraph(graph);
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectOSError);
      expect((error as ProjectOSError).message).toContain("not persistable");
    }
  });
});
