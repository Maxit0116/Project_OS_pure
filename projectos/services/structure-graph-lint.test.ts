import { describe, expect, it } from "vitest";
import type { ProjectGraph } from "../contracts/graph.js";
import { lintStructureGraph } from "./structure-graph-lint.js";

function minimalGraph(overrides: Partial<ProjectGraph> = {}): ProjectGraph {
  return {
    version: "0.5.0",
    projectId: "p1",
    projectName: "P1",
    projectType: "nextjs",
    analyzedAt: new Date().toISOString(),
    analysisStatus: "complete",
    architecture: {
      notation: "c4",
      defaultLevel: "container",
      layers: [
        {
          id: "application",
          label: "Application",
          order: 0,
          description: "App",
        },
      ],
    },
    nodes: [
      {
        id: "system",
        type: "capability",
        name: "System",
        status: "active",
        description: "Main system",
        summary: "Main system",
        responsibility: "Owns product",
        elementType: "software_system",
        level: "context",
        layer: "application",
        linkedFiles: [],
        upstream: [],
        downstream: ["web"],
        confidence: 1,
        tags: [],
        children: ["web"],
      },
      {
        id: "web",
        type: "capability",
        name: "Web",
        status: "active",
        description: "Web app",
        summary: "Web app",
        responsibility: "UI",
        elementType: "container",
        level: "container",
        layer: "application",
        technology: "Next.js",
        linkedFiles: [],
        upstream: ["system"],
        downstream: [],
        confidence: 1,
        tags: [],
        parentId: "system",
        children: [],
      },
      {
        id: "orphan",
        type: "capability",
        name: "Orphan",
        status: "active",
        description: "",
        summary: "",
        responsibility: "Unused",
        elementType: "component",
        level: "component",
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
        source: "system",
        target: "web",
        relation: "uses",
        label: "Contains",
        confidence: 1,
        evidence: "parent",
      },
    ],
    fileIndex: [],
    ...overrides,
  };
}

describe("lintStructureGraph", () => {
  it("flags orphan nodes, missing descriptions, and components without files", () => {
    const result = lintStructureGraph(minimalGraph());
    const codes = result.findings.map((finding) => finding.code);
    expect(codes).toContain("orphan-node");
    expect(codes).toContain("missing-description");
    expect(codes).toContain("component-without-files");
    expect(result.ok).toBe(false);
  });

  it("flags duplicate relationships", () => {
    const graph = minimalGraph({
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
          downstream: ["b"],
          confidence: 1,
          tags: [],
          children: [],
        },
        {
          id: "b",
          type: "capability",
          name: "B",
          status: "active",
          description: "B",
          summary: "B",
          responsibility: "B",
          elementType: "external_system",
          level: "context",
          layer: "application",
          technology: "HTTP",
          linkedFiles: [],
          upstream: ["a"],
          downstream: [],
          confidence: 1,
          tags: [],
          children: [],
        },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          target: "b",
          relation: "uses",
          label: "Uses",
          confidence: 1,
          evidence: "x",
        },
        {
          id: "e2",
          source: "a",
          target: "b",
          relation: "uses",
          label: "Uses",
          confidence: 1,
          evidence: "y",
        },
      ],
    });
    expect(
      lintStructureGraph(graph).findings.some(
        (finding) => finding.code === "duplicate-relationship",
      ),
    ).toBe(true);
  });
});
