import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { LoopGraphDocument, LoopSpec } from "../contracts/loop-graph.js";
import { LoopRunBindingSchema } from "../contracts/loop-task-materials.js";
import {
  assertLaunchContextForBinding,
  buildRunBindingSnapshot,
  captureWorkspaceIdentity,
} from "./loop-run-binding.js";

const disposable: string[] = [];

afterEach(() => {
  for (const root of disposable.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function minimalDoc(spec: LoopSpec): LoopGraphDocument {
  return {
    id: "loop_1",
    title: "t",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    draft: {
      revision: 3,
      graphPrompt: "goal",
      nodes: [
        {
          id: "n1",
          title: "A",
          prompt: "a",
          type: "agent",
          agentRole: "coder",
          position: { x: 0, y: 0 },
          timeoutMs: 1000,
          credentialRefId: "cred_ref_only",
        },
      ],
      edges: [],
    },
    approvedSpecs: [spec],
    instances: [],
  } as LoopGraphDocument;
}

function minimalSpec(): LoopSpec {
  return {
    version: "spec_rb_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    goal: "bind",
    entryNodeId: "n1",
    nodes: [
      {
        id: "n1",
        title: "A",
        type: "agent",
        agentRole: "coder",
        goal: "do",
        timeoutMs: 1000,
      },
    ],
    edges: [],
    stopPolicy: { maxRounds: 2 },
    retryPolicy: { maxAttempts: 1 },
  } as LoopSpec;
}

describe("loop-run-binding identity + freeze", () => {
  it("labels non-git workspaces without pretending they are git remotes", () => {
    const root = mkdtempSync(join(tmpdir(), "rb-nongit-"));
    disposable.push(root);
    writeFileSync(join(root, "readme.txt"), "x");
    const identity = captureWorkspaceIdentity(root, "feat/ui");
    expect(identity.identityKind).toBe("workspace_path");
    expect(identity.repo.startsWith("workspace:")).toBe(true);
    expect(identity.branchSource).toBe("declared_unverified");
    expect(identity.headSha).toBeUndefined();
    expect(identity.remoteUrl).toBeUndefined();
  });

  it("freezes budget/permissionSet and content digests on snapshot", () => {
    const root = mkdtempSync(join(tmpdir(), "rb-bind-"));
    disposable.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "export const a = 1\n");
    const spec = minimalSpec();
    const doc = minimalDoc(spec);
    const binding = buildRunBindingSnapshot({
      projectId: "proj_1",
      workspaceRoot: root,
      document: doc,
      spec,
      createdAt: "2026-11-10T00:00:00.000Z",
      launchKind: "manual",
      declaredBranch: "feat/x",
      materials: [
        {
          id: "mat_1",
          kind: "text",
          purpose: "requirement",
          title: "t",
          source: "composer_text",
          parseStatus: "ok",
          version: 2,
          createdAt: "2026-11-10T00:00:00.000Z",
        },
      ],
      preflightNotes: ["[ok] ready"],
    });
    const parsed = LoopRunBindingSchema.parse(binding);
    expect(parsed.identityKind).toBe("workspace_path");
    expect(parsed.repo).toMatch(/^workspace:/);
    expect(parsed.budget).toEqual({
      maxRounds: 2,
      maxRetries: 1,
      maxAgentCalls: expect.any(Number),
      maxAgentCallDepth: expect.any(Number),
    });
    expect(parsed.permissionSet).toEqual({
      credentialRefIds: ["cred_ref_only"],
      requireHitlForHighRisk: true,
    });
    expect(parsed.credentialRefIds).toEqual(["cred_ref_only"]);
    expect(parsed.definitionDigest).toMatch(/^[a-f0-9]{32}$/);
    expect(parsed.materialsDigest).toMatch(/^[a-f0-9]{32}$/);
    expect(parsed.codeDigest).toMatch(/^[a-f0-9]{32}$/);
    // Tokens must never appear — refs only.
    expect(JSON.stringify(parsed)).not.toMatch(/token|secret|password/i);
  });

  it("blocks production launches missing projectId or preflight", () => {
    expect(() =>
      assertLaunchContextForBinding({
        launchKind: "event",
        requirePreflight: true,
      }),
    ).toThrow(/missing projectId/);
    expect(() =>
      assertLaunchContextForBinding({
        projectId: "p1",
        launchKind: "params",
        requirePreflight: false,
      }),
    ).toThrow(/preflight required/);
  });
});
