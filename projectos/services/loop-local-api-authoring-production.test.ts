/**
 * Production LocalApi authoring entry — loopback complete via same sendLoopAuthoringTurn.
 * No user key files / no paid live calls.
 */
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createLoopbackAuthoringComplete } from "./loop-goal-authoring-provider.js";
import { getLoopGraph, upsertLoopGraph } from "./loop-graph-service.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");

function copySampleWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "loop-localapi-authoring-"));
  cpSync(sampleWorkspaceRoot, root, { recursive: true });
  return root;
}

describe("ProjectOSLocalApi sendLoopAuthoringTurn (production entry + loopback)", () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("continuous: gen → retry2 → node timeout patch → approval; Accept/Dismiss/Undo/stale/reopen", async () => {
    const sample = copySampleWorkspace();
    roots.push(sample);
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: sample });
    const project = await api.openSampleWorkspace();
    const workspaceRoot = (
      api as unknown as {
        requireLoadedWorkspace: (id: string) => { workspaceRoot: string };
      }
    ).requireLoadedWorkspace(project.projectId).workspaceRoot;

    let doc = await api.createLoopGraph(project.projectId, "Authoring continuous");
    doc = upsertLoopGraph(workspaceRoot, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Ship login fix",
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
          {
            id: "approve",
            title: "Approve",
            prompt: "",
            type: "human",
            humanMode: "approval",
            humanAssignee: "alice",
            position: { x: 400, y: 0 },
          },
        ],
        edges: [
          { id: "e1", source: "implement", target: "verify", kind: "depends" },
          { id: "e2", source: "verify", target: "approve", kind: "depends" },
        ],
      },
    });

    // Missing provider → honest failure (no silent heuristic).
    await expect(
      api.sendLoopAuthoringTurn(project.projectId, doc.id, {
        mode: "edit",
        text: "change verify timeout",
        useProvider: true,
        selectedNodeId: "verify",
      }),
    ).rejects.toMatchObject({ code: "model_connection_failed" });

    // Gen skeleton via loopback (production entry).
    await api.setLoopAuthoringCompleteOverride(
      createLoopbackAuthoringComplete({
        kind: "graph",
        summary: "skeleton with retry",
        draft: {
          revision: 2,
          graphPrompt: "Ship login fix",
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
              id: "retry2",
              title: "Retry",
              prompt: "",
              type: "logic",
              logicKind: "retry",
              retryLimit: 2,
              position: { x: 100, y: 80 },
            },
            {
              id: "verify",
              title: "Verify",
              prompt: "test",
              type: "agent",
              position: { x: 200, y: 0 },
              timeoutMs: 10_000,
            },
            {
              id: "approve",
              title: "Approve",
              prompt: "",
              type: "human",
              humanMode: "approval",
              humanAssignee: "alice",
              position: { x: 400, y: 0 },
            },
          ],
          edges: [
            { id: "e1", source: "implement", target: "retry2", kind: "depends" },
            { id: "e2", source: "retry2", target: "verify", kind: "depends" },
            { id: "e3", source: "verify", target: "approve", kind: "depends" },
          ],
        },
      }),
    );

    doc = await api.sendLoopAuthoringTurn(project.projectId, doc.id, {
      mode: "edit",
      text: "add manual retry 2",
      useProvider: true,
    });
    expect(doc.pendingGraphEditOffer?.proposedDraft?.nodes.some((n) => n.id === "retry2")).toBe(
      true,
    );
    // Does not auto-execute.
    expect(doc.draft.nodes.some((n) => n.id === "retry2")).toBe(false);

    doc = await api.acceptLoopGraphEditOffer(project.projectId, doc.id);
    expect(doc.draft.nodes.find((n) => n.id === "retry2")?.retryLimit).toBe(2);
    expect(doc.draft.nodes.find((n) => n.id === "approve")?.humanAssignee).toBe("alice");

    // Only change verify timeout — preserve sibling ids/edges/manual fields.
    await api.setLoopAuthoringCompleteOverride(
      createLoopbackAuthoringComplete({
        kind: "node_patch",
        nodeId: "verify",
        patch: { timeoutMs: 2500 },
        summary: "verify timeout 2500",
      }),
    );
    doc = await api.sendLoopAuthoringTurn(project.projectId, doc.id, {
      mode: "edit",
      text: "only change verify timeout to 2500",
      selectedNodeId: "verify",
      useProvider: true,
    });
    const proposed = doc.pendingGraphEditOffer!.proposedDraft!;
    expect(proposed.nodes.find((n) => n.id === "verify")?.timeoutMs).toBe(2500);
    expect(proposed.nodes.find((n) => n.id === "implement")?.timeoutMs).toBe(30_000);
    expect(proposed.nodes.find((n) => n.id === "approve")?.humanAssignee).toBe("alice");

    doc = await api.dismissLoopGraphEditOffer(project.projectId, doc.id);
    expect(doc.pendingGraphEditOffer).toBeUndefined();
    expect(doc.draft.nodes.find((n) => n.id === "verify")?.timeoutMs).toBe(10_000);

    // Re-offer and Accept, then Undo.
    await api.setLoopAuthoringCompleteOverride(
      createLoopbackAuthoringComplete({
        kind: "node_patch",
        nodeId: "verify",
        patch: { timeoutMs: 2500 },
        summary: "verify timeout 2500",
      }),
    );
    doc = await api.sendLoopAuthoringTurn(project.projectId, doc.id, {
      mode: "edit",
      text: "timeout again",
      selectedNodeId: "verify",
      useProvider: true,
    });
    doc = await api.acceptLoopGraphEditOffer(project.projectId, doc.id);
    expect(doc.draft.nodes.find((n) => n.id === "verify")?.timeoutMs).toBe(2500);
    doc = await api.undoLoopDraft(project.projectId, doc.id);
    expect(doc.draft.nodes.find((n) => n.id === "verify")?.timeoutMs).toBe(10_000);

    // Stale accept after manual revision bump.
    await api.setLoopAuthoringCompleteOverride(
      createLoopbackAuthoringComplete({
        kind: "node_patch",
        nodeId: "verify",
        patch: { timeoutMs: 9000 },
        summary: "will go stale",
      }),
    );
    doc = await api.sendLoopAuthoringTurn(project.projectId, doc.id, {
      mode: "edit",
      text: "set 9000",
      selectedNodeId: "verify",
      useProvider: true,
    });
    upsertLoopGraph(workspaceRoot, {
      ...doc,
      draft: {
        ...doc.draft,
        revision: doc.draft.revision + 1,
      },
    });
    await expect(
      api.acceptLoopGraphEditOffer(project.projectId, doc.id),
    ).rejects.toThrow(/stale/i);

    // Save / reopen via getLoopGraph — durable disk state.
    const reopened = getLoopGraph(workspaceRoot, doc.id)!;
    expect(reopened.draft.nodes.some((n) => n.id === "retry2")).toBe(true);
    expect(reopened.draft.nodes.find((n) => n.id === "approve")?.humanAssignee).toBe("alice");

    await api.setLoopAuthoringCompleteOverride(null);
  });
});
