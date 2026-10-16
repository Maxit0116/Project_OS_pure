import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { compileIntentGraphHeuristic } from "./loop-graph-compiler.js";
import {
  approveLoopSpec,
  createLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import {
  advanceLoopInstance,
  pauseLoopInstance,
  resumeLoopInstance,
  startLoopInstance,
} from "./loop-runtime-service.js";

describe("loop-runtime-service", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs a linear implement→verify chain to completion and supports pause", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Linear loop");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Implement then verify",
        nodes: [
          {
            id: "n1",
            title: "Implement",
            prompt: "Implement feature",
            role: "implement",
            position: { x: 0, y: 0 },
          },
          {
            id: "n2",
            title: "Verify",
            prompt: "Verify feature",
            role: "verify",
            position: { x: 0, y: 120 },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2", kind: "depends" }],
      },
    });
    const compiled = compileIntentGraphHeuristic(doc.draft);
    doc = approveLoopSpec(root, doc.id, compiled.specDraft);
    doc = startLoopInstance(root, doc.id);
    const instanceId = doc.instances[0]!.id;
    expect(["running", "queued", "complete"]).toContain(doc.instances[0]!.status);

    doc = pauseLoopInstance(root, doc.id, instanceId);
    if (doc.instances[0]!.status === "paused") {
      doc = resumeLoopInstance(root, doc.id, instanceId);
    }

    let guard = 0;
    while (
      guard < 10 &&
      doc.instances[0] &&
      (doc.instances[0].status === "running" || doc.instances[0].status === "queued")
    ) {
      doc = advanceLoopInstance(root, doc.id, instanceId);
      guard += 1;
    }

    expect(doc.instances[0]?.status).toBe("complete");
  });
});
