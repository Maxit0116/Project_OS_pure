import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { readCapabilityContext } from "./harness/tool-policy.js";
import {
  getWorkingTreeDiff,
  queryGitReadOnlyStatus,
  readGitRepositoryStatus,
} from "./git-context-service.js";

function run(cwd: string, command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "command failed");
  }
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
});
