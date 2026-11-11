/**
 * Production LocalApi settle entry with DI transport — not shared-scheduler-only probes.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  combineFileDigests,
  createWorkspacePathDigester,
  digestOperationPayload,
  computeEngineeringBaseline,
} from "./loop-approval-binding.js";
import {
  approveLoopSpec,
  createLoopGraph,
  getLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import { pushArtifact } from "./loop-runtime-architecture.js";
import type { LoopSpec } from "../contracts/loop-graph.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");

function copySampleWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "loop-localapi-settle-"));
  cpSync(sampleWorkspaceRoot, root, { recursive: true });
  return root;
}

describe("ProjectOSLocalApi settlePendingGithubOp (production entry + DI)", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prepare→final-gate→transport: stale during prepare → 0 side effects", async () => {
    const sample = copySampleWorkspace();
    roots.push(sample);
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: sample });
    const project = await api.openSampleWorkspace();
    const workspaceRoot = (
      api as unknown as {
        requireLoadedWorkspace: (id: string) => { workspaceRoot: string };
      }
    ).requireLoadedWorkspace(project.projectId).workspaceRoot;

    let doc = createLoopGraph(workspaceRoot, project.projectId, "Dispatch");
    const spec: LoopSpec = {
      version: "spec_local_1",
      graphRevision: 1,
      goal: "PR",
      acceptance: [],
      retryPolicy: { onFailure: "retry", maxAutoRetries: 1 },
      stopPolicy: { maxRounds: 3 },
      permissions: [
        {
          id: "perm_pr",
          action: "github.create_pr",
          scope: "repository",
          requiresApproval: true,
        },
      ],
      openQuestions: [],
      createdAt: "2026-11-10T00:00:00.000Z",
      nodes: [
        {
          id: "n_approval",
          role: "decide",
          type: "human",
          humanMode: "approval",
          goal: "Approve",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_pr",
          role: "decide",
          type: "action",
          actionIntegration: "github",
          actionOperation: "create_pr",
          goal: "PR",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [{ id: "e1", from: "n_approval", to: "n_pr", kind: "depends" }],
    };
    doc = approveLoopSpec(workspaceRoot, doc.id, spec);
    mkdirSync(join(workspaceRoot, "src"), { recursive: true });
    writeFileSync(join(workspaceRoot, "src/a.ts"), "v1\n", "utf8");
    const digester = createWorkspacePathDigester(workspaceRoot);
    const digested = digester(["src/a.ts"]);
    const contentDigest = combineFileDigests(digested.digests);
    const hooks = {
      leaf: null,
      readRun: () => null,
      readEvidence: () => null,
      startAgentRun: () => {
        throw new Error("unused");
      },
      digestWorkspacePaths: digester,
    };
    let working = pushArtifact(
      {
        id: "inst_local",
        specVersion: spec.version,
        status: "running",
        cursorNodeId: "n_pr",
        round: 0,
        attemptCounts: {},
        nodeRecords: [
          {
            nodeId: "n_approval",
            status: "succeeded",
            updatedAt: "2026-11-10T00:00:00.000Z",
          },
          {
            nodeId: "n_pr",
            status: "ready",
            updatedAt: "2026-11-10T00:00:00.000Z",
          },
        ],
        events: [
          { id: "evt_1", at: "2026-11-10T00:00:00.000Z", type: "started" },
        ],
        startedAt: "2026-11-10T00:00:00.000Z",
        updatedAt: "2026-11-10T00:00:00.000Z",
        artifacts: [],
      },
      {
        nodeId: "n_coder",
        kind: "change_set",
        data: {
          files: ["src/a.ts"],
          summary: "v1",
          contentDigest,
          fileDigests: digested.digests,
        },
      },
    );
    const engineering = computeEngineeringBaseline(working, hooks);
    const payload = { title: "feat", head: "feat/x", base: "main" };
    working = {
      ...working,
      pendingGithubOp: {
        nodeId: "n_pr",
        operation: "create_pr",
        payload,
        queuedAt: "2026-11-10T00:00:00.000Z",
        dispatchState: "queued",
        idempotencyKey: [
          working.id,
          "n_pr",
          "create_pr",
          digestOperationPayload(payload),
        ].join(":"),
        approvalBinding: {
          decisionArtifactId: "art_decision",
          instanceId: working.id,
          nodeId: "n_pr",
          decisionNodeId: "n_approval",
          actionIntegration: "github",
          actionOperation: "create_pr",
          artifactIds: engineering.artifactIds,
          engineeringBaseline: engineering.baseline,
          codeDigest: engineering.codeDigest,
          operationDigest: digestOperationPayload(payload),
          actorKind: "local_declared",
          approvedAt: "2026-11-10T00:00:00.000Z",
        },
      },
    };
    doc = upsertLoopGraph(workspaceRoot, { ...doc, instances: [working] });

    let transportCalls = 0;
    let prepareCalls = 0;
    api.replaceLoopGithubTransportForTests({
      prepare: async () => {
        prepareCalls += 1;
        writeFileSync(join(workspaceRoot, "src/a.ts"), "dirty\n", "utf8");
        return { accessToken: "test-token" };
      },
      transportCreatePr: async () => {
        transportCalls += 1;
        throw new Error("must not transport");
      },
      listPullRequests: async () => ({ available: true, pullRequests: [] }),
    });

    await api.settlePendingGithubOpForTests(
      project.projectId,
      doc.id,
      working.id,
    );
    expect(prepareCalls).toBe(1);
    expect(transportCalls).toBe(0);
    const after = getLoopGraph(workspaceRoot, doc.id)!;
    expect(after.instances[0]?.pendingGithubOp).toBeUndefined();
  });
});
