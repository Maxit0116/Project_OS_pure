import { describe, expect, it } from "vitest";

import {
  insertApprovalGate,
  validateApprovalGateWiring,
} from "./loop-approval-insert.js";
import type { IntentGraph } from "../contracts/loop-graph.js";

function baseDraft(): IntentGraph {
  return {
    revision: 1,
    graphPrompt: "ship",
    nodes: [
      {
        id: "n_coder",
        title: "Coder",
        prompt: "impl",
        type: "agent",
        agentRole: "coder",
        position: { x: 0, y: 0 },
      },
      {
        id: "n_test",
        title: "Run Tests",
        prompt: "test",
        type: "action",
        actionIntegration: "test",
        actionOperation: "run",
        position: { x: 0, y: 120 },
      },
      {
        id: "n_pr",
        title: "Create PR",
        prompt: "pr",
        type: "action",
        actionIntegration: "github",
        actionOperation: "create_pr",
        position: { x: 0, y: 240 },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n_coder",
        target: "n_test",
        kind: "depends",
        prompt: "test after",
      },
      {
        id: "e2",
        source: "n_test",
        target: "n_pr",
        kind: "depends",
        prompt: "pr after",
      },
    ],
  };
}

describe("insertApprovalGate", () => {
  it("before_test (default) rewires coder→test and preserves other edge ids", () => {
    const next = insertApprovalGate(baseDraft(), {
      afterNodeId: "n_coder",
      approvalNodeId: "n_loopback_approval",
    });
    expect(next.nodes.some((n) => n.id === "n_loopback_approval")).toBe(true);
    const edgeIds = next.edges.map((e) => e.id).sort();
    expect(edgeIds).toContain("e1");
    expect(edgeIds).toContain("e2");
    expect(edgeIds).toContain("e_appr_e1");
    const e1 = next.edges.find((e) => e.id === "e1")!;
    expect(e1.source).toBe("n_coder");
    expect(e1.target).toBe("n_loopback_approval");
    const appr = next.edges.find((e) => e.id === "e_appr_e1")!;
    expect(appr.source).toBe("n_loopback_approval");
    expect(appr.target).toBe("n_test");
    // Original e2 untouched
    expect(next.edges.find((e) => e.id === "e2")).toMatchObject({
      source: "n_test",
      target: "n_pr",
    });
    expect(validateApprovalGateWiring(next).filter((i) => i.code === "approval_orphaned")).toEqual(
      [],
    );
  });

  it("flags orphan approval with no edges", () => {
    const draft = baseDraft();
    draft.nodes.push({
      id: "n_orphan",
      title: "Orphan",
      prompt: "x",
      type: "human",
      humanMode: "approval",
      position: { x: 1, y: 1 },
    });
    const issues = validateApprovalGateWiring(draft);
    expect(issues.some((i) => i.code === "approval_orphaned")).toBe(true);
  });
});
