import { describe, expect, it } from "vitest";

import { AgentRunSchema } from "./agent-run.js";
import { DelegationPlanSchema } from "./delegation-plan.js";
import {
  HierarchyDelegationPlanSchema,
  WholeTreeTransactionPlanSchema,
} from "./hierarchy-delegation.js";

describe("agent delegation contracts", () => {
  it("requires scoped runs and accepts hierarchy metadata", () => {
    const legacy = {
      runId: "run_legacy",
      projectId: "project_demo",
      kind: "feature_change",
      status: "running",
      relatedNodeIds: ["node_login"],
      relatedFiles: [],
      startedAt: "2026-07-19T00:00:00.000Z",
    };
    expect(AgentRunSchema.safeParse(legacy).success).toBe(false);
    expect(AgentRunSchema.safeParse({
      ...legacy,
      runId: "run_child",
      relatedFiles: ["app/login/page.tsx"],
      scope: {
        kind: "leaf-file",
        nodeId: "node_login",
        filePath: "app/login/page.tsx",
      },
      parentRunId: "run_parent",
      rootRunId: "run_parent",
      role: "leaf_file_editor",
    }).success).toBe(true);
    expect(AgentRunSchema.safeParse({
      ...legacy,
      runId: "run_global",
      relatedNodeIds: [],
      scope: { kind: "global" },
      rootRunId: "run_global",
      role: "global",
    }).success).toBe(true);
    expect(AgentRunSchema.safeParse({
      ...legacy,
      runId: "run_container",
      scope: { kind: "container", nodeId: "container_web" },
      parentRunId: "run_context",
      rootRunId: "run_global",
      role: "container_planner",
    }).success).toBe(true);
    expect(AgentRunSchema.safeParse({
      ...legacy,
      runId: "run_bad_planner",
      relatedFiles: ["src/not-authorized.ts"],
      scope: { kind: "component", nodeId: "component_login" },
      role: "node_planner",
    }).success).toBe(false);
    expect(AgentRunSchema.safeParse({
      ...legacy,
      runId: "run_create",
      relatedFiles: ["app/login/login-copy.ts"],
      scope: {
        kind: "leaf-create",
        nodeId: "node_login",
        filePath: "app/login/login-copy.ts",
      },
      parentRunId: "run_parent",
      rootRunId: "run_parent",
      role: "leaf_file_creator",
    }).success).toBe(true);
    expect(AgentRunSchema.safeParse({
      ...legacy,
      runId: "run_create_wrong_role",
      relatedFiles: ["app/login/login-copy.ts"],
      scope: {
        kind: "leaf-create",
        nodeId: "node_login",
        filePath: "app/login/login-copy.ts",
      },
      role: "leaf_file_editor",
    }).success).toBe(false);
    expect(AgentRunSchema.safeParse({
      ...legacy,
      runId: "run_delete",
      relatedFiles: ["app/login/page.tsx"],
      scope: {
        kind: "leaf-delete",
        nodeId: "node_login",
        filePath: "app/login/page.tsx",
      },
      parentRunId: "run_parent",
      rootRunId: "run_parent",
      role: "leaf_file_deleter",
    }).success).toBe(true);
    expect(AgentRunSchema.safeParse({
      ...legacy,
      runId: "run_delete_wrong_role",
      relatedFiles: ["app/login/page.tsx"],
      scope: {
        kind: "leaf-delete",
        nodeId: "node_login",
        filePath: "app/login/page.tsx",
      },
      role: "leaf_file_editor",
    }).success).toBe(false);
  });

  it("accepts only bounded modify-oriented delegation data", () => {
    const plan = DelegationPlanSchema.parse({
      version: "0.1.0",
      planId: "plan_login",
      projectId: "project_demo",
      parentRunId: "run_parent",
      nodeId: "node_login",
      contextBundleHash: `sha256:${"a".repeat(64)}`,
      objective: "Update the login experience",
      tasks: [{
        taskId: "task_1",
        filePath: "app/login/page.tsx",
        objective: "Update the heading",
        acceptanceCriteria: ["The new heading is visible"],
      }],
      rationale: "The selected node owns the login experience.",
    });

    expect(plan.tasks).toHaveLength(1);
    expect(DelegationPlanSchema.safeParse({
      ...plan,
      tasks: [{ ...plan.tasks[0], operation: "delete" }],
    }).success).toBe(true);
    expect(DelegationPlanSchema.safeParse({
      ...plan,
      tasks: [{
        ...plan.tasks[0],
        operation: "create",
        filePath: "app/login/login-copy.ts",
        responsibility: "Own the login page copy constants",
      }],
    }).success).toBe(true);
    expect(DelegationPlanSchema.safeParse({
      ...plan,
      tasks: [{
        ...plan.tasks[0],
        operation: "create",
        filePath: "app/login/login-copy.ts",
      }],
    }).success).toBe(false);

    const impactDelete = {
      ...plan,
      tasks: [
        { ...plan.tasks[0], operation: "delete" as const },
        {
          taskId: "task_1_repair_1",
          filePath: "app/layout.tsx",
          objective: "Remove the direct import",
          acceptanceCriteria: ["No direct import remains"],
        },
      ],
      impactAnalysis: {
        kind: "file_delete" as const,
        scanner: "typescript_javascript_static_imports_v1" as const,
        targetPath: "app/login/page.tsx",
        directImporters: ["app/layout.tsx"],
        reverseTransitiveClosure: ["app/layout.tsx"],
      },
    };
    expect(DelegationPlanSchema.safeParse(impactDelete).success).toBe(true);
    expect(DelegationPlanSchema.safeParse({
      ...impactDelete,
      impactAnalysis: {
        ...impactDelete.impactAnalysis,
        directImporters: ["app/other.tsx"],
      },
    }).success).toBe(false);
    expect(DelegationPlanSchema.safeParse({
      ...impactDelete,
      impactAnalysis: {
        ...impactDelete.impactAnalysis,
        reverseTransitiveClosure: [],
      },
    }).success).toBe(false);
    expect(DelegationPlanSchema.safeParse({
      ...impactDelete,
      tasks: [...impactDelete.tasks, {
        taskId: "task_delete_2",
        filePath: "app/other.tsx",
        operation: "delete",
        objective: "Delete another file",
        acceptanceCriteria: ["Another file is removed"],
      }],
    }).success).toBe(false);
  });

  it("models one graph layer per hierarchy plan and a bounded flattened transaction", () => {
    const plan = HierarchyDelegationPlanSchema.parse({
      version: "0.2.0",
      planId: "plan_global",
      projectId: "project_demo",
      parentRunId: "run_global",
      parentScope: { kind: "global" },
      contextHash: `sha256:${"a".repeat(64)}`,
      objective: "Delegate into the product graph",
      tasks: [{
        taskId: "task_context",
        targetKind: "planner",
        nodeId: "system_product",
        level: "context",
        objective: "Plan the product change",
        acceptanceCriteria: ["The product behavior is updated"],
      }],
      rationale: "The global role delegates to a top-level context node.",
    });
    expect(plan.tasks[0]).toMatchObject({ targetKind: "planner", level: "context" });
    expect(HierarchyDelegationPlanSchema.safeParse({
      ...plan,
      tasks: [{ ...plan.tasks[0], filePath: "src/escape.ts" }],
    }).success).toBe(false);

    const transaction = WholeTreeTransactionPlanSchema.parse({
      version: "0.1.0",
      transactionPlanId: "tree_tx_1",
      projectId: "project_demo",
      rootRunId: "run_global",
      rootContextHash: `sha256:${"b".repeat(64)}`,
      objective: "Apply every delegated leaf together",
      sourcePlanIds: ["plan_global", "plan_component"],
      leaves: [{
        transactionTaskId: "tree_task_1",
        sourcePlanId: "plan_component",
        sourceTaskId: "task_file",
        childRunId: "run_leaf",
        nodeId: "component_login",
        filePath: "app/login/page.tsx",
        objective: "Update login",
        acceptanceCriteria: ["The login heading changes"],
      }],
    });
    expect(transaction.leaves).toHaveLength(1);
  });
});
