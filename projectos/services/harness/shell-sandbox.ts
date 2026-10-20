import { createHash } from "node:crypto";
import * as childProcess from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
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

/**
 * Soft-runs allowed at once for one workspace. Extra commands are rejected
 * in the result envelope. This is not a CPU or memory quota.
 */
export const SOFT_RUN_CONCURRENCY_LIMIT = 4;

/** How a started command's processes were stopped. Absent when nothing spawned. */
export type ProcessCleanupMode = "process-group" | "direct-child-only" | "failed";

const inflightSoftRuns = new Map<string, number>();

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
  /** Cancelling uses the same process cleanup as a timeout. */
  signal?: AbortSignal;
}

export interface RunSandboxedCommandResult extends VerificationCommandResult {
  sandbox: ShellSandboxClassification;
  blocked?: boolean;
  cancelled?: boolean;
  /** Set only after a process was started, or when cleanup itself failed. */
  processCleanup?: ProcessCleanupMode;
  /** True when a protected sandbox or permission file changed during the run. */
  protectedPathsChanged?: boolean;
  concurrencyRejected?: boolean;
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

  if (input.signal?.aborted) {
    return {
      command: input.command,
      status: "failed",
      exitCode: null,
      durationMs: 0,
      timedOut: false,
      outputTruncated: false,
      output: "shell_cancelled: command was not run",
      sandbox: classification,
      blocked: true,
      cancelled: true,
    };
  }

  const workspaceKey = resolve(input.cwd);
  if (!acquireSoftRun(workspaceKey)) {
    return {
      command: input.command,
      status: "failed",
      exitCode: null,
      durationMs: 0,
      timedOut: false,
      outputTruncated: false,
      output: `shell_concurrency_limit: ${SOFT_RUN_CONCURRENCY_LIMIT}`,
      sandbox: classification,
      blocked: true,
      concurrencyRejected: true,
    };
  }

  try {
    const before = fingerprintProtectedPaths(input.cwd);
    const result = await spawnCaptured(input.command, input.cwd, config, input.signal);
    const protectedPathsChanged = fingerprintProtectedPaths(input.cwd) !== before;
    const notice = "protected_paths_changed: review sandbox and permission files";
    return {
      ...result,
      status: protectedPathsChanged ? "failed" : result.status,
      sandbox: classification,
      ...(protectedPathsChanged
        ? {
            protectedPathsChanged: true,
            output: result.output ? `${result.output}\n${notice}` : notice,
          }
        : {}),
    };
  } finally {
    releaseSoftRun(workspaceKey);
  }
}

function acquireSoftRun(workspaceKey: string): boolean {
  const current = inflightSoftRuns.get(workspaceKey) ?? 0;
  if (current >= SOFT_RUN_CONCURRENCY_LIMIT) return false;
  inflightSoftRuns.set(workspaceKey, current + 1);
  return true;
}

function releaseSoftRun(workspaceKey: string): void {
  const current = inflightSoftRuns.get(workspaceKey) ?? 0;
  if (current <= 1) inflightSoftRuns.delete(workspaceKey);
  else inflightSoftRuns.set(workspaceKey, current - 1);
}

function fingerprintProtectedPaths(workspaceRoot: string): string {
  const hash = createHash("sha256");
  for (const suffix of PROTECTED_PATH_SUFFIXES) {
    hash.update(suffix);
    hash.update("\0");
    hash.update(fingerprintPath(join(workspaceRoot, suffix)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function fingerprintPath(absolute: string): string {
  if (!existsSync(absolute)) return "absent";
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(absolute);
  } catch {
    return "unreadable";
  }
  if (stat.isSymbolicLink()) {
    try {
      return `link:${readlinkSync(absolute)}`;
    } catch {
      return "link:unreadable";
    }
  }
  if (stat.isDirectory()) {
    const hash = createHash("sha256");
    let names: string[] = [];
    try {
      names = readdirSync(absolute).sort();
    } catch {
      return "dir:unreadable";
    }
    for (const name of names) {
      hash.update(name);
      hash.update("\0");
      hash.update(fingerprintPath(join(absolute, name)));
      hash.update("\0");
    }
    return hash.digest("hex");
  }
  if (!stat.isFile()) return "other";
  try {
    return createHash("sha256").update(readFileSync(absolute)).digest("hex");
  } catch {
    return "file:unreadable";
  }
}

function spawnCaptured(
  command: ExecCommand,
  cwd: string,
  config: ShellSandboxConfig,
  signal?: AbortSignal,
): Promise<
  VerificationCommandResult & {
    cancelled: boolean;
    processCleanup: ProcessCleanupMode;
  }
> {
  const useProcessGroup = process.platform !== "win32";
  return new Promise((resolvePromise) => {
    const started = Date.now();
    let outputBytes = 0;
    let outputTruncated = false;
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
    let processCleanup: ProcessCleanupMode = useProcessGroup
      ? "process-group"
      : "direct-child-only";

    const child = childProcess.spawn(command.command, command.args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: buildSandboxedEnv(config),
      detached: useProcessGroup,
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

    const stopChild = (signalName: NodeJS.Signals): void => {
      const pid = child.pid;
      if (pid === undefined) {
        processCleanup = "failed";
        return;
      }
      if (useProcessGroup) {
        try {
          process.kill(-pid, signalName);
          return;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "ESRCH") return;
        }
      }
      try {
        child.kill(signalName);
        if (useProcessGroup) processCleanup = "direct-child-only";
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ESRCH") processCleanup = "failed";
      }
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      stopChild("SIGTERM");
      forceKillTimer = setTimeout(() => stopChild("SIGKILL"), 1_000);
    }, command.timeoutMs);

    const onAbort = (): void => {
      if (settled || cancelled || timedOut) return;
      cancelled = true;
      clearTimeout(timeout);
      stopChild("SIGTERM");
      forceKillTimer = setTimeout(() => stopChild("SIGKILL"), 1_000);
    };

    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      signal?.removeEventListener("abort", onAbort);
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolvePromise({
        command,
        status: !timedOut && !cancelled && exitCode === 0 ? "passed" : "failed",
        exitCode,
        durationMs: Date.now() - started,
        timedOut,
        outputTruncated,
        cancelled,
        processCleanup,
        ...(output ? { output } : {}),
        ...(stdout ? { stdout } : {}),
        ...(stderr ? { stderr } : {}),
      });
    };

    child.once("error", () => finish(null));
    child.once("close", (code) => finish(code));
  });
}
