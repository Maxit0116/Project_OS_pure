import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { LoopSpec } from "../contracts/loop-graph.js";
import {
  approveLoopSpec,
  createLoopGraph,
  getLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import {
  cancelLoopInstance,
  startLoopInstance,
} from "./loop-runtime-service.js";
import type { LoopExecutionHooks } from "./loop-execution.js";

describe("cancelLoopInstance retains artifacts", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps prior ChangeSet after cancel (safe recovery surface)", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-cancel-art-"));
    roots.push(root);
    const hooks: LoopExecutionHooks = {
      leaf: { featureNodeId: "f1", filePath: "src/a.ts" },
      readRun: () => ({
        runId: "run_1",
        status: "running",
        applySucceeded: false,
      }),
      readEvidence: () => null,
      startAgentRun: () => ({
        runId: "run_1",
        status: "running",
        applySucceeded: false,
      }),
    };
    let doc = createLoopGraph(root, "p", "Cancel retain");
    const spec: LoopSpec = {
      version: "spec_cancel_1",
      graphRevision: 1,
      goal: "g",
      acceptance: [],
      retryPolicy: { onFailure: "retry", maxAutoRetries: 0 },
      stopPolicy: { maxRounds: 1 },
      permissions: [],
      openQuestions: [],
      createdAt: "2026-11-10T00:00:00.000Z",
      nodes: [
        {
          id: "n1",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          goal: "impl",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [],
    };
    doc = approveLoopSpec(root, doc.id, spec);
    doc = startLoopInstance(root, doc.id, undefined, hooks);
    const inst = doc.instances[0]!;
    // Seed a ChangeSet as if a prior node completed.
    const seeded = {
      ...doc,
      instances: [
        {
          ...inst,
          artifacts: [
            {
              id: "art_cs",
              nodeId: "n1",
              kind: "change_set" as const,
              createdAt: "2026-11-10T00:00:00.000Z",
              data: {
                files: ["src/a.ts"],
                summary: "partial apply before cancel",
              },
            },
          ],
        },
      ],
    };
    upsertLoopGraph(root, seeded);
    cancelLoopInstance(root, doc.id, inst.id, hooks);
    const after = getLoopGraph(root, doc.id)!;
    const cancelled = after.instances.find((i) => i.id === inst.id)!;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.artifacts?.some((a) => a.kind === "change_set")).toBe(true);
    expect(cancelled.artifacts?.[0]?.data).toMatchObject({
      files: ["src/a.ts"],
    });
  });
});
