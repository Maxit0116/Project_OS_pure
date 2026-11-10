import { describe, expect, it } from "vitest";
import {
  applyIntentNodePatch,
  mergePreservingUntargeted,
  validateLoopNodeConfig,
} from "./loop-node-config-schema.js";
import type { IntentGraph, IntentGraphNode } from "../contracts/loop-graph.js";

function node(partial: Partial<IntentGraphNode> & Pick<IntentGraphNode, "id">): IntentGraphNode {
  return {
    title: partial.title ?? "Node",
    prompt: partial.prompt ?? "",
    position: partial.position ?? { x: 0, y: 0 },
    ...partial,
  };
}

function draft(nodes: IntentGraphNode[], edges: IntentGraph["edges"] = []): IntentGraph {
  return { revision: 1, graphPrompt: "g", nodes, edges };
}

describe("loop-node-config-schema", () => {
  it("rejects unknown connector and blocks run without credential", () => {
    const action = node({
      id: "n1",
      type: "action",
      actionIntegration: "slack",
      actionOperation: "chat_postMessage",
    });
    const result = validateLoopNodeConfig(action);
    expect(result.ok).toBe(false);
    expect(result.blocksRun).toBe(true);
    expect(result.issues.some((i) => i.code === "credential_missing")).toBe(true);

    const badOp = node({
      id: "n2",
      type: "action",
      actionIntegration: "sentry",
      actionOperation: "delete_everything",
      credentialRefId: "cred_x",
    });
    expect(
      validateLoopNodeConfig(badOp).issues.some((i) => i.code === "unknown_capability"),
    ).toBe(true);
  });

  it("applies local patch preserving unrelated fields and ids", () => {
    const base = draft([
      node({
        id: "a",
        type: "logic",
        logicKind: "retry",
        retryLimit: 1,
        title: "Retry",
        prompt: "keep me",
      }),
      node({ id: "b", type: "agent", title: "Coder", prompt: "impl" }),
    ], [{ id: "e1", source: "a", target: "b", kind: "depends" }]);

    const applied = applyIntentNodePatch(base, "a", { retryLimit: 2 });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.draft.nodes[0]?.id).toBe("a");
    expect(applied.draft.nodes[0]?.retryLimit).toBe(2);
    expect(applied.draft.nodes[0]?.prompt).toBe("keep me");
    expect(applied.draft.nodes[1]?.title).toBe("Coder");
    expect(applied.draft.edges).toHaveLength(1);
    expect(applied.draft.revision).toBe(2);
  });

  it("mergePreservingUntargeted keeps non-target ids/edges", () => {
    const base = draft([
      node({ id: "keep", title: "Keep", prompt: "manual", timeoutMs: 9000 }),
      node({ id: "edit", title: "Edit", prompt: "old", timeoutMs: 1000 }),
    ], [{ id: "e1", source: "keep", target: "edit", kind: "depends" }]);
    const proposed = draft([
      node({ id: "edit", title: "Edit", prompt: "old", timeoutMs: 5000 }),
      node({ id: "new", title: "New", prompt: "x" }),
    ], [{ id: "e2", source: "edit", target: "new", kind: "depends" }]);
    const merged = mergePreservingUntargeted(base, proposed, ["edit"]);
    expect(merged.nodes.find((n) => n.id === "keep")?.timeoutMs).toBe(9000);
    expect(merged.nodes.find((n) => n.id === "edit")?.timeoutMs).toBe(5000);
    expect(merged.edges.some((e) => e.source === "keep" && e.target === "edit")).toBe(
      true,
    );
  });
});
