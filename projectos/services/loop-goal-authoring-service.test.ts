import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  acceptLoopGraphEditOffer,
  cancelLoopGoalClarification,
  confirmLoopGoalContext,
  createLoopGraph,
  dismissLoopGraphEditOffer,
  sendLoopAuthoringTurn,
  undoLoopDraft,
  answerLoopGoalClarification,
} from "./loop-graph-service.js";

describe("loop goal authoring + edit orchestration", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "loop-authoring-"));
    roots.push(root);
    return root;
  }

  it("Ask → clarify → confirm → offer → skeleton → undo", () => {
    const root = tempRoot();
    let doc = createLoopGraph(root, "proj", "Login");
    doc = sendLoopAuthoringTurn(root, doc.id, {
      mode: "ask",
      text: "Ship login",
    });
    expect(doc.draftGoalContext?.goal).toContain("Ship login");
    expect(doc.draftGoalContext?.openQuestions.length).toBeGreaterThan(0);
    expect(doc.draft.nodes).toHaveLength(0);

    const answers = (doc.draftGoalContext?.openQuestions ?? []).map((q) => ({
      questionId: q.id,
      answer: q.options?.[0] ?? "Manual review OK",
    }));
    doc = answerLoopGoalClarification(root, doc.id, answers);
    expect(doc.draftGoalContext?.openQuestions.every((q) => q.answer)).toBe(true);

    doc = confirmLoopGoalContext(root, doc.id);
    expect(doc.confirmedGoalContext?.status).toBe("confirmed");
    expect(doc.pendingGraphEditOffer).toBeTruthy();
    expect(doc.draft.graphPrompt).toContain("Ship login");

    doc = acceptLoopGraphEditOffer(root, doc.id);
    expect(doc.draft.nodes.length).toBeGreaterThanOrEqual(2);
    expect(doc.pendingGraphEditOffer).toBeUndefined();
    expect(doc.draftHistory.length).toBe(1);

    const nodeCount = doc.draft.nodes.length;
    doc = undoLoopDraft(root, doc.id);
    expect(doc.draft.nodes).toHaveLength(0);
    expect(doc.draftHistory).toHaveLength(0);
    expect(nodeCount).toBeGreaterThan(0);
  });

  it("cancels clarifying questions and rolls back the Ask turn", () => {
    const root = tempRoot();
    let doc = createLoopGraph(root, "proj", "Cancel clarify");
    doc = sendLoopAuthoringTurn(root, doc.id, {
      mode: "ask",
      text: "Ship login",
    });
    expect(doc.draftGoalContext?.openQuestions.some((q) => !q.answer)).toBe(true);
    expect(doc.authoringThread.length).toBeGreaterThanOrEqual(2);

    doc = cancelLoopGoalClarification(root, doc.id);
    expect(doc.draftGoalContext).toBeUndefined();
    expect(doc.authoringThread).toHaveLength(0);
    expect(doc.authoringTrace.status).toBe("idle");
  });

  it("dismisses graph edit offer without changing the draft", () => {
    const root = tempRoot();
    let doc = createLoopGraph(root, "proj", "X");
    doc = sendLoopAuthoringTurn(root, doc.id, {
      mode: "ask",
      text: "Implement OAuth with constraint: No schema change and done when: Tests pass",
    });
    // Long enough + keywords may skip clarification — answer if present
    if (doc.draftGoalContext?.openQuestions.some((q) => !q.answer)) {
      doc = answerLoopGoalClarification(
        root,
        doc.id,
        doc.draftGoalContext.openQuestions.map((q) => ({
          questionId: q.id,
          answer: "ok",
        })),
      );
    }
    doc = confirmLoopGoalContext(root, doc.id);
    doc = dismissLoopGraphEditOffer(root, doc.id);
    expect(doc.pendingGraphEditOffer).toBeUndefined();
    expect(doc.draft.nodes).toHaveLength(0);
  });

  it("Edit mode patches the graph and supports undo", () => {
    const root = tempRoot();
    let doc = createLoopGraph(root, "proj", "Edit");
    doc = sendLoopAuthoringTurn(root, doc.id, {
      mode: "edit",
      text: "Create a skeleton for shipping login",
    });
    expect(doc.draft.nodes.length).toBeGreaterThanOrEqual(2);
    const afterSkeleton = doc.draft.nodes.length;
    doc = sendLoopAuthoringTurn(root, doc.id, {
      mode: "edit",
      text: "add verify",
    });
    expect(doc.draft.nodes.length).toBeGreaterThan(afterSkeleton);
    doc = undoLoopDraft(root, doc.id);
    expect(doc.draft.nodes).toHaveLength(afterSkeleton);
  });
});
