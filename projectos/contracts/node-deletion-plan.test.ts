import { describe, expect, it } from "vitest";

import { NodeDeletionPlanSchema } from "./node-deletion-plan.js";

const base = {
  version: "0.1.0" as const,
  planId: "delete_1",
  projectId: "project",
  parentRunId: "run_parent",
  parentScope: { kind: "container" as const, nodeId: "container" },
  contextHash: `sha256:${"1".repeat(64)}`,
  baseGraphHash: `sha256:${"2".repeat(64)}`,
  objective: "Delete an obsolete component",
  rootNodeId: "component",
  mode: "leaf" as const,
  declaredNodeIds: ["component"],
  nodeIds: ["component"],
  ownedFilePaths: ["src/component.ts"],
  impacts: [{
    targetPath: "src/component.ts",
    ownerNodeIds: ["component"],
    directImporters: [],
    reverseTransitiveClosure: [],
  }],
  tasks: [{
    taskId: "delete_owned_1",
    filePath: "src/component.ts",
    operation: "delete" as const,
    objective: "Delete the owned file",
    acceptanceCriteria: ["The file is deleted atomically"],
  }],
  rationale: "The component is obsolete",
};

describe("NodeDeletionPlan", () => {
  it("accepts exact leaf membership and rejects implicit or incomplete deletion", () => {
    expect(NodeDeletionPlanSchema.parse(base)).toEqual(base);
    expect(NodeDeletionPlanSchema.safeParse({
      ...base,
      declaredNodeIds: ["component", "child"],
    }).success).toBe(false);
    expect(NodeDeletionPlanSchema.safeParse({ ...base, impacts: [] }).success).toBe(false);
    expect(NodeDeletionPlanSchema.safeParse({ ...base, tasks: [] }).success).toBe(false);
  });
});
