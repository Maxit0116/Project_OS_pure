import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  acceptLoopGraphEditOffer,
  createLoopGraph,
  getLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";

describe("acceptLoopGraphEditOffer stale draft", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects offer when draft revision diverged; keeps prior timeout", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-stale-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Stale offer");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 2,
        graphPrompt: "keep",
        nodes: [
          {
            id: "n_coder",
            title: "Coder",
            prompt: "impl",
            type: "agent",
            agentRole: "coder",
            timeoutMs: 7777,
            position: { x: 0, y: 0 },
          },
          {
            id: "n_retry",
            title: "Retry",
            prompt: "r",
            type: "logic",
            logicKind: "retry",
            retryLimit: 2,
            position: { x: 0, y: 80 },
          },
        ],
        edges: [],
      },
      pendingGraphEditOffer: {
        reason: "loopback: set timeoutMs=9999 on n_coder",
        createdAt: new Date().toISOString(),
        baseRevision: 2,
        proposedDraft: {
          revision: 3,
          graphPrompt: "keep",
          nodes: [
            {
              id: "n_coder",
              title: "Coder",
              prompt: "impl",
              type: "agent",
              agentRole: "coder",
              timeoutMs: 9999,
              position: { x: 0, y: 0 },
            },
            {
              id: "n_retry",
              title: "Retry",
              prompt: "r",
              type: "logic",
              logicKind: "retry",
              retryLimit: 2,
              position: { x: 0, y: 80 },
            },
          ],
          edges: [],
        },
        summary: "stale candidate",
      },
    });

    // Manual draft bump (simulates DutyCard edit) while offer still pending.
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        ...doc.draft,
        revision: 3,
        nodes: doc.draft.nodes.map((node) =>
          node.id === "n_retry" ? { ...node, retryLimit: 2 } : node,
        ),
      },
    });

    expect(() => acceptLoopGraphEditOffer(root, doc.id)).toThrow(/stale/i);

    const after = getLoopGraph(root, doc.id)!;
    const coder = after.draft.nodes.find((n) => n.id === "n_coder");
    const retry = after.draft.nodes.find((n) => n.id === "n_retry");
    expect(coder?.timeoutMs).toBe(7777);
    expect(retry?.retryLimit).toBe(2);
    expect(after.draft.revision).toBe(3);
  });
});
