import {
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectOSWorkspaceStore } from "../persistence/workspace-store.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import {
  RecoverableWriteTransactionKernel,
  bindCreateAuthorization,
  bindExistingFileAuthorization,
  readApplyBackupManifest,
} from "./recoverable-write-transaction.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("RecoverableWriteTransactionKernel", () => {
  it("creates without clobbering and undo removes only the unchanged created file", async () => {
    const workspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const relativePath = "app/created-by-kernel.ts";
    const target = join(workspaceRoot, relativePath);
    const after = new TextEncoder().encode("export const created = true;\n");
    const kernel = new RecoverableWriteTransactionKernel();
    let acceptanceCalls = 0;

    const result = await kernel.execute({
      runId: "run_create_kernel",
      projectId: project.projectId,
      workspaceRoot,
      projectOSRoot: join(workspaceRoot, ".projectos"),
      restoreAuthority: { kind: "project_api" },
      acceptCommitted: (committed) => {
        acceptanceCalls += 1;
        expect(committed).toMatchObject({ outcome: "committed", filesChanged: [relativePath] });
        expect(readFileSync(target, "utf8")).toBe("export const created = true;\n");
        expect(JSON.parse(readFileSync(join(
          workspaceRoot,
          ".projectos",
          "apply-backups",
          committed.backupId,
          "transaction-journal.json",
        ), "utf8"))).toMatchObject({ state: "awaiting_acceptance" });
      },
      operations: [{
        authorization: bindCreateAuthorization({
          projectId: project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath,
        }),
        afterBytes: after,
        mode: 0o640,
      }],
    });

    expect(readFileSync(target, "utf8")).toBe("export const created = true;\n");
    expect(acceptanceCalls).toBe(1);
    const manifest = readApplyBackupManifest(
      join(workspaceRoot, ".projectos", "apply-backups", result.backupId),
    );
    expect(manifest).toMatchObject({
      version: 4,
      restoreAuthority: { kind: "project_api" },
      files: [{ operation: "create", path: relativePath }],
    });

    await expect(api.restoreApplyBackup(project.projectId, result.backupId)).resolves.toMatchObject({
      restored: true,
      filesRestored: [relativePath],
    });
    expect(existsSync(target)).toBe(false);
  });

  it("refuses stale create undo instead of deleting newer bytes", async () => {
    const workspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const relativePath = "app/stale-create.ts";
    const target = join(workspaceRoot, relativePath);
    const kernel = new RecoverableWriteTransactionKernel();
    const result = await kernel.execute({
      runId: "run_create_stale",
      projectId: project.projectId,
      workspaceRoot,
      projectOSRoot: join(workspaceRoot, ".projectos"),
      restoreAuthority: { kind: "project_api" },
      operations: [{
        authorization: bindCreateAuthorization({
          projectId: project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath,
        }),
        afterBytes: new TextEncoder().encode("first\n"),
      }],
    });
    writeFileSync(target, "newer\n", "utf8");

    await expect(api.restoreApplyBackup(project.projectId, result.backupId)).rejects.toMatchObject({
      code: "undo_stale",
    });
    expect(readFileSync(target, "utf8")).toBe("newer\n");
  });

  it("deletes an exact authorized snapshot and undo recreates it only while absent", async () => {
    const workspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const relativePath = "lib/auth.ts";
    const target = join(workspaceRoot, relativePath);
    const before = readFileSync(target, { encoding: null });
    const mode = 0o644;
    const kernel = new RecoverableWriteTransactionKernel();
    const result = await kernel.execute({
      runId: "run_delete_kernel",
      projectId: project.projectId,
      workspaceRoot,
      projectOSRoot: join(workspaceRoot, ".projectos"),
      restoreAuthority: { kind: "project_api" },
      operations: [{
        authorization: bindExistingFileAuthorization({
          operation: "delete",
          projectId: project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath,
        }),
        beforeBytes: before,
        mode,
      }],
    });

    expect(existsSync(target)).toBe(false);
    expect(readApplyBackupManifest(
      join(workspaceRoot, ".projectos", "apply-backups", result.backupId),
    )).toMatchObject({
      version: 4,
      restoreAuthority: { kind: "project_api" },
      files: [{ operation: "delete", path: relativePath }],
    });
    await api.restoreApplyBackup(project.projectId, result.backupId);
    expect(readFileSync(target, { encoding: null })).toEqual(before);
  });

  it("uses link-based no-clobber create when a target races into existence", async () => {
    const workspaceRoot = copySampleWorkspace();
    const workspace = new ProjectOSWorkspaceStore().loadWorkspace(workspaceRoot);
    const relativePath = "app/raced-create.ts";
    const target = join(workspaceRoot, relativePath);
    const kernel = new RecoverableWriteTransactionKernel({
      replace: (temporaryPath, targetPath) => {
        throw new Error(`unexpected replace ${temporaryPath} ${targetPath}`);
      },
      createNoClobber: (_temporaryPath, targetPath) => {
        writeFileSync(targetPath, "racer\n", { flag: "wx" });
        const error = new Error("already exists") as NodeJS.ErrnoException;
        error.code = "EEXIST";
        throw error;
      },
      remove: (targetPath) => rmSync(targetPath),
    });

    await expect(kernel.execute({
      runId: "run_create_race",
      projectId: workspace.project.projectId,
      workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority: { kind: "project_api" },
      operations: [{
        authorization: bindCreateAuthorization({
          projectId: workspace.project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath,
        }),
        afterBytes: new TextEncoder().encode("agent\n"),
      }],
    })).rejects.toMatchObject({ code: "diff_apply_failed" });
    expect(readFileSync(target, "utf8")).toBe("racer\n");
  });

  it("rolls back a crash-marked legacy v3 transaction on startup", async () => {
    const workspaceRoot = copySampleWorkspace();
    const workspace = new ProjectOSWorkspaceStore().loadWorkspace(workspaceRoot);
    const relativePath = "lib/auth.ts";
    const target = join(workspaceRoot, relativePath);
    const before = readFileSync(target, { encoding: null });
    const kernel = new RecoverableWriteTransactionKernel();
    const result = await kernel.execute({
      runId: "run_crash_recovery",
      projectId: workspace.project.projectId,
      workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority: { kind: "project_api" },
      operations: [{
        authorization: bindExistingFileAuthorization({
          operation: "modify",
          projectId: workspace.project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath,
        }),
        beforeBytes: before,
        afterBytes: new TextEncoder().encode(`${new TextDecoder().decode(before)}\n// crash\n`),
        mode: 0o644,
      }],
    });
    const journalPath = join(
      workspace.projectOSRoot,
      "apply-backups",
      result.backupId,
      "transaction-journal.json",
    );
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Record<string, unknown>;
    writeFileSync(
      journalPath,
      `${JSON.stringify({ ...journal, state: "awaiting_acceptance" }, null, 2)}\n`,
      "utf8",
    );
    const manifestPath = join(
      workspace.projectOSRoot,
      "apply-backups",
      result.backupId,
      "manifest.json",
    );
    const {
      restoreAuthority: _restoreAuthority,
      ...manifest
    } = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ ...manifest, version: 3 }, null, 2)}\n`,
      "utf8",
    );

    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    await api.openSampleWorkspace();

    expect(readFileSync(target, { encoding: null })).toEqual(before);
    expect(existsSync(journalPath)).toBe(false);
  });

  it("rolls committed bytes back when synchronous history acceptance rejects", async () => {
    const workspaceRoot = copySampleWorkspace();
    const workspace = new ProjectOSWorkspaceStore().loadWorkspace(workspaceRoot);
    const relativePath = "lib/auth.ts";
    const target = join(workspaceRoot, relativePath);
    const before = readFileSync(target, { encoding: null });
    const after = new TextEncoder().encode(`${new TextDecoder().decode(before)}\n// rejected\n`);
    const kernel = new RecoverableWriteTransactionKernel();
    let observedCommittedBytes = false;

    await expect(kernel.execute({
      runId: "run_rejected_acceptance",
      projectId: workspace.project.projectId,
      workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority: { kind: "project_api" },
      operations: [{
        authorization: bindExistingFileAuthorization({
          operation: "modify",
          projectId: workspace.project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath,
        }),
        beforeBytes: before,
        afterBytes: after,
      }],
      acceptCommitted: () => {
        observedCommittedBytes = Buffer.from(readFileSync(target, { encoding: null }))
          .equals(Buffer.from(after));
        throw new Error("history acceptance rejected");
      },
    })).rejects.toMatchObject({ code: "diff_apply_failed" });

    expect(observedCommittedBytes).toBe(true);
    expect(readFileSync(target, { encoding: null })).toEqual(before);
  });

  it("rejects asynchronous transaction acceptance and restores source", async () => {
    const workspaceRoot = copySampleWorkspace();
    const workspace = new ProjectOSWorkspaceStore().loadWorkspace(workspaceRoot);
    const relativePath = "lib/auth.ts";
    const target = join(workspaceRoot, relativePath);
    const before = readFileSync(target, { encoding: null });
    const kernel = new RecoverableWriteTransactionKernel();

    await expect(kernel.execute({
      runId: "run_async_acceptance",
      projectId: workspace.project.projectId,
      workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority: { kind: "project_api" },
      operations: [{
        authorization: bindExistingFileAuthorization({
          operation: "modify",
          projectId: workspace.project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath,
        }),
        beforeBytes: before,
        afterBytes: new TextEncoder().encode(`${new TextDecoder().decode(before)}\n// async\n`),
      }],
      acceptCommitted: (async () => undefined) as unknown as () => void,
    })).rejects.toMatchObject({ code: "diff_apply_failed" });

    expect(readFileSync(target, { encoding: null })).toEqual(before);
  });

  it("sweeps orphaned durable-json temps and terminal committed journals", async () => {
    const workspaceRoot = copySampleWorkspace();
    const workspace = new ProjectOSWorkspaceStore().loadWorkspace(workspaceRoot);
    const relativePath = "lib/auth.ts";
    const before = readFileSync(join(workspaceRoot, relativePath), { encoding: null });
    const kernel = new RecoverableWriteTransactionKernel();
    const result = await kernel.execute({
      runId: "run_cleanup_terminal_journal",
      projectId: workspace.project.projectId,
      workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority: { kind: "project_api" },
      operations: [{
        authorization: bindExistingFileAuthorization({
          operation: "modify",
          projectId: workspace.project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath,
        }),
        beforeBytes: before,
        afterBytes: new TextEncoder().encode(`${new TextDecoder().decode(before)}\n// cleanup\n`),
      }],
    });
    const backupRoot = join(
      workspace.projectOSRoot,
      "apply-backups",
      result.backupId,
    );
    const journalPath = join(backupRoot, "transaction-journal.json");
    const orphanedTemp = join(
      backupRoot,
      "transaction-journal.json.00000000-0000-4000-8000-000000000000.tmp",
    );
    writeFileSync(orphanedTemp, "orphaned", "utf8");

    await expect(kernel.recoverPendingTransactions(
      workspaceRoot,
      workspace.projectOSRoot,
      workspace.project.projectId,
    )).resolves.toEqual([]);
    expect(existsSync(orphanedTemp)).toBe(false);
    expect(existsSync(journalPath)).toBe(false);
    expect(existsSync(join(backupRoot, "manifest.json"))).toBe(true);
  });

  it("rolls back every landed operation when a mixed transaction fails", async () => {
    const workspaceRoot = copySampleWorkspace();
    const workspace = new ProjectOSWorkspaceStore().loadWorkspace(workspaceRoot);
    const createPath = "app/mixed-created.ts";
    const modifyPath = "app/login/page.tsx";
    const deletePath = "lib/auth.ts";
    const modifyBefore = readFileSync(join(workspaceRoot, modifyPath), { encoding: null });
    const deleteBefore = readFileSync(join(workspaceRoot, deletePath), { encoding: null });
    const kernel = new RecoverableWriteTransactionKernel({
      replace: renameSync,
      createNoClobber(temporaryPath, targetPath) {
        linkSync(temporaryPath, targetPath);
        unlinkSync(temporaryPath);
      },
      remove(targetPath) {
        if (targetPath.endsWith(deletePath)) throw new Error("simulated delete failure");
        unlinkSync(targetPath);
      },
    });

    await expect(kernel.execute({
      runId: "run_mixed_rollback",
      projectId: workspace.project.projectId,
      workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority: { kind: "project_api" },
      operations: [
        {
          authorization: bindCreateAuthorization({
            projectId: workspace.project.projectId,
            nodeId: "feat_login",
            workspaceRoot,
            relativePath: createPath,
          }),
          afterBytes: new TextEncoder().encode("created\n"),
        },
        {
          authorization: bindExistingFileAuthorization({
            operation: "modify",
            projectId: workspace.project.projectId,
            nodeId: "feat_login",
            workspaceRoot,
            relativePath: modifyPath,
          }),
          beforeBytes: modifyBefore,
          afterBytes: new TextEncoder().encode(`${new TextDecoder().decode(modifyBefore)}\n// changed\n`),
        },
        {
          authorization: bindExistingFileAuthorization({
            operation: "delete",
            projectId: workspace.project.projectId,
            nodeId: "feat_login",
            workspaceRoot,
            relativePath: deletePath,
          }),
          beforeBytes: deleteBefore,
        },
      ],
    })).rejects.toMatchObject({ code: "diff_apply_failed" });

    expect(existsSync(join(workspaceRoot, createPath))).toBe(false);
    expect(readFileSync(join(workspaceRoot, modifyPath), { encoding: null })).toEqual(modifyBefore);
    expect(readFileSync(join(workspaceRoot, deletePath), { encoding: null })).toEqual(deleteBefore);
  });

  it("quarantines legacy v2 modify backups from generic restore", async () => {
    const workspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const relativePath = "lib/auth.ts";
    const target = join(workspaceRoot, relativePath);
    const original = readFileSync(target, { encoding: null });
    const applied = new TextEncoder().encode(`${new TextDecoder().decode(original)}\n// legacy\n`);
    writeFileSync(target, applied);
    const backupId = "legacy_v2_backup";
    const backupRoot = join(workspaceRoot, ".projectos", "apply-backups", backupId);
    const backupFile = "0000.original";
    rmSync(backupRoot, { recursive: true, force: true });
    mkdirSync(backupRoot, { recursive: true });
    writeFileSync(join(backupRoot, backupFile), original);
    writeFileSync(join(backupRoot, "manifest.json"), `${JSON.stringify({
      version: 2,
      backupId,
      runId: "run_legacy_v2",
      projectId: project.projectId,
      createdAt: "2026-07-19T00:00:00.000Z",
      files: [{
        path: relativePath,
        backupFile,
        mode: 0o644,
        originalSha256: hash(original),
        afterSha256: hash(applied),
      }],
    }, null, 2)}\n`, "utf8");

    await expect(api.restoreApplyBackup(project.projectId, backupId)).rejects.toMatchObject({
      code: "backup_not_found",
    });
    expect(
      Buffer.from(readFileSync(target, { encoding: null })).equals(Buffer.from(applied)),
    ).toBe(true);
  });

  it("quarantines legacy v3 operation backups from generic restore", async () => {
    const workspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const relativePath = "lib/auth.ts";
    const target = join(workspaceRoot, relativePath);
    const original = readFileSync(target, { encoding: null });
    const applied = new TextEncoder().encode(`${new TextDecoder().decode(original)}\n// legacy-v3\n`);
    writeFileSync(target, applied);
    const backupId = "legacy_v3_backup";
    const backupRoot = join(workspaceRoot, ".projectos", "apply-backups", backupId);
    const backupFile = "0000.original";
    rmSync(backupRoot, { recursive: true, force: true });
    mkdirSync(backupRoot, { recursive: true });
    writeFileSync(join(backupRoot, backupFile), original);
    writeFileSync(join(backupRoot, "manifest.json"), `${JSON.stringify({
      version: 3,
      backupId,
      runId: "run_legacy_v3",
      projectId: project.projectId,
      createdAt: "2026-07-19T00:00:00.000Z",
      files: [{
        operation: "modify",
        path: relativePath,
        backupFile,
        mode: 0o644,
        originalSha256: hash(original),
        afterSha256: hash(applied),
      }],
    }, null, 2)}\n`, "utf8");

    await expect(api.restoreApplyBackup(project.projectId, backupId)).rejects.toMatchObject({
      code: "backup_not_found",
    });
    expect(
      Buffer.from(readFileSync(target, { encoding: null })).equals(Buffer.from(applied)),
    ).toBe(true);
  });

  it("serializes transactions per project so a second stale snapshot cannot interleave", async () => {
    const workspaceRoot = copySampleWorkspace();
    const workspace = new ProjectOSWorkspaceStore().loadWorkspace(workspaceRoot);
    const relativePath = "lib/auth.ts";
    const target = join(workspaceRoot, relativePath);
    const before = readFileSync(target, { encoding: null });
    const authorization = bindExistingFileAuthorization({
      operation: "modify",
      projectId: workspace.project.projectId,
      nodeId: "feat_login",
      workspaceRoot,
      relativePath,
    });
    const kernel = new RecoverableWriteTransactionKernel();
    const request = (runId: string, marker: string) => kernel.execute({
      runId,
      projectId: workspace.project.projectId,
      workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority: { kind: "project_api" },
      operations: [{
        authorization,
        beforeBytes: before,
        afterBytes: new TextEncoder().encode(`${new TextDecoder().decode(before)}\n// ${marker}\n`),
      }],
    });

    const [first, second] = await Promise.allSettled([
      request("run_lock_first", "first"),
      request("run_lock_second", "second"),
    ]);

    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ code: "diff_stale" }),
    });
    expect(readFileSync(target, "utf8")).toContain("// first");
  });

  it("serializes pending recovery behind a live transaction for the same project", async () => {
    const workspaceRoot = copySampleWorkspace();
    const workspace = new ProjectOSWorkspaceStore().loadWorkspace(workspaceRoot);
    const recoveryPath = "lib/auth.ts";
    const recoveryTarget = join(workspaceRoot, recoveryPath);
    const recoveryBefore = readFileSync(recoveryTarget, { encoding: null });
    const setupKernel = new RecoverableWriteTransactionKernel();
    const pending = await setupKernel.execute({
      runId: "run_recovery_lock_setup",
      projectId: workspace.project.projectId,
      workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority: { kind: "project_api" },
      operations: [{
        authorization: bindExistingFileAuthorization({
          operation: "modify",
          projectId: workspace.project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath: recoveryPath,
        }),
        beforeBytes: recoveryBefore,
        afterBytes: new TextEncoder().encode("pending recovery bytes\n"),
      }],
    });
    const journalPath = join(
      workspace.projectOSRoot,
      "apply-backups",
      pending.backupId,
      "transaction-journal.json",
    );
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Record<string, unknown>;
    writeFileSync(
      journalPath,
      `${JSON.stringify({ ...journal, state: "committing" }, null, 2)}\n`,
      "utf8",
    );

    const livePath = "app/login/page.tsx";
    const liveTarget = join(workspaceRoot, livePath);
    const liveBefore = readFileSync(liveTarget, { encoding: null });
    const enteredCommit = deferred();
    const releaseCommit = deferred();
    const kernel = new RecoverableWriteTransactionKernel();
    const commitPromise = kernel.execute({
      runId: "run_recovery_lock_live",
      projectId: workspace.project.projectId,
      workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority: { kind: "project_api" },
      operations: [{
        authorization: bindExistingFileAuthorization({
          operation: "modify",
          projectId: workspace.project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath: livePath,
        }),
        beforeBytes: liveBefore,
        afterBytes: new TextEncoder().encode(`${new TextDecoder().decode(liveBefore)}\n// live commit\n`),
      }],
      beforeCommit: async () => {
        enteredCommit.resolve();
        await releaseCommit.promise;
      },
    });
    await enteredCommit.promise;

    let recoverySettled = false;
    const recoveryPromise = Promise.resolve(kernel.recoverPendingTransactions(
      workspaceRoot,
      workspace.projectOSRoot,
      workspace.project.projectId,
    )).then((results) => {
      recoverySettled = true;
      return results;
    });
    await Promise.resolve();
    await Promise.resolve();
    const settledWhileCommitHeldLock = recoverySettled;

    releaseCommit.resolve();
    await expect(commitPromise).resolves.toMatchObject({ outcome: "committed" });
    await expect(recoveryPromise).resolves.toContainEqual({
      backupId: pending.backupId,
      outcome: "rolled_back",
      failedPaths: [],
    });
    expect(settledWhileCommitHeldLock).toBe(false);
    expect(readFileSync(recoveryTarget, { encoding: null })).toEqual(recoveryBefore);
    expect(readFileSync(liveTarget, "utf8")).toContain("// live commit");
  });

  it("fails startup closed with a durable recovery manifest when disk state is ambiguous", async () => {
    const workspaceRoot = copySampleWorkspace();
    const workspace = new ProjectOSWorkspaceStore().loadWorkspace(workspaceRoot);
    const relativePath = "lib/auth.ts";
    const target = join(workspaceRoot, relativePath);
    const before = readFileSync(target, { encoding: null });
    const kernel = new RecoverableWriteTransactionKernel();
    const result = await kernel.execute({
      runId: "run_ambiguous_recovery",
      projectId: workspace.project.projectId,
      workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority: { kind: "project_api" },
      operations: [{
        authorization: bindExistingFileAuthorization({
          operation: "modify",
          projectId: workspace.project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath,
        }),
        beforeBytes: before,
        afterBytes: new TextEncoder().encode("applied\n"),
      }],
    });
    const backupRoot = join(workspace.projectOSRoot, "apply-backups", result.backupId);
    const journalPath = join(backupRoot, "transaction-journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Record<string, unknown>;
    writeFileSync(
      journalPath,
      `${JSON.stringify({ ...journal, state: "committing", entries: [{
        ...((journal.entries as Record<string, unknown>[])[0] ?? {}),
        committed: false,
      }] }, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(target, "neither-before-nor-after\n", "utf8");

    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    await expect(api.openSampleWorkspace()).rejects.toMatchObject({
      code: "diff_apply_failed",
      details: { backupIds: [result.backupId] },
    });
    expect(existsSync(join(backupRoot, "recovery-manifest.json"))).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("neither-before-nor-after\n");

    const restartedApi = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    await expect(restartedApi.openSampleWorkspace()).rejects.toMatchObject({
      code: "diff_apply_failed",
      details: { backupIds: [result.backupId] },
    });
  });
});

function copySampleWorkspace(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "projectos-transaction-"));
  temporaryRoots.push(tempRoot);
  const workspaceRoot = join(tempRoot, "sample-graph-saas");
  cpSync(sampleWorkspaceRoot, workspaceRoot, { recursive: true });
  rmSync(join(workspaceRoot, ".projectos", "settings.json"), { force: true });
  rmSync(join(workspaceRoot, ".projectos", "apply-backups"), {
    recursive: true,
    force: true,
  });
  return workspaceRoot;
}

function hash(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
