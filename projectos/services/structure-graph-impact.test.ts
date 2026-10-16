import { describe, expect, it } from "vitest";
import type { ProjectGraph } from "../contracts/graph.js";
import { impactStructureGraph } from "./structure-graph-impact.js";

describe("impactStructureGraph", () => {
  it("returns dependents, dependencies, and views", () => {
    const graph: ProjectGraph = {
      version: "0.5.0",
      projectId: "p1",
      projectName: "P",
      projectType: "node",
      analyzedAt: new Date().toISOString(),
      analysisStatus: "complete",
      architecture: {
        notation: "c4",
        defaultLevel: "container",
        layers: [
          { id: "application", label: "App", order: 0, description: "App" },
        ],
      },
      views: [
        {
          key: "view_container_sys",
          title: "Containers",
          level: "container",
          parentId: "sys",
        },
      ],
      nodes: [
        {
          id: "sys",
          type: "capability",
          name: "Sys",
          status: "active",
          description: "Sys",
          summary: "Sys",
          responsibility: "Sys",
          elementType: "software_system",
          level: "context",
          layer: "application",
          linkedFiles: [],
          upstream: [],
          downstream: ["api"],
          confidence: 1,
          tags: [],
          children: ["api"],
        },
        {
          id: "api",
          type: "capability",
          name: "API",
          status: "active",
          description: "API",
          summary: "API",
          responsibility: "API",
          elementType: "container",
          level: "container",
          layer: "application",
          technology: "Node",
          linkedFiles: [],
          upstream: ["sys"],
          downstream: ["db"],
          confidence: 1,
          tags: [],
          parentId: "sys",
          children: [],
        },
        {
          id: "db",
          type: "capability",
          name: "DB",
          status: "active",
          description: "DB",
          summary: "DB",
          responsibility: "DB",
          elementType: "data_store",
          level: "container",
          layer: "application",
          technology: "Postgres",
          linkedFiles: [],
          upstream: ["api"],
          downstream: [],
          confidence: 1,
          tags: [],
          parentId: "sys",
          children: [],
        },
      ],
      edges: [
        {
          id: "e1",
          source: "api",
          target: "db",
          relation: "reads_from",
          label: "Reads",
          confidence: 1,
          evidence: "orm",
        },
      ],
      fileIndex: [],
    };

    const impact = impactStructureGraph(graph, "api", { depth: 2 });
    expect(impact.dependencies.some((item) => item.id === "db")).toBe(true);
    expect(impact.views).toContain("view_container_sys");
  });
});
