import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, afterEach } from "vitest";

import { compileIntentGraphHeuristic } from "./loop-graph-compiler.js";
import {
  approveLoopSpec,
  createLoopGraph,
  getLoopGraph,
  linkLoopGraphToSession,
  listLoopGraphHeads,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import {
  advanceLoopInstance,
  startLoopInstance,
} from "./loop-runtime-service.js";

describe("loop-graph-service", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "loop-graph-"));
    roots.push(root);
    return root;
  }

  it("persists create, link, compile, approve, and run a linear loop", () => {
    const root = tempRoot();
    let doc = createLoopGraph(root, "proj_1", "Login loop");
    expect(listLoopGraphHeads(root)).toHaveLength(1);

    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Ship login",
        nodes: [
          {
            id: "n1",
            title: "Implement login",
            prompt: "Implement login without schema changes",
            position: { x: 0, y: 0 },
          },
          {
            id: "n2",
            title: "Verify login",
            prompt: "Verify login tests",
            role: "verify",
            position: { x: 0, y: 120 },
          },
        ],
        edges: [
          { id: "e1", source: "n1", target: "n2", kind: "depends" },
          {
            id: "e2",
            source: "n2",
            target: "n1",
            kind: "feedback",
            prompt: "On failure fix then re-verify",
          },
        ],
      },
    });

    doc = linkLoopGraphToSession(root, doc.id, "chat_1")!;
    expect(doc.linkedSessionIds).toEqual(["chat_1"]);

    const compiled = compileIntentGraphHeuristic(doc.draft);
    doc = approveLoopSpec(root, doc.id, compiled.specDraft);
    expect(doc.approvedSpecs).toHaveLength(1);

    doc = startLoopInstance(root, doc.id);
    const instance = doc.instances[0]!;
    expect(instance.status === "running" || instance.status === "complete").toBe(true);

    while (
      doc.instances[0] &&
      (doc.instances[0].status === "running" || doc.instances[0].status === "queued")
    ) {
      doc = advanceLoopInstance(root, doc.id, instance.id);
    }

    expect(getLoopGraph(root, doc.id)?.instances[0]?.status).toBe("complete");
  });
});
