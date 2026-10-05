import { describe, expect, it } from "vitest";

import { NodeScaffoldPlanSchema } from "./node-scaffold-plan.js";

const base = {
  version: "0.1.0" as const,
  planId: "plan",
  projectId: "project",
  parentRunId: "run",
  parentScope: { kind: "container" as const, nodeId: "container" },
  contextHash: `sha256:${"0".repeat(64)}`,
  baseGraphHash: `sha256:${"1".repeat(64)}`,
  objective: "Add the requested feature",
  newNodeId: "node_server",
  nodeTempRef: "new_node",
  node: {
    name: "New feature",
    summary: "A new feature",
    responsibility: "Own the new feature",
    level: "component" as const,
  },
  wiring: [],
  files: [{
    taskId: "file_1",
    filePath: "src/new.ts",
    responsibility: "Implement the feature",
    objective: "Create the feature module",
    acceptanceCriteria: ["The module exports the feature"],
  }],
  rationale: "The feature needs its own component.",
};

describe("NodeScaffoldPlan", () => {
  it("accepts a bounded component scaffold and rejects orphan nodes", () => {
    expect(NodeScaffoldPlanSchema.parse(base)).toEqual(base);
    expect(NodeScaffoldPlanSchema.safeParse({ ...base, files: [], wiring: [] }).success)
      .toBe(false);
  });

  it("rejects files on a non-component node and duplicate file paths", () => {
    expect(NodeScaffoldPlanSchema.safeParse({
      ...base,
      node: { ...base.node, level: "container" },
    }).success).toBe(false);
    expect(NodeScaffoldPlanSchema.safeParse({
      ...base,
      files: [base.files[0], { ...base.files[0], taskId: "file_2" }],
    }).success).toBe(false);
  });
});
