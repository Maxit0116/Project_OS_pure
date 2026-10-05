import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { getWorkingTreeDiff } from "./git-context-service.js";

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
});
