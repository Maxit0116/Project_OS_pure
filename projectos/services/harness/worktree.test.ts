import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  createAgentWorktree,
  getAgentWorktreeDiff,
  listAgentWorktrees,
  mergeAgentWorktree,
  removeAgentWorktree,
} from "./worktree.js";

function initRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "pos-wt-"));
  spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "test@example.com"], {
    cwd: root,
    encoding: "utf8",
  });
  spawnSync("git", ["config", "user.name", "Test"], {
    cwd: root,
    encoding: "utf8",
  });
  writeFileSync(join(root, "README.md"), "hello\n", "utf8");
  spawnSync("git", ["add", "README.md"], { cwd: root, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "init"], { cwd: root, encoding: "utf8" });
  return root;
}

describe("agent worktree (H4.C)", () => {
  it("creates an isolated worktree under .projectos/agent-worktrees", () => {
    const root = initRepo();
    const record = createAgentWorktree(root, { id: "demo" });
    expect(record.status).toBe("active");
    expect(record.relativePath).toBe(".projectos/agent-worktrees/demo");
    expect(listAgentWorktrees(root).some((item) => item.id === "demo")).toBe(
      true,
    );
    writeFileSync(join(record.path, "extra.txt"), "from agent\n", "utf8");
    spawnSync("git", ["add", "extra.txt"], {
      cwd: record.path,
      encoding: "utf8",
    });
    spawnSync("git", ["commit", "-m", "agent change"], {
      cwd: record.path,
      encoding: "utf8",
    });
    expect(getAgentWorktreeDiff(root, "demo")).toContain("extra.txt");
  });

  it("refuses merge without confirm: true at the schema boundary", () => {
    const root = initRepo();
    createAgentWorktree(root, { id: "nomerge" });
    expect(() =>
      mergeAgentWorktree(root, {
        worktreeId: "nomerge",
        // @ts-expect-error confirm must be literal true
        confirm: false,
      }),
    ).toThrow();
  });

  it("merges only with explicit confirm and can remove the worktree", () => {
    const root = initRepo();
    const record = createAgentWorktree(root, { id: "merge-me" });
    writeFileSync(join(record.path, "feat.txt"), "feat\n", "utf8");
    spawnSync("git", ["add", "feat.txt"], {
      cwd: record.path,
      encoding: "utf8",
    });
    spawnSync("git", ["commit", "-m", "feat"], {
      cwd: record.path,
      encoding: "utf8",
    });

    const merged = mergeAgentWorktree(root, {
      worktreeId: "merge-me",
      confirm: true,
    });
    expect(merged.status).toBe("merged");
    expect(existsSync(join(root, "feat.txt"))).toBe(true);

    const removed = removeAgentWorktree(root, "merge-me", {
      deleteBranch: true,
    });
    expect(removed.status).toBe("removed");
  });
});
