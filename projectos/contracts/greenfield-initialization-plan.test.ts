import { describe, expect, it } from "vitest";

import { GreenfieldInitializationPlanSchema } from "./greenfield-initialization-plan.js";

const base = {
  version: "0.1.0" as const,
  planId: "server_plan",
  projectId: "project",
  contextHash: `sha256:${"a".repeat(64)}`,
  initialBaseGraphHash: `sha256:${"b".repeat(64)}`,
  objective: "Initialize the product",
  nodes: [{
    tempRef: "context",
    nodeId: "node_context",
    parentNodeId: null,
    node: { name: "Context", summary: "Context", responsibility: "Own product", level: "context" as const, tags: [] },
    files: [],
  }, {
    tempRef: "container",
    nodeId: "node_container",
    parentNodeId: "node_context",
    node: { name: "Container", summary: "Container", responsibility: "Own runtime", level: "container" as const, tags: [] },
    files: [],
  }, {
    tempRef: "component",
    nodeId: "node_component",
    parentNodeId: "node_container",
    node: { name: "Component", summary: "Component", responsibility: "Own feature", level: "component" as const, tags: [] },
    files: [{
      taskId: "task_file",
      filePath: "src/feature.ts",
      responsibility: "Implement feature",
      objective: "Create feature",
      acceptanceCriteria: ["Feature is exported"],
    }],
  }],
  wiring: [{
    tempRef: "edge",
    edgeId: "edge_server",
    sourceNodeId: "node_component",
    targetNodeId: "node_container",
    relation: "uses" as const,
    label: "Uses runtime",
  }],
  tranches: [{
    trancheId: "tranche_1",
    order: 1,
    dependsOnTrancheId: null,
    nodeIds: ["node_context", "node_container", "node_component"],
    edgeIds: ["edge_server"],
    fileTaskIds: ["task_file"],
  }],
  rationale: "A bounded initial product.",
};

describe("GreenfieldInitializationPlan", () => {
  it("accepts an exact server-owned tranche partition", () => {
    expect(GreenfieldInitializationPlanSchema.parse(base)).toEqual(base);
  });

  it("rejects omitted, duplicated, and out-of-order checkpoint membership", () => {
    expect(GreenfieldInitializationPlanSchema.safeParse({
      ...base,
      tranches: [{ ...base.tranches[0], fileTaskIds: [] }],
    }).success).toBe(false);
    expect(GreenfieldInitializationPlanSchema.safeParse({
      ...base,
      tranches: [{ ...base.tranches[0], nodeIds: ["node_context", "node_context", "node_component"] }],
    }).success).toBe(false);
    expect(GreenfieldInitializationPlanSchema.safeParse({
      ...base,
      tranches: [{ ...base.tranches[0], order: 2 }],
    }).success).toBe(false);
    expect(GreenfieldInitializationPlanSchema.safeParse({
      ...base,
      tranches: [{
        ...base.tranches[0],
        nodeIds: ["node_context", "node_component", "node_container"],
      }],
    }).success).toBe(false);
  });
});
