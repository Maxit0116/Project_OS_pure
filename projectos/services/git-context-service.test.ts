import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { readCapabilityContext } from "./harness/tool-policy.js";
import {
  checkoutGitBranch,
  createGitBranch,
  deleteGitBranch,
  getWorkingTreeDiff,
  listGitBranches,
  mergeRemoteApiBranches,
  queryGitReadOnlyStatus,
  readGitRepositoryStatus,
  renameGitBranch,
  rollbackGitBranch,
} from "./git-context-service.js";

function run(cwd: string, command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "command failed");
  }
  return result.stdout ?? "";
}

describe("git-context-service", () => {
  it("returns working tree diff for a git repo", () => {
    const dir = mkdtempSync(join(process.cwd(), ".tmp-projectos-git-"));
    run(dir, "git", ["init"]);
    run(dir, "git", ["config", "user.email", "test@example.com"]);
    run(dir, "git", ["config", "user.name", "Test"]);
    writeFileSync(join(dir, "a.txt"), "hello\n");
    run(dir, "git", ["add", "a.txt"]);
    run(dir, "git", ["commit", "-m", "init"]);
    writeFileSync(join(dir, "a.txt"), "hello world\n");
    const result = getWorkingTreeDiff(dir);
    expect(result.diff).toContain("hello world");
    expect(result.disposition).toBe("exact");
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports branch, dirty, and upstream counts without throwing outside a repo", () => {
    const dir = mkdtempSync(join(process.cwd(), ".tmp-projectos-git-status-"));
    try {
      const missing = queryGitReadOnlyStatus(
        join(dir, "missing"),
        readCapabilityContext({ allowedReadPaths: [] }),
        { rules: [] },
      );
      expect(missing.ok).toBe(false);
      expect(missing.summary).toContain("not a git repository");

      run(dir, "git", ["init"]);
      run(dir, "git", ["config", "user.email", "test@example.com"]);
      run(dir, "git", ["config", "user.name", "Test"]);
      writeFileSync(join(dir, "a.txt"), "hello\n");
      run(dir, "git", ["add", "a.txt"]);
      run(dir, "git", ["commit", "-m", "init"]);
      run(dir, "git", ["branch", "base"]);
      writeFileSync(join(dir, "a.txt"), "hello world\n");
      run(dir, "git", ["add", "a.txt"]);
      run(dir, "git", ["commit", "-m", "second"]);
      run(dir, "git", ["branch", "--set-upstream-to=base"]);
      writeFileSync(join(dir, "a.txt"), `${"x".repeat(200)}\n`);

      const status = readGitRepositoryStatus(dir, 40);
      expect(status.dirty).toBe(true);
      expect(status.branch).toBeTruthy();
      expect(status.ahead).toBe(1);
      expect(status.behind).toBe(0);
      expect(status.diffTruncated).toBe(true);

      const result = queryGitReadOnlyStatus(
        dir,
        readCapabilityContext({ allowedReadPaths: [] }),
        { rules: [], maxChars: 40 },
      );
      expect(result.ok).toBe(true);
      expect(result.truncated).toBe(true);
      expect(result.summary).toContain("Dirty");
      expect(result.summary).toContain("not a complete patch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("denies git status before running git", () => {
    const result = queryGitReadOnlyStatus(
      join(process.cwd(), "this-path-does-not-exist"),
      readCapabilityContext({ allowedReadPaths: [] }),
      { rules: [{ effect: "deny", tool: "git_status" }] },
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("Denied by project permissions");
    expect(result.summary).not.toContain("not a git repository");
  });

  it("lists branches and refuses dirty checkout", () => {
    const dir = mkdtempSync(join(process.cwd(), ".tmp-projectos-git-branch-"));
    try {
      run(dir, "git", ["init"]);
      run(dir, "git", ["config", "user.email", "test@example.com"]);
      run(dir, "git", ["config", "user.name", "Test"]);
      writeFileSync(join(dir, "a.txt"), "hello\n");
      run(dir, "git", ["add", "a.txt"]);
      run(dir, "git", ["commit", "-m", "init"]);
      const created = createGitBranch(dir, "feat/demo", { checkout: true });
      expect(created.ok).toBe(true);
      const listed = listGitBranches(dir);
      expect(listed.branches.some((b) => b.name === "feat/demo")).toBe(true);
      writeFileSync(join(dir, "a.txt"), "dirty\n");
      const blocked = checkoutGitBranch(dir, "main");
      expect(blocked.ok).toBe(false);
      expect(blocked.message).toMatch(/dirty/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("merges GitHub API branch names that are missing locally", () => {
    const listed = {
      defaultBranch: "main",
      currentBranch: "main",
      branches: [
        {
          name: "main",
          id: "branch:main",
          current: true,
          remote: false,
        },
      ],
    };
    const merged = mergeRemoteApiBranches(listed, [
      "main",
      "backend",
      "frontend",
    ]);
    expect(merged.branches.map((b) => b.name).sort()).toEqual([
      "backend",
      "frontend",
      "main",
    ]);
    expect(merged.branches.find((b) => b.name === "backend")?.remote).toBe(true);
  });

  it("creates a branch from a remote-only start point name", () => {
    const dir = mkdtempSync(join(process.cwd(), ".tmp-projectos-git-from-"));
    try {
      run(dir, "git", ["init"]);
      run(dir, "git", ["config", "user.email", "test@example.com"]);
      run(dir, "git", ["config", "user.name", "Test"]);
      writeFileSync(join(dir, "a.txt"), "hello\n");
      run(dir, "git", ["add", "a.txt"]);
      run(dir, "git", ["commit", "-m", "init"]);
      run(dir, "git", ["branch", "backend"]);
      // Simulate remote-tracking ref without a local checkout of backend.
      run(dir, "git", ["update-ref", "refs/remotes/origin/backend", "backend"]);
      run(dir, "git", ["checkout", "-B", "main"]);
      const created = createGitBranch(dir, "feat/from-backend", {
        from: "backend",
        checkout: true,
      });
      expect(created.ok).toBe(true);
      expect(created.message).toMatch(/origin\/backend|backend/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renames, rolls back, and deletes a feature branch against origin", () => {
    const bare = mkdtempSync(join(process.cwd(), ".tmp-projectos-git-ops-bare-"));
    const dir = mkdtempSync(join(process.cwd(), ".tmp-projectos-git-ops-"));
    try {
      run(bare, "git", ["init", "--bare"]);
      run(dir, "git", ["init"]);
      run(dir, "git", ["config", "user.email", "test@example.com"]);
      run(dir, "git", ["config", "user.name", "Test"]);
      writeFileSync(join(dir, "a.txt"), "hello\n");
      run(dir, "git", ["add", "a.txt"]);
      run(dir, "git", ["commit", "-m", "init"]);
      run(dir, "git", ["branch", "-M", "main"]);
      run(dir, "git", ["remote", "add", "origin", bare]);
      run(dir, "git", ["push", "-u", "origin", "main"]);

      const created = createGitBranch(dir, "feat/ops", {
        checkout: true,
        push: true,
      });
      expect(created.ok).toBe(true);
      writeFileSync(join(dir, "a.txt"), "changed\n");
      run(dir, "git", ["add", "a.txt"]);
      run(dir, "git", ["commit", "-m", "feat"]);
      run(dir, "git", ["push"]);

      const renamed = renameGitBranch(dir, "feat/ops", "feat/ops-renamed", {
        push: true,
        deleteRemoteOld: true,
      });
      expect(renamed.ok).toBe(true);
      expect(renamed.branch).toBe("feat/ops-renamed");

      const rolled = rollbackGitBranch(dir, "feat/ops-renamed", {
        to: "main",
        mode: "hard",
        push: true,
      });
      expect(rolled.ok).toBe(true);

      const deleted = deleteGitBranch(dir, "feat/ops-renamed", {
        remote: true,
        force: true,
      });
      expect(deleted.ok).toBe(true);
      const heads = listGitBranches(dir).branches.map((b) => b.name);
      expect(heads).not.toContain("feat/ops-renamed");
      expect(heads).not.toContain("feat/ops");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("pushes a newly created branch to origin when push is requested", () => {
    const bare = mkdtempSync(join(process.cwd(), ".tmp-projectos-git-bare-"));
    const dir = mkdtempSync(join(process.cwd(), ".tmp-projectos-git-push-"));
    try {
      run(bare, "git", ["init", "--bare"]);
      run(dir, "git", ["init"]);
      run(dir, "git", ["config", "user.email", "test@example.com"]);
      run(dir, "git", ["config", "user.name", "Test"]);
      writeFileSync(join(dir, "a.txt"), "hello\n");
      run(dir, "git", ["add", "a.txt"]);
      run(dir, "git", ["commit", "-m", "init"]);
      run(dir, "git", ["branch", "-M", "main"]);
      run(dir, "git", ["remote", "add", "origin", bare]);
      run(dir, "git", ["push", "-u", "origin", "main"]);
      const created = createGitBranch(dir, "feat/pushed", {
        checkout: true,
        push: true,
      });
      expect(created.ok).toBe(true);
      expect(created.message).toMatch(/pushed/i);
      const remoteHeads = run(bare, "git", [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads",
      ]);
      expect(remoteHeads).toMatch(/feat\/pushed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
