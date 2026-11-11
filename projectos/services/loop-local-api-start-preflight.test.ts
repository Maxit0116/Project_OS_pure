/**
 * Production LocalApi start path — preflight + runBinding snapshot (manual entry).
 */
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { LoopSpec } from "../contracts/loop-graph.js";
import { approveLoopSpec, createLoopGraph, getLoopGraph, upsertLoopGraph } from "./loop-graph-service.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");

function copySampleWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "loop-localapi-start-"));
  cpSync(sampleWorkspaceRoot, root, { recursive: true });
  return root;
}

function minimalAgentSpec(version: string): LoopSpec {
  return {
    version,
    graphRevision: 1,
    goal: "Agent-only start",
    acceptance: [],
    retryPolicy: { onFailure: "retry", maxAutoRetries: 1 },
    stopPolicy: { maxRounds: 2 },
    permissions: [],
    openQuestions: [],
    createdAt: "2026-11-10T00:00:00.000Z",
    nodes: [
      {
        id: "n1",
        role: "implement",
        type: "agent",
        agentRole: "coder",
        goal: "Implement",
        constraints: [],
        inputs: [],
        outputs: [],
        acceptance: [],
      },
    ],
    edges: [],
  };
}

describe("ProjectOSLocalApi startLoopInstance preflight + runBinding", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks start when action node lacks credential; binds project on clean start", async () => {
    const sample = copySampleWorkspace();
    roots.push(sample);
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: sample });
    const project = await api.openSampleWorkspace();
    const workspaceRoot = (
      api as unknown as {
        requireLoadedWorkspace: (id: string) => { workspaceRoot: string };
      }
    ).requireLoadedWorkspace(project.projectId).workspaceRoot;

    let doc = createLoopGraph(workspaceRoot, project.projectId, "Start preflight");
    doc = upsertLoopGraph(workspaceRoot, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Notify",
        nodes: [
          {
            id: "n_slack",
            title: "Slack",
            prompt: "",
            type: "action",
            actionIntegration: "slack",
            actionOperation: "chat_postMessage",
            // credentialRefId intentionally omitted
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
    });
    const slackSpec: LoopSpec = {
      version: "spec_slack_pf",
      graphRevision: 1,
      goal: "Notify",
      acceptance: [],
      retryPolicy: { onFailure: "retry", maxAutoRetries: 0 },
      stopPolicy: { maxRounds: 1 },
      permissions: [],
      openQuestions: [],
      createdAt: "2026-11-10T00:00:00.000Z",
      nodes: [
        {
          id: "n_slack",
          role: "decide",
          type: "action",
          actionIntegration: "slack",
          actionOperation: "chat_postMessage",
          goal: "Notify",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [],
    };
    doc = approveLoopSpec(workspaceRoot, doc.id, slackSpec);

    const preflight = await api.preflightLoopRun(project.projectId, doc.id, {
      branch: "main",
    });
    expect(preflight.canStart).toBe(false);
    expect(preflight.items.some((item) => item.code === "missing_credential")).toBe(true);

    await expect(
      api.startLoopInstance(project.projectId, doc.id, slackSpec.version),
    ).rejects.toThrow(/preflight/i);

    // Clean agent-only start with project binding.
    let clean = createLoopGraph(workspaceRoot, project.projectId, "Clean start");
    clean = upsertLoopGraph(workspaceRoot, {
      ...clean,
      draft: {
        revision: 1,
        graphPrompt: "Implement",
        nodes: [
          {
            id: "n1",
            title: "Implement",
            prompt: "do",
            type: "agent",
            agentRole: "coder",
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
    });
    const agentSpec = minimalAgentSpec("spec_agent_pf");
    clean = approveLoopSpec(workspaceRoot, clean.id, agentSpec);

    const started = await api.startLoopInstance(
      project.projectId,
      clean.id,
      agentSpec.version,
      undefined,
      { branch: "feat/x", materials: [] },
    );
    const instance = started.instances[started.instances.length - 1]!;
    expect(instance.runBinding?.projectId).toBe(project.projectId);
    expect(instance.runBinding?.specVersion).toBe(agentSpec.version);
    expect(instance.runBinding?.workspaceRoot).toBe(workspaceRoot);
    expect(instance.runBinding?.repo).toBeTruthy();
    expect(instance.runBinding?.identityKind).toMatch(/git_|workspace_path/);
    expect(instance.runBinding?.codeDigest).toMatch(/^[a-f0-9]{32}$/);
    expect(instance.runBinding?.definitionDigest).toMatch(/^[a-f0-9]{32}$/);
    expect(instance.runBinding?.budget?.maxRounds).toBeGreaterThan(0);
    expect(instance.runBinding?.permissionSet?.requireHitlForHighRisk).toBe(
      true,
    );
    expect(Array.isArray(instance.runBinding?.preflightNotes)).toBe(true);
    // Declared UI branch is recorded; verified git branch may differ.
    expect(
      instance.runBinding?.branch === "feat/x" ||
        instance.runBinding?.declaredBranch === "feat/x" ||
        instance.runBinding?.branchSource === "verified_git",
    ).toBe(true);

    // Definition edit must not rewrite frozen binding.
    const frozen = instance.runBinding;
    upsertLoopGraph(workspaceRoot, {
      ...getLoopGraph(workspaceRoot, clean.id)!,
      draft: {
        ...getLoopGraph(workspaceRoot, clean.id)!.draft,
        revision: 99,
        graphPrompt: "mutated definition after start",
      },
    });
    const after = getLoopGraph(workspaceRoot, clean.id)!;
    const same = after.instances.find((item) => item.id === instance.id);
    expect(same?.runBinding).toEqual(frozen);
  });
});
