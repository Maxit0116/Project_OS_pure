import { describe, expect, it } from "vitest";
import graphFixture from "../client/sample-projectos-fixtures/graph.json" with { type: "json" };
import { ProjectGraphSchema } from "../contracts/graph.js";
import type { RequestIntent } from "../contracts/request-intent.js";
import { RequestIntentService, smallestPlannerNode } from "./request-intent-service.js";

const graph = ProjectGraphSchema.parse(graphFixture);

function draft(touches: string[]): RequestIntent {
  return {
    version: "0.1.0",
    id: "intent_1",
    projectId: graph.projectId,
    rawRequest: "Email a receipt after payment succeeds",
    goal: "Send a receipt for a successful payment",
    kind: "change",
    entryNodeId: null,
    touches: touches.map((nodeId) => ({
      nodeId,
      reason: "Required for the receipt flow",
      allow: { editExisting: true, addParts: false, deletePartIds: [] },
    })),
    structuralEffects: [],
    assumptions: [],
    outOfScope: [],
    acceptance: ["A successful payment triggers one receipt"],
    questions: [],
    executorSelection: { kind: "model", modelProfileId: "model_1" },
    baseGraphHash: "sha256:graph",
    revision: 1,
    status: "draft",
  };
}

describe("request intent routing and approval", () => {
  it("routes sibling components to their container and cross-block work to the system", () => {
    expect(smallestPlannerNode(graph, ["feat_checkout", "feat_notifications"])).toBe("container_next_web");
    expect(smallestPlannerNode(graph, ["feat_profile", "container_saas_database"])).toBe("system_saas_starter");
  });

  it("replaces a model-proposed entry with the server-derived routing node", () => {
    const service = new RequestIntentService();
    expect(service.normalizeDraft(graph, { ...draft(["feat_checkout", "feat_notifications"]), entryNodeId: "feat_checkout" }).entryNodeId)
      .toBe("container_next_web");
  });

  it("approves a hash-stable revision and rejects unknown ids or unanswered questions", () => {
    const service = new RequestIntentService();
    const approved = service.approve(graph, draft(["feat_checkout"]), 1);
    expect(approved).toMatchObject({ status: "approved", entryNodeId: "feat_checkout" });
    expect(approved.approvalHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(() => service.normalizeDraft(graph, draft(["missing"]))).toThrow(/unknown node/);
    expect(() => service.approve(graph, {
      ...draft(["feat_checkout"]),
      questions: [{ id: "q1", text: "Which receipt format?" }],
    }, 1)).toThrow(/unanswered/);
  });
});
