import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ProjectOSError } from "../../errors.js";
import { writeCapabilityContext } from "./tool-policy.js";
import { runHarnessShell } from "./run-shell.js";
import { applyDiffToToolResult, parseFailedTestCount } from "./tool-result.js";

describe("tool result envelope (T-0)", () => {
  it("summarizes a non-zero test exit without calling it a pass", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-tool-fail-"));
    const result = await runHarnessShell({
      workspaceRoot: root,
      command: {
        command: process.execPath,
        args: ["-e", "process.stdout.write('sk-abcdefghijklmnopqrstuvwxyz1234\\nTests  2 failed | 1 passed\\n'); process.exit(1)"],
        timeoutMs: 2_000,
      },
      policy: writeCapabilityContext({ allowedWritePaths: ["src/a.ts"] }),
      permissionRules: [{ effect: "allow", tool: "shell" }],
      sandboxApprovalResolved: true,
    });

    expect(result.toolResult.ok).toBe(false);
    expect(result.toolResult.exitCode).toBe(1);
    expect(result.toolResult.summary).toContain("Exit code 1");
    expect(result.toolResult.summary).toContain("2 failed");
    expect(result.toolResult.summary.toLowerCase()).not.toContain("pass");
    expect(result.toolResult.output).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234");
    expect(result.toolResult.output).toContain("[REDACTED]");
  });

  it("records a timeout as exitCode null", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-tool-timeout-"));
    const result = await runHarnessShell({
      workspaceRoot: root,
      command: {
        command: process.execPath,
        args: ["-e", "setTimeout(() => {}, 5000)"],
        timeoutMs: 100,
      },
      policy: writeCapabilityContext({ allowedWritePaths: ["src/a.ts"] }),
      permissionRules: [{ effect: "allow", tool: "shell" }],
      sandboxApprovalResolved: true,
    });

    expect(result.toolResult.ok).toBe(false);
    expect(result.toolResult.exitCode).toBeNull();
    expect(result.toolResult.summary).toContain("Timed out");
  });

  it("does not spawn when policy denies", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-tool-deny-"));
    const marker = join(root, "should-not-exist.txt");
    const pending = runHarnessShell({
      workspaceRoot: root,
      command: {
        command: process.execPath,
        args: ["-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
        timeoutMs: 2_000,
      },
      policy: writeCapabilityContext({ allowedWritePaths: ["src/a.ts"] }),
      permissionRules: [],
    });

    await expect(pending).rejects.toMatchObject({ code: "tool_policy_denied" });
    try {
      await pending;
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectOSError);
      expect((error as ProjectOSError).details?.toolResult).toMatchObject({
        tool: "shell",
        ok: false,
        exitCode: null,
      });
    }
    expect(existsSync(marker)).toBe(false);
  });

  it("does not report ok when approval is still required", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-tool-ask-"));
    const marker = join(root, "should-not-exist.txt");
    const result = await runHarnessShell({
      workspaceRoot: root,
      command: {
        command: process.execPath,
        args: ["-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
        timeoutMs: 2_000,
      },
      policy: writeCapabilityContext({ allowedWritePaths: ["src/a.ts"] }),
      permissionRules: [{ effect: "ask", tool: "shell" }],
    });

    expect(result.blocked).toBe(true);
    expect(result.toolResult.ok).toBe(false);
    expect(result.toolResult.exitCode).toBeNull();
    expect(result.toolResult.summary).toContain("Approval required");
    expect(existsSync(marker)).toBe(false);
  });

  it("parses failure counts only from test summary lines", () => {
    expect(parseFailedTestCount("noise 9 failed\nTests  3 failed | 1 passed")).toBe(3);
    expect(parseFailedTestCount("  4 failing")).toBe(4);
    expect(parseFailedTestCount("all good")).toBeNull();
  });

  it("turns an out-of-scope apply into a rejection with no written paths", () => {
    const rejected = applyDiffToToolResult({
      written: false,
      paths: ["src/other.ts"],
      reason: "Path 'src/other.ts' is outside allowedWritePaths",
    });
    expect(rejected).toMatchObject({
      tool: "apply_diff",
      ok: false,
      exitCode: null,
    });
    expect(rejected.artifacts).toBeUndefined();
    expect(rejected.summary).toContain("outside allowedWritePaths");

    const written = applyDiffToToolResult({
      written: true,
      paths: ["src/a.ts"],
      backupId: "backup-1",
      additions: 2,
      deletions: 1,
    });
    expect(written.ok).toBe(true);
    expect(written.artifacts).toMatchObject({
      paths: ["src/a.ts"],
      backupId: "backup-1",
      diffStats: { files: 1, additions: 2, deletions: 1 },
    });
  });
});
