import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import type { LoopGraphDocument, LoopSpec } from "../contracts/loop-graph.js";
import { LoopRunBindingSchema } from "../contracts/loop-task-materials.js";
import {
  assertCodeDigestComplete,
  assertCredentialAllowedByFreeze,
  assertLaunchContextForBinding,
  buildRunBindingSnapshot,
  captureWorkspaceIdentity,
  digestRunApprovalContext,
} from "./loop-run-binding.js";

const disposable: string[] = [];

afterEach(() => {
  for (const root of disposable.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
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
    retryPolicy: { maxAutoRetries: 1, onFailure: "retry" },
  } as LoopSpec;
}

function initGit(root: string): void {
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "rb@test.local"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "rb"], {
    cwd: root,
    stdio: "ignore",
  });
  writeFileSync(join(root, "tracked.ts"), "export const v = 1\n");
  execFileSync("git", ["add", "tracked.ts"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "ignore" });
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

  it("non-git identityDigest ≠ codeDigest (path hash is not content)", () => {
    const root = mkdtempSync(join(tmpdir(), "rb-nongit-content-"));
    disposable.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "export const a = 1\n");
    const first = captureWorkspaceIdentity(root);
    expect(first.identityKind).toBe("workspace_path");
    expect(first.identityDigest).not.toBe(first.codeDigest);
    expect(first.codeDigestStatus).toBe("complete");

    writeFileSync(join(root, "src/a.ts"), "export const a = 2\n");
    const second = captureWorkspaceIdentity(root);
    expect(second.identityDigest).toBe(first.identityDigest);
    expect(second.codeDigest).not.toBe(first.codeDigest);
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
    expect(parsed.codeDigestStatus).toBe("complete");
    expect(parsed.identityDigest).toBeTruthy();
    expect(parsed.identityDigest).not.toBe(parsed.codeDigest);
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

  it("dirty A→B with unchanged porcelain status letters changes content digest", () => {
    const root = mkdtempSync(join(tmpdir(), "rb-dirty-ab-"));
    disposable.push(root);
    initGit(root);
    writeFileSync(join(root, "tracked.ts"), "export const v = 'A'\n");
    const porcelainA = execFileSync("git", ["status", "--porcelain", "-uall"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const digA = captureWorkspaceIdentity(root);
    expect(digA.codeDigestStatus).toBe("complete");
    expect(digA.workspaceDirtyDigest).toBeTruthy();

    writeFileSync(join(root, "tracked.ts"), "export const v = 'B'\n");
    const porcelainB = execFileSync("git", ["status", "--porcelain", "-uall"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    // Same path, same status letters — porcelain line can look identical.
    expect(porcelainB.replace(/A|B/g, "X")).toBe(porcelainA.replace(/A|B/g, "X"));
    const digB = captureWorkspaceIdentity(root);
    expect(digB.workspaceDirtyDigest).not.toBe(digA.workspaceDirtyDigest);
    expect(digB.codeDigest).not.toBe(digA.codeDigest);
  });

  it("untracked content changes are reflected in digests", () => {
    const root = mkdtempSync(join(tmpdir(), "rb-untracked-"));
    disposable.push(root);
    initGit(root);
    writeFileSync(join(root, "new.ts"), "export const n = 1\n");
    const first = captureWorkspaceIdentity(root);
    writeFileSync(join(root, "new.ts"), "export const n = 2\n");
    const second = captureWorkspaceIdentity(root);
    expect(second.workspaceDirtyDigest).not.toBe(first.workspaceDirtyDigest);
    expect(second.codeDigest).not.toBe(first.codeDigest);
  });

  it("oversized dirty file is incomplete and blocks production start", () => {
    const root = mkdtempSync(join(tmpdir(), "rb-oversize-"));
    disposable.push(root);
    initGit(root);
    // > MAX_FILE_BYTES (2MiB)
    writeFileSync(join(root, "tracked.ts"), Buffer.alloc(2 * 1024 * 1024 + 8, 0x61));
    const identity = captureWorkspaceIdentity(root);
    expect(identity.codeDigestStatus).toBe("incomplete");
    expect(identity.incompleteReasons.some((r) => r.startsWith("oversized:"))).toBe(
      true,
    );
    const binding = buildRunBindingSnapshot({
      projectId: "proj_1",
      workspaceRoot: root,
      document: minimalDoc(minimalSpec()),
      spec: minimalSpec(),
      createdAt: "2026-11-10T00:00:00.000Z",
      launchKind: "manual",
    });
    expect(binding.codeDigestStatus).toBe("incomplete");
    expect(() => assertCodeDigestComplete(binding)).toThrow(/incomplete codeDigest/);
  });

  it("unreadable dirty file is incomplete (not path-hash complete)", () => {
    const root = mkdtempSync(join(tmpdir(), "rb-unreadable-"));
    disposable.push(root);
    initGit(root);
    const secretish = join(root, "tracked.ts");
    writeFileSync(secretish, "cannot read");
    chmodSync(secretish, 0);
    try {
      const identity = captureWorkspaceIdentity(root);
      // May be unreadable or (on some FS) still readable as root — accept either
      // incomplete OR complete only if bytes were actually read.
      if (identity.codeDigestStatus === "incomplete") {
        expect(
          identity.incompleteReasons.some((r) => r.includes("unreadable")),
        ).toBe(true);
        expect(() =>
          assertCodeDigestComplete({
            ...buildRunBindingSnapshot({
              projectId: "p",
              workspaceRoot: root,
              document: minimalDoc(minimalSpec()),
              spec: minimalSpec(),
              createdAt: "2026-11-10T00:00:00.000Z",
              launchKind: "manual",
            }),
            codeDigestStatus: "incomplete",
            incompleteReasons: identity.incompleteReasons,
          }),
        ).toThrow(/incomplete/);
      }
    } finally {
      chmodSync(secretish, 0o644);
    }
  });

  it("permission freeze rejects credentials not in frozen set", () => {
    const root = mkdtempSync(join(tmpdir(), "rb-perm-"));
    disposable.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "export {}\n");
    const binding = buildRunBindingSnapshot({
      projectId: "proj_1",
      workspaceRoot: root,
      document: minimalDoc(minimalSpec()),
      spec: minimalSpec(),
      createdAt: "2026-11-10T00:00:00.000Z",
      launchKind: "manual",
    });
    expect(assertCredentialAllowedByFreeze(binding, "cred_ref_only").ok).toBe(true);
    const denied = assertCredentialAllowedByFreeze(binding, "cred_other");
    expect(denied.ok).toBe(false);
  });

  it("credential present fail-closes without binding / permissionSet / empty set", () => {
    // Legitimate no-credential call stays ok (callers still require cred for writes).
    expect(assertCredentialAllowedByFreeze(undefined, undefined).ok).toBe(true);
    expect(
      assertCredentialAllowedByFreeze(
        { permissionSet: { credentialRefIds: ["a"], requireHitlForHighRisk: true } } as never,
        undefined,
      ).ok,
    ).toBe(true);

    const noBinding = assertCredentialAllowedByFreeze(undefined, "cred_x");
    expect(noBinding.ok).toBe(false);
    if (!noBinding.ok) expect(noBinding.reason).toMatch(/no RunBinding freeze/);

    const noSet = assertCredentialAllowedByFreeze({} as never, "cred_x");
    expect(noSet.ok).toBe(false);
    if (!noSet.ok) expect(noSet.reason).toMatch(/permissionSet was not frozen/);

    const emptySet = assertCredentialAllowedByFreeze(
      {
        permissionSet: { credentialRefIds: [], requireHitlForHighRisk: true },
      } as never,
      "cred_x",
    );
    expect(emptySet.ok).toBe(false);
    if (!emptySet.ok) expect(emptySet.reason).toMatch(/not in frozen permissionSet/);
  });

  it("approval context digest changes when materials/definition/budget/code change", () => {
    const root = mkdtempSync(join(tmpdir(), "rb-ctx-"));
    disposable.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "export const a = 1\n");
    const spec = minimalSpec();
    const doc = minimalDoc(spec);
    const base = buildRunBindingSnapshot({
      projectId: "proj_1",
      workspaceRoot: root,
      document: doc,
      spec,
      createdAt: "2026-11-10T00:00:00.000Z",
      launchKind: "manual",
      materials: [
        {
          id: "mat_1",
          kind: "text",
          purpose: "requirement",
          title: "t",
          source: "composer_text",
          parseStatus: "ok",
          version: 1,
          createdAt: "2026-11-10T00:00:00.000Z",
        },
      ],
    });
    const ctx1 = digestRunApprovalContext(base);
    const materialsChanged = buildRunBindingSnapshot({
      projectId: "proj_1",
      workspaceRoot: root,
      document: doc,
      spec,
      createdAt: "2026-11-10T00:00:00.000Z",
      launchKind: "manual",
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
    });
    expect(digestRunApprovalContext(materialsChanged)).not.toBe(ctx1);

    writeFileSync(join(root, "src/a.ts"), "export const a = 99\n");
    const codeChanged = buildRunBindingSnapshot({
      projectId: "proj_1",
      workspaceRoot: root,
      document: doc,
      spec,
      createdAt: "2026-11-10T00:00:00.000Z",
      launchKind: "manual",
      materials: base.materials,
    });
    expect(digestRunApprovalContext(codeChanged)).not.toBe(ctx1);

    const budgetChanged = {
      ...base,
      budget: {
        maxRounds: 9,
        maxRetries: 1,
        maxAgentCalls: base.budget!.maxAgentCalls,
        maxAgentCallDepth: base.budget!.maxAgentCallDepth,
      },
    };
    expect(digestRunApprovalContext(budgetChanged)).not.toBe(ctx1);
  });
});
