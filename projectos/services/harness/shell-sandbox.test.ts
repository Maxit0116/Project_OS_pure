import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { writeCapabilityContext } from "./tool-policy.js";
import { runHarnessShell } from "./run-shell.js";
import {
  classifyShellInvocation,
  loadShellSandboxConfig,
  runSandboxedCommand,
} from "./shell-sandbox.js";

describe("shell sandbox (H3.B)", () => {
  it("soft-allows known safe binaries", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-"));
    const result = classifyShellInvocation({
      workspaceRoot: root,
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
    });
    expect(result.decision).toBe("sandboxed");
    expect(result.softOnly).toBe(true);
  });

  it("asks for unknown binaries when OS sandbox is unavailable", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-unk-"));
    const result = classifyShellInvocation({
      workspaceRoot: root,
      command: "totally-unknown-agent-bin",
      args: ["--help"],
    });
    expect(result.decision).toBe("ask");
    expect(result.reasons.some((reason) => reason.includes("unknown_binary"))).toBe(
      true,
    );
  });

  it("denies protected path targets", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-prot-"));
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git", "config"), "", "utf8");
    const result = classifyShellInvocation({
      workspaceRoot: root,
      command: "rm",
      args: [".git/config"],
    });
    expect(result.decision).toBe("deny");
    expect(result.reasons[0]).toContain("protected_path");
  });

  it("asks for network binaries when networkAccess is false", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-net-"));
    const result = classifyShellInvocation({
      workspaceRoot: root,
      command: "curl",
      args: ["https://example.com"],
      config: { version: "0.1.0", networkAccess: false, additionalWritableRoots: [], allowTempWrites: true },
    });
    expect(result.decision).toBe("ask");
  });

  it("does not run ask classifications without approval", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-block-"));
    const blocked = await runSandboxedCommand({
      cwd: root,
      command: {
        command: "curl",
        args: ["https://example.com"],
        timeoutMs: 1_000,
      },
      approvalResolved: false,
    });
    expect(blocked.blocked).toBe(true);
    expect(blocked.sandbox.decision).toBe("ask");
    expect(blocked.status).toBe("failed");
  });

  it("soft-runs node after approvalResolved", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-run-"));
    const result = await runSandboxedCommand({
      cwd: root,
      command: {
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeoutMs: 2_000,
      },
      approvalResolved: true,
    });
    expect(result.status).toBe("passed");
    expect(result.blocked).toBeFalsy();
  });

  it("loads sandbox.json defaults", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-cfg-"));
    expect(loadShellSandboxConfig(root).networkAccess).toBe(false);
    mkdirSync(join(root, ".projectos"), { recursive: true });
    writeFileSync(
      join(root, ".projectos", "sandbox.json"),
      JSON.stringify({ version: "0.1.0", networkAccess: true }),
      "utf8",
    );
    expect(loadShellSandboxConfig(root).networkAccess).toBe(true);
  });

  it("runHarnessShell loads permissions.json when rules are omitted", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-load-"));
    mkdirSync(join(root, ".projectos"), { recursive: true });
    writeFileSync(
      join(root, ".projectos", "permissions.json"),
      JSON.stringify({
        version: "0.1.0",
        rules: [{ effect: "allow", tool: "shell" }],
      }),
      "utf8",
    );
    const result = await runHarnessShell({
      workspaceRoot: root,
      command: {
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeoutMs: 2_000,
      },
      policy: writeCapabilityContext({ allowedWritePaths: ["src/a.ts"] }),
      sandboxApprovalResolved: true,
    });
    expect(result.status).toBe("passed");
  });

  it("runHarnessShell requires shell allow rule", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-pol-"));
    await expect(
      runHarnessShell({
        workspaceRoot: root,
        command: {
          command: process.execPath,
          args: ["-e", "process.exit(0)"],
          timeoutMs: 1_000,
        },
        policy: writeCapabilityContext({ allowedWritePaths: ["src/a.ts"] }),
        permissionRules: [],
      }),
    ).rejects.toMatchObject({ code: "tool_policy_denied" });
  });

  it("runHarnessShell runs when allow rule + sandboxed binary", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-ok-"));
    const result = await runHarnessShell({
      workspaceRoot: root,
      command: {
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeoutMs: 2_000,
      },
      policy: writeCapabilityContext({ allowedWritePaths: ["src/a.ts"] }),
      permissionRules: [{ effect: "allow", tool: "shell" }],
      sandboxApprovalResolved: true,
    });
    expect(result.status).toBe("passed");
  });
});
