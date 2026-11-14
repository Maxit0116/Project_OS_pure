import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  acceptLoopGraphEditOffer,
  createLoopGraph,
  dismissLoopGraphEditOffer,
  sendLoopAuthoringTurnAsync,
  setLoopAuthoringCompleteOverride,
  undoLoopDraft,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import {
  buildAuthoringSystemPrompt,
  createLoopbackAuthoringComplete,
  redactAuthoringProviderError,
} from "./loop-goal-authoring-provider.js";

describe("loop authoring provider path (loopback)", () => {
  const roots: string[] = [];

  afterEach(() => {
    setLoopAuthoringCompleteOverride(null);
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "loop-provider-"));
    roots.push(root);
    return root;
  }

  it("system prompt includes response + node field schemas and catalog surfaces", () => {
    const prompt = buildAuthoringSystemPrompt();
    expect(prompt).toMatch(/RESPONSE_SCHEMA/);
    expect(prompt).toMatch(/NODE_FIELDS/);
    expect(prompt).toMatch(/node_patch/);
    expect(prompt).toMatch(/actionIntegration/);
    expect(prompt).toMatch(/gmail/);
    expect(prompt).toMatch(/api=/);
    expect(redactAuthoringProviderError(new Error('["path","Zod raw"]'))).not.toMatch(
      /Zod|path/,
    );
  });

  it("node_patch changes one timeout and preserves sibling id/edge/manual fields", async () => {
    const root = tempRoot();
    let doc = createLoopGraph(root, "proj", "Provider edit");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Ship login",
        nodes: [
          {
            id: "implement",
            title: "Implement",
            prompt: "code",
            type: "agent",
            position: { x: 0, y: 0 },
            timeoutMs: 30_000,
          },
          {
            id: "verify",
            title: "Verify",
            prompt: "test",
            type: "agent",
            position: { x: 200, y: 0 },
            timeoutMs: 10_000,
          },
        ],
        edges: [
          {
            id: "e1",
            source: "implement",
            target: "verify",
            kind: "depends",
          },
        ],
      },
    });

    setLoopAuthoringCompleteOverride(
      createLoopbackAuthoringComplete({
        kind: "node_patch",
        nodeId: "verify",
        patch: { timeoutMs: 2500 },
        summary: "Set verify timeout to 2500ms",
      }),
    );

    doc = await sendLoopAuthoringTurnAsync(root, doc.id, {
      mode: "edit",
      text: "only change verify timeout to 2500",
      selectedNodeId: "verify",
      useProvider: true,
    });
    expect(doc.pendingGraphEditOffer?.proposedDraft).toBeTruthy();
    const proposed = doc.pendingGraphEditOffer!.proposedDraft!;
    expect(proposed.nodes.find((n) => n.id === "verify")?.timeoutMs).toBe(2500);
    expect(proposed.nodes.find((n) => n.id === "implement")?.timeoutMs).toBe(30_000);
    expect(proposed.edges).toHaveLength(1);

    doc = acceptLoopGraphEditOffer(root, doc.id);
    expect(doc.draft.nodes.find((n) => n.id === "verify")?.timeoutMs).toBe(2500);
    expect(doc.draft.nodes.find((n) => n.id === "implement")?.prompt).toBe("code");

    doc = undoLoopDraft(root, doc.id);
    expect(doc.draft.nodes.find((n) => n.id === "verify")?.timeoutMs).toBe(10_000);
  });

  it("applies edge_patch for focused edge transfer text", async () => {
    const root = tempRoot();
    let doc = createLoopGraph(root, "proj", "EdgeFocus");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Ship",
        nodes: [
          {
            id: "a",
            title: "Plan",
            prompt: "plan",
            type: "agent",
            position: { x: 0, y: 0 },
          },
          {
            id: "b",
            title: "Build",
            prompt: "build",
            type: "agent",
            position: { x: 200, y: 0 },
          },
        ],
        edges: [
          {
            id: "e1",
            source: "a",
            target: "b",
            kind: "depends",
            prompt: "",
          },
        ],
      },
    });

    setLoopAuthoringCompleteOverride(
      createLoopbackAuthoringComplete({
        kind: "edge_patch",
        edgeId: "e1",
        patch: {
          prompt: "Pass the approved implementation plan as markdown.",
        },
        summary: "Describe plan→build handoff",
      }),
    );

    doc = await sendLoopAuthoringTurnAsync(root, doc.id, {
      mode: "edit",
      text: "this edge carries the approved plan",
      focus: { type: "edge", id: "e1" },
      useProvider: true,
    });
    expect(
      doc.pendingGraphEditOffer?.proposedDraft?.edges.find((e) => e.id === "e1")
        ?.prompt,
    ).toMatch(/approved implementation plan/i);
    expect(doc.pendingGraphEditOffer?.proposedDraft?.nodes).toHaveLength(2);
  });

  it("rejects node_patch when an edge is focused", async () => {
    const root = tempRoot();
    let doc = createLoopGraph(root, "proj", "EdgeGuard");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Ship",
        nodes: [
          {
            id: "a",
            title: "A",
            prompt: "",
            type: "agent",
            position: { x: 0, y: 0 },
          },
          {
            id: "b",
            title: "B",
            prompt: "",
            type: "agent",
            position: { x: 120, y: 0 },
          },
        ],
        edges: [
          {
            id: "e1",
            source: "a",
            target: "b",
            kind: "depends",
          },
        ],
      },
    });

    setLoopAuthoringCompleteOverride(
      createLoopbackAuthoringComplete({
        kind: "node_patch",
        nodeId: "a",
        patch: { prompt: "should not apply" },
        summary: "wrong target",
      }),
    );

    doc = await sendLoopAuthoringTurnAsync(root, doc.id, {
      mode: "edit",
      text: "rewrite node",
      selectedEdgeId: "e1",
      useProvider: true,
    });
    expect(doc.pendingGraphEditOffer).toBeUndefined();
    expect(doc.authoringThread.at(-1)?.content).toMatch(/edge is focused|edge_patch/i);
  });

  it("rejects unknown connector fields from provider", async () => {
    const root = tempRoot();
    let doc = createLoopGraph(root, "proj", "Reject");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "x",
        nodes: [
          {
            id: "act",
            title: "Notify",
            prompt: "",
            type: "action",
            actionIntegration: "slack",
            actionOperation: "chat_postMessage",
            credentialRefId: "cred_1",
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
    });

    setLoopAuthoringCompleteOverride(
      createLoopbackAuthoringComplete({
        kind: "node_patch",
        nodeId: "act",
        patch: {
          actionIntegration: "not_a_real_vendor" as never,
        },
        summary: "bad",
      }),
    );

    doc = await sendLoopAuthoringTurnAsync(root, doc.id, {
      mode: "edit",
      text: "switch to fake connector",
      useProvider: true,
    });
    expect(doc.pendingGraphEditOffer).toBeUndefined();
    expect(doc.authoringThread.at(-1)?.content).toMatch(/Reject/i);
  });

  it("clarify when provider asks; dismiss leaves draft untouched", async () => {
    const root = tempRoot();
    let doc = createLoopGraph(root, "proj", "Clarify");
    setLoopAuthoringCompleteOverride(
      createLoopbackAuthoringComplete({
        kind: "clarify",
        openQuestions: [{ question: "Which repo?" }],
        assistantMessage: "Need the repository name.",
      }),
    );
    doc = await sendLoopAuthoringTurnAsync(root, doc.id, {
      mode: "ask",
      text: "Ship a PR",
      useProvider: true,
    });
    expect(doc.draftGoalContext?.openQuestions[0]?.question).toMatch(/repo/i);

    setLoopAuthoringCompleteOverride(
      createLoopbackAuthoringComplete({
        kind: "graph",
        summary: "skeleton",
        draft: {
          revision: 2,
          graphPrompt: "Ship a PR",
          nodes: [
            {
              id: "n1",
              title: "Implement",
              prompt: "do",
              type: "agent",
              position: { x: 0, y: 0 },
            },
          ],
          edges: [],
        },
      }),
    );
    // Still blocked by unanswered clarify on ask — use edit for offer.
    doc = await sendLoopAuthoringTurnAsync(root, doc.id, {
      mode: "edit",
      text: "create skeleton",
      useProvider: true,
    });
    const before = doc.draft.nodes.length;
    expect(doc.pendingGraphEditOffer?.proposedDraft?.nodes.length).toBe(1);
    doc = dismissLoopGraphEditOffer(root, doc.id);
    expect(doc.pendingGraphEditOffer).toBeUndefined();
    expect(doc.draft.nodes).toHaveLength(before);
  });

  it("stale accept rejected after manual revision bump", async () => {
    const root = tempRoot();
    let doc = createLoopGraph(root, "proj", "Stale");
    setLoopAuthoringCompleteOverride(
      createLoopbackAuthoringComplete({
        kind: "node_patch",
        nodeId: "missing",
        patch: { title: "x" },
        summary: "will fail id",
      }),
    );
    // First seed a real offer via graph kind
    setLoopAuthoringCompleteOverride(
      createLoopbackAuthoringComplete({
        kind: "graph",
        summary: "add node",
        draft: {
          revision: 1,
          graphPrompt: "g",
          nodes: [
            {
              id: "only",
              title: "Only",
              prompt: "",
              type: "logic",
              logicKind: "retry",
              retryLimit: 1,
              position: { x: 0, y: 0 },
            },
          ],
          edges: [],
        },
      }),
    );
    doc = await sendLoopAuthoringTurnAsync(root, doc.id, {
      mode: "edit",
      text: "add retry",
      useProvider: true,
    });
    expect(doc.pendingGraphEditOffer?.baseRevision).toBe(doc.draft.revision);

    // Manual bump
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        ...doc.draft,
        revision: doc.draft.revision + 1,
        nodes: [
          ...doc.draft.nodes,
          {
            id: "manual",
            title: "Manual",
            prompt: "",
            type: "human",
            humanMode: "approval",
            humanAssignee: "alice",
            position: { x: 40, y: 40 },
          },
        ],
      },
    });

    expect(() => acceptLoopGraphEditOffer(root, doc.id)).toThrow(/stale/i);
  });
});
