/**
 * Goal6 observe / recover — beyond recovery-hint-only.
 * Deterministic: implement → verify fail → feedback_taken → re-enter implement,
 * with failed TestReport retained and RunBinding freeze held. No invented KPI.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  approveLoopSpec,
  createLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import { compileIntentGraphHeuristic } from "./loop-graph-compiler.js";
import type {
  LoopAgentRunView,
  LoopEvidenceView,
  LoopExecutionHooks,
} from "./loop-execution.js";
import {
  advanceLoopInstance,
  startLoopInstance,
} from "./loop-runtime-service.js";

function scriptedHooks(filePath = "src/a.ts") {
  const runs = new Map<string, LoopAgentRunView>();
  const evidence = new Map<string, LoopEvidenceView>();
  const starts: string[] = [];
  let seq = 0;
  const fileDigest = `g6_${filePath.length}`;
  const execution: LoopExecutionHooks = {
    leaf: { featureNodeId: "feat_1", filePath },
    digestWorkspacePaths: (paths, options) => ({
      digests: Object.fromEntries(paths.map((path) => [path, fileDigest])),
      missing: [],
      unreadable: [],
      tombstones: [...(options?.deletedPaths ?? [])],
      undeleted: [],
    }),
    readRun: (runId) => runs.get(runId) ?? null,
    readEvidence: (runId) => evidence.get(runId) ?? null,
    requestVerification: () => undefined,
    startAgentRun: () => {
      seq += 1;
      const run: LoopAgentRunView = {
        runId: `run_g6_${seq}`,
        status: "queued",
        applySucceeded: false,
      };
      runs.set(run.runId, run);
      starts.push(run.runId);
      return run;
    },
  };
  return {
    execution,
    starts,
    finishApply: () => {
      const run = runs.get(`run_g6_${seq}`);
      if (!run) throw new Error("no run");
      run.status = "complete";
      run.applySucceeded = true;
      run.unifiedDiff = `diff --git a/${filePath}\n+export {}\n`;
    },
    failEvidence: () => {
      const runId = `run_g6_${seq}`;
      evidence.set(runId, {
        id: `evidence_${runId}`,
        runId,
        status: "failed",
        command: "npm test",
        exitCode: 1,
      });
    },
  };
}

describe("Goal6 observe/recover (beyond hint-only)", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("retains failed TestReport and takes feedback under frozen RunBinding", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-g6-obs-"));
    roots.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "export {}\n");

    let doc = createLoopGraph(root, "proj_g6", "G6 observe");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Implement then verify with feedback",
        nodes: [
          {
            id: "n1",
            title: "Implement",
            prompt: "Implement",
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
        edges: [
          { id: "e1", source: "n1", target: "n2", kind: "depends" },
          {
            id: "e2",
            source: "n2",
            target: "n1",
            kind: "feedback",
            prompt: "On failure",
          },
        ],
      },
    });
    const compiled = compileIntentGraphHeuristic(doc.draft);
    const spec = {
      ...compiled.specDraft,
      version: "spec_g6_obs",
      stopPolicy: { ...compiled.specDraft.stopPolicy, maxRounds: 3 },
    };
    doc = approveLoopSpec(root, doc.id, spec);

    const hooks = scriptedHooks();
    doc = startLoopInstance(root, doc.id, {
      specVersion: spec.version,
      projectId: "proj_g6",
      requirePreflight: true,
      execution: hooks.execution,
    });
    const binding = doc.instances[0]?.runBinding;
    expect(binding?.projectId).toBe("proj_g6");
    expect(binding?.budget?.maxRounds).toBe(3);
    expect(binding?.codeDigestStatus).toBe("complete");

    const instanceId = doc.instances[0]!.id;
    hooks.finishApply();
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.cursorNodeId).toBe("n2");

    hooks.failEvidence();
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);

    const afterFail = doc.instances[0]!;
    expect(afterFail.cursorNodeId).toBe("n1");
    expect(afterFail.round).toBe(1);
    expect(
      afterFail.events.some(
        (event) =>
          event.type === "feedback_taken" &&
          event.evidenceId === "evidence_run_g6_1",
      ),
    ).toBe(true);

    const failedReport = (afterFail.artifacts ?? []).find(
      (item) =>
        item.kind === "test_report" &&
        ((item.data as { status?: string }).status === "failed" ||
          (item.data as { exitCode?: number }).exitCode === 1),
    );
    expect(failedReport).toBeTruthy();
    expect(afterFail.runBinding?.budget?.maxRounds).toBe(3);
    expect(afterFail.runBinding?.definitionDigest).toBe(binding?.definitionDigest);
  });
});
