import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { ShellSandboxConfigSchema } from "../../contracts/shell-sandbox.js";
import { recordAuditApproval, shellCommandHash } from "./audit.js";
import { writeCapabilityContext } from "./tool-policy.js";
import { runHarnessShell } from "./run-shell.js";
import {
  SOFT_RUN_CONCURRENCY_LIMIT,
  classifyShellInvocation,
  loadShellSandboxConfig,
  runSandboxedCommand,
} from "./shell-sandbox.js";

const spawnCalls = vi.hoisted(() => ({
  calls: [] as unknown[][],
}));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>(
    "node:child_process",
  );
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => {
      spawnCalls.calls.push(args);
      return actual.spawn(...args);
    },
  };
});

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

  it("does not run an asked shell from an in-memory approval flag", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-ask-"));
    const command = {
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      timeoutMs: 2_000,
    };
    const blocked = await runHarnessShell({
      workspaceRoot: root,
      command,
      policy: writeCapabilityContext({ allowedWritePaths: ["src/a.ts"] }),
      permissionRules: [{ effect: "ask", tool: "shell" }],
      policyAskResolved: true,
      sandboxApprovalResolved: true,
    });
    expect(blocked.blocked).toBe(true);
    expect(blocked.status).toBe("failed");

    const auditDirectory = mkdtempSync(join(tmpdir(), "pos-sbx-audit-"));
    recordAuditApproval(auditDirectory, {
      tool: "shell",
      decision: "allow",
      commandSetHash: shellCommandHash(command),
    });
    const allowed = await runHarnessShell({
      workspaceRoot: root,
      command,
      policy: writeCapabilityContext({ allowedWritePaths: ["src/a.ts"] }),
      permissionRules: [{ effect: "ask", tool: "shell" }],
      sandboxApprovalResolved: true,
      auditDirectory,
    });
    expect(allowed.status).toBe("passed");

    const reloaded = mkdtempSync(join(tmpdir(), "pos-sbx-empty-"));
    const forgotten = await runHarnessShell({
      workspaceRoot: root,
      command,
      policy: writeCapabilityContext({ allowedWritePaths: ["src/a.ts"] }),
      permissionRules: [{ effect: "ask", tool: "shell" }],
      policyAskResolved: true,
      sandboxApprovalResolved: true,
      auditDirectory: reloaded,
    });
    expect(forgotten.blocked).toBe(true);
  });

  it("spawns with shell false and keeps classification on", async () => {
    expect(
      ShellSandboxConfigSchema.safeParse({
        version: "0.1.0",
        disableClassification: true,
      }).success,
    ).toBe(false);

    const root = mkdtempSync(join(tmpdir(), "pos-sbx-shell-"));
    spawnCalls.calls.length = 0;
    await runSandboxedCommand({
      cwd: root,
      command: {
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeoutMs: 2_000,
      },
    });
    expect(spawnCalls.calls.length).toBeGreaterThan(0);
    const options = spawnCalls.calls.at(-1)?.[2] as { shell?: boolean };
    expect(options.shell).toBe(false);
  });

  it("rejects a command past the workspace concurrency limit", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-cap-"));
    const controllers: AbortController[] = [];
    const holds = Array.from({ length: SOFT_RUN_CONCURRENCY_LIMIT }, (_, index) => {
      const ready = join(root, `ready-${index}`);
      const controller = new AbortController();
      controllers.push(controller);
      const pending = runSandboxedCommand({
        cwd: root,
        command: {
          command: process.execPath,
          args: [
            "-e",
            `require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready'); setInterval(() => {}, 1e9);`,
          ],
          timeoutMs: 30_000,
        },
        signal: controller.signal,
      });
      return { ready, pending };
    });

    try {
      await Promise.all(holds.map((hold) => waitForFile(hold.ready, 5_000)));
      const marker = join(root, "sneak.txt");
      const rejected = await runSandboxedCommand({
        cwd: root,
        command: {
          command: process.execPath,
          args: [
            "-e",
            `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`,
          ],
          timeoutMs: 2_000,
        },
      });
      expect(rejected.concurrencyRejected).toBe(true);
      expect(rejected.blocked).toBe(true);
      expect(rejected.status).toBe("failed");
      expect(existsSync(marker)).toBe(false);
    } finally {
      for (const controller of controllers) controller.abort();
      await Promise.all(holds.map((hold) => hold.pending));
    }

    const after = await runSandboxedCommand({
      cwd: root,
      command: {
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        timeoutMs: 2_000,
      },
    });
    expect(after.status).toBe("passed");
  }, 20_000);

  it("kills the spawned process group when the run is cancelled", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-kill-"));
    const grandPidFile = join(root, "grand.pid");
    const controller = new AbortController();
    const pending = runHarnessShell({
      workspaceRoot: root,
      command: {
        command: process.execPath,
        args: [
          "-e",
          `const { spawn } = require('node:child_process'); const pidFile = ${JSON.stringify(grandPidFile)}; spawn(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1e9);', pidFile], { stdio: 'ignore' }); setInterval(() => {}, 1e9);`,
        ],
        timeoutMs: 30_000,
      },
      policy: writeCapabilityContext({ allowedWritePaths: ["src/a.ts"] }),
      permissionRules: [{ effect: "allow", tool: "shell" }],
      signal: controller.signal,
    });

    let grandPid = 0;
    try {
      grandPid = Number(await waitForFile(grandPidFile, 5_000));
      expect(Number.isInteger(grandPid)).toBe(true);
      expect(isAlive(grandPid)).toBe(true);
      controller.abort();
      const result = await pending;
      expect(result.cancelled).toBe(true);
      expect(result.status).toBe("failed");
      expect(result.toolResult.ok).toBe(false);
      expect(result.toolResult.summary).toContain("Cancelled");
      if (process.platform === "win32") {
        expect(result.processCleanup).toBe("direct-child-only");
      } else {
        expect(result.processCleanup).toBe("process-group");
        await waitUntil(() => !isAlive(grandPid), 3_000);
        expect(isAlive(grandPid)).toBe(false);
      }
    } finally {
      controller.abort();
      await pending.catch(() => undefined);
      if (grandPid && isAlive(grandPid)) {
        try {
          process.kill(grandPid, "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }
  }, 20_000);

  it("fails the result when an allowed command changes protected files", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-sbx-watch-"));
    const permissions = join(root, ".projectos", "permissions.json");
    mkdirSync(join(root, ".projectos"), { recursive: true });
    writeFileSync(
      permissions,
      JSON.stringify({ version: "0.1.0", rules: [] }),
      "utf8",
    );
    const rewritten = JSON.stringify({
      version: "0.1.0",
      rules: [{ effect: "allow", tool: "shell" }],
    });
    const result = await runHarnessShell({
      workspaceRoot: root,
      command: {
        command: process.execPath,
        args: [
          "-e",
          `require('node:fs').writeFileSync(${JSON.stringify(permissions)}, ${JSON.stringify(rewritten)})`,
        ],
        timeoutMs: 2_000,
      },
      policy: writeCapabilityContext({ allowedWritePaths: ["src/a.ts"] }),
      permissionRules: [{ effect: "allow", tool: "shell" }],
    });

    expect(result.status).toBe("failed");
    expect(result.protectedPathsChanged).toBe(true);
    expect(result.toolResult.ok).toBe(false);
    expect(result.toolResult.summary).toContain("Protected files changed");
    expect(readFileSync(permissions, "utf8")).toBe(rewritten);
  });
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForFile(path: string, timeoutMs: number): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (existsSync(path)) return readFileSync(path, "utf8");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error(`timed out waiting for ${path}`);
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
}
