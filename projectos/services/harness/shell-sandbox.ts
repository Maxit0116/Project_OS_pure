import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

import type { ExecCommand, VerificationCommandResult } from "../../contracts/exec-command.js";
import {
  ShellSandboxClassificationSchema,
  ShellSandboxConfigSchema,
  type ShellSandboxClassification,
  type ShellSandboxConfig,
} from "../../contracts/shell-sandbox.js";

const SANDBOX_FILE = ".projectos/sandbox.json";
const OUTPUT_LIMIT_BYTES = 64 * 1024;

/** Paths agents must not mutate (Cursor-aligned protected set, relative). */
export const PROTECTED_PATH_SUFFIXES = [
  ".git/config",
  ".git/hooks",
  ".cursorignore",
  ".projectos/permissions.json",
  ".projectos/sandbox.json",
] as const;

const NETWORK_BINARIES = new Set([
  "curl",
  "wget",
  "nc",
  "ncat",
  "netcat",
  "ssh",
  "scp",
  "sftp",
  "ftp",
  "telnet",
  "fetch",
]);

/** Binaries we are willing to soft-run without OS isolation (v0). */
const SOFT_SAFE_BINARIES = new Set([
  "node",
  "nodejs",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "deno",
  "vitest",
  "tsc",
  "eslint",
  "prettier",
  "python",
  "python3",
  "pip",
  "pip3",
  "cargo",
  "go",
  "rustc",
  "make",
  "cmake",
]);

export function loadShellSandboxConfig(workspaceRoot: string): ShellSandboxConfig {
  const absolute = join(workspaceRoot, SANDBOX_FILE);
  if (!existsSync(absolute)) {
    return ShellSandboxConfigSchema.parse({ version: "0.1.0" });
  }
  try {
    const raw = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
    return ShellSandboxConfigSchema.parse(raw);
  } catch {
    return ShellSandboxConfigSchema.parse({ version: "0.1.0" });
  }
}

function detectPlatform(): ShellSandboxClassification["platform"] {
  if (process.platform === "darwin") return "darwin";
  if (process.platform === "linux") return "linux";
  if (process.platform === "win32") return "win32";
  return "other";
}

function commandBaseName(command: string): string {
  const base = basename(command).toLowerCase();
  return base.replace(/\.exe$/u, "");
}

function isSoftSafeBinary(command: string): boolean {
  const base = commandBaseName(command);
  if (SOFT_SAFE_BINARIES.has(base)) return true;
  // Allow the current Node runtime path (verification tests use process.execPath).
  try {
    if (resolve(command) === resolve(process.execPath)) return true;
  } catch {
    /* ignore */
  }
  return base === commandBaseName(process.execPath);
}

function looksLikeNetworkBinary(command: string): boolean {
  return NETWORK_BINARIES.has(commandBaseName(command));
}

function touchesProtectedPath(
  workspaceRoot: string,
  args: readonly string[],
): string | undefined {
  const root = resolve(workspaceRoot);
  for (const arg of args) {
    if (!arg || arg.startsWith("-")) continue;
    const candidate = isAbsolute(arg) ? normalize(arg) : resolve(root, arg);
    let rel: string;
    try {
      rel = relative(root, candidate).replace(/\\/gu, "/");
    } catch {
      continue;
    }
    if (rel.startsWith("..")) continue;
    for (const suffix of PROTECTED_PATH_SUFFIXES) {
      if (rel === suffix || rel.endsWith(`/${suffix}`)) {
        return suffix;
      }
    }
    // Block mutating .git/* and .projectos internals broadly for soft policy.
    if (rel === ".git" || rel.startsWith(".git/")) {
      return ".git/";
    }
    if (
      rel.startsWith(".projectos/") &&
      !rel.startsWith(".projectos/plans/") &&
      !rel.startsWith(".projectos/harness/")
    ) {
      // Allow reading plans/harness artifacts in args; block other .projectos writes heuristically.
      if (/\b(rm|mv|cp|chmod|chown|unlink|rmdir)\b/iu.test(args.join(" "))) {
        return ".projectos/";
      }
    }
  }
  return undefined;
}

function argsEscapeWorkspace(
  workspaceRoot: string,
  args: readonly string[],
): boolean {
  const root = resolve(workspaceRoot);
  for (const arg of args) {
    if (!arg || arg.startsWith("-")) continue;
    if (!isAbsolute(arg) && !arg.includes(sep) && !arg.includes("/")) continue;
    if (!isAbsolute(arg) && !arg.startsWith(".") && !arg.includes("/")) continue;
    // Absolute paths must stay under workspace.
    if (isAbsolute(arg)) {
      const normalized = resolve(arg);
      const rel = relative(root, normalized);
      if (rel.startsWith("..") || isAbsolute(rel)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Classify a structured argv invocation for soft sandbox execution.
 * Unknown / unsafe → `ask`. Protected / hard-block → `deny`.
 * Never returns a "full access" path.
 */
export function classifyShellInvocation(input: {
  workspaceRoot: string;
  command: string;
  args: readonly string[];
  config?: ShellSandboxConfig;
}): ShellSandboxClassification {
  const config = input.config ?? ShellSandboxConfigSchema.parse({ version: "0.1.0" });
  const reasons: string[] = [];
  const platform = detectPlatform();
  const softOnly = true; // v0: no Seatbelt/Landlock integration yet

  const protectedHit = touchesProtectedPath(input.workspaceRoot, [
    input.command,
    ...input.args,
  ]);
  if (protectedHit) {
    return ShellSandboxClassificationSchema.parse({
      decision: "deny",
      reasons: [`protected_path:${protectedHit}`],
      softOnly,
      platform,
    });
  }

  if (looksLikeNetworkBinary(input.command) && !config.networkAccess) {
    return ShellSandboxClassificationSchema.parse({
      decision: "ask",
      reasons: ["network_binary_requires_approval_or_networkAccess"],
      softOnly,
      platform,
    });
  }

  if (argsEscapeWorkspace(input.workspaceRoot, input.args)) {
    reasons.push("absolute_path_outside_workspace");
    return ShellSandboxClassificationSchema.parse({
      decision: "ask",
      reasons,
      softOnly,
      platform,
    });
  }

  if (!isSoftSafeBinary(input.command)) {
    reasons.push("unknown_binary_requires_approval");
    reasons.push("os_sandbox_unavailable_soft_only");
    return ShellSandboxClassificationSchema.parse({
      decision: "ask",
      reasons,
      softOnly,
      platform,
    });
  }

  if (softOnly) {
    reasons.push("soft_sandbox_v0");
  }

  return ShellSandboxClassificationSchema.parse({
    decision: "sandboxed",
    reasons,
    softOnly,
    platform,
  });
}

function buildSandboxedEnv(config: ShellSandboxConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.PROJECTOS_SANDBOX = "1";
  env.PROJECTOS_SANDBOX_NETWORK = config.networkAccess ? "1" : "0";
  if (!config.networkAccess) {
    for (const key of [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "ALL_PROXY",
      "http_proxy",
      "https_proxy",
      "all_proxy",
      "FTP_PROXY",
      "ftp_proxy",
    ]) {
      delete env[key];
    }
  }
  return env;
}

export interface RunSandboxedCommandInput {
  command: ExecCommand;
  cwd: string;
  config?: ShellSandboxConfig;
  /**
   * When true, `ask` classifications may soft-run (caller already obtained
   * human approval, e.g. verification command-set approval). `deny` still blocks.
   */
  approvalResolved?: boolean;
}

export interface RunSandboxedCommandResult extends VerificationCommandResult {
  sandbox: ShellSandboxClassification;
  blocked?: boolean;
}

/**
 * Run a command under soft sandbox policy. Does not escalate to full access.
 */
export async function runSandboxedCommand(
  input: RunSandboxedCommandInput,
): Promise<RunSandboxedCommandResult> {
  const config = input.config ?? loadShellSandboxConfig(input.cwd);
  const classification = classifyShellInvocation({
    workspaceRoot: input.cwd,
    command: input.command.command,
    args: input.command.args,
    config,
  });

  if (classification.decision === "deny") {
    return {
      command: input.command,
      status: "failed",
      exitCode: null,
      durationMs: 0,
      timedOut: false,
      outputTruncated: false,
      output: `shell_sandbox_deny: ${classification.reasons.join("; ")}`,
      sandbox: classification,
      blocked: true,
    };
  }

  if (classification.decision === "ask" && !input.approvalResolved) {
    return {
      command: input.command,
      status: "failed",
      exitCode: null,
      durationMs: 0,
      timedOut: false,
      outputTruncated: false,
      output: `shell_sandbox_ask: ${classification.reasons.join("; ")}`,
      sandbox: classification,
      blocked: true,
    };
  }

  // ask + approvalResolved, or sandboxed → soft-run (still no full-access env).
  const result = await spawnCaptured(input.command, input.cwd, config);
  return { ...result, sandbox: classification };
}

function spawnCaptured(
  command: ExecCommand,
  cwd: string,
  config: ShellSandboxConfig,
): Promise<VerificationCommandResult> {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    let outputBytes = 0;
    let outputTruncated = false;
    let timedOut = false;
    let settled = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    const child = spawn(command.command, command.args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: buildSandboxedEnv(config),
    });

    let output = "";
    let stdout = "";
    let stderr = "";
    const appendStream = (bucket: "stdout" | "stderr", chunk: Uint8Array): void => {
      const current = bucket === "stdout" ? stdout : stderr;
      if (current.length >= OUTPUT_LIMIT_BYTES) return;
      const piece = Buffer.from(chunk).toString("utf8");
      const next = (current + piece).slice(0, OUTPUT_LIMIT_BYTES);
      if (bucket === "stdout") stdout = next;
      else stderr = next;
    };
    const appendOutput = (bucket: "stdout" | "stderr", chunk: Uint8Array): void => {
      appendStream(bucket, chunk);
      outputBytes += chunk.byteLength;
      if (outputBytes > OUTPUT_LIMIT_BYTES) {
        outputTruncated = true;
        if (output.length < OUTPUT_LIMIT_BYTES) {
          const remaining = OUTPUT_LIMIT_BYTES - output.length;
          output += Buffer.from(chunk).toString("utf8", 0, remaining);
        }
        return;
      }
      output += Buffer.from(chunk).toString("utf8");
    };
    child.stdout?.on("data", (chunk: Uint8Array) => appendOutput("stdout", chunk));
    child.stderr?.on("data", (chunk: Uint8Array) => appendOutput("stderr", chunk));

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 1_000);
    }, command.timeoutMs);

    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolvePromise({
        command,
        status: !timedOut && exitCode === 0 ? "passed" : "failed",
        exitCode,
        durationMs: Date.now() - started,
        timedOut,
        outputTruncated,
        ...(output ? { output } : {}),
        ...(stdout ? { stdout } : {}),
        ...(stderr ? { stderr } : {}),
      });
    };

    child.once("error", () => finish(null));
    child.once("close", (code) => finish(code));
  });
}
