import type { ExecCommand } from "../../contracts/exec-command.js";
import type { ToolResult } from "../../contracts/tool-result.js";
import type {
  CapabilityContext,
  HarnessToolName,
  ToolPermissionRule,
} from "../../contracts/tool-policy.js";
import { ProjectOSError } from "../../errors.js";
import {
  latestAllow,
  recordedAllow,
  recordAuditApproval,
  shellCommandHash,
} from "./audit.js";
import { loadToolPermissionDocument } from "./permissions.js";
import { evaluateToolCall } from "./tool-policy.js";
import { deniedToolResult, shellCommandToToolResult } from "./tool-result.js";
import {
  loadShellSandboxConfig,
  runSandboxedCommand,
  type RunSandboxedCommandResult,
} from "./shell-sandbox.js";

export interface RunHarnessShellInput {
  workspaceRoot: string;
  command: ExecCommand;
  policy: CapabilityContext;
  /**
   * Policy tool id. Verification uses `run_verification` (allowed for
   * write-capable modes unless permissions deny). Generic shells stay `shell`.
   */
  policyTool?: "shell" | "run_verification";
  /**
   * Omit to load `.projectos/permissions.json`. Pass `[]` to ignore the file.
   */
  permissionRules?: readonly ToolPermissionRule[];
  /**
   * When true, sandbox `ask` may soft-run (human already approved this argv set).
   * ToolPolicy `ask` still blocks unless `policyAskResolved` is also true.
   */
  sandboxApprovalResolved?: boolean;
  /**
   * Ignored for authorization. An in-memory flag is not an approval.
   * Shell `ask` runs only when `auditDirectory` already contains an allow
   * for this command hash.
   */
  policyAskResolved?: boolean;
  /** User-data directory for durable approvals. Omit to leave asks unapproved. */
  auditDirectory?: string;
  /** Cancelling uses the same process cleanup as a timeout. */
  signal?: AbortSignal;
}

export interface RunHarnessShellResult extends RunSandboxedCommandResult {
  toolResult: ToolResult;
}

/**
 * Unified shell entry: ToolPolicy → soft sandbox → spawn.
 * Never silently escalates to full machine access.
 * Policy deny throws before spawn and attaches `details.toolResult` with `ok: false`.
 */
export async function runHarnessShell(
  input: RunHarnessShellInput,
): Promise<RunHarnessShellResult> {
  const match = [input.command.command, ...input.command.args].join(" ");
  const policyTool = input.policyTool ?? "shell";
  const permissionRules =
    input.permissionRules ??
    loadToolPermissionDocument(input.workspaceRoot).rules;
  const decision = evaluateToolCall(
    { tool: policyTool, match },
    input.policy,
    { rules: permissionRules },
  );

  const commandSetHash = shellCommandHash(input.command);
  if (decision.decision === "deny") {
    if (input.auditDirectory) {
      recordAuditApproval(input.auditDirectory, {
        tool: policyTool,
        decision: "deny",
        commandSetHash,
      });
    }
    throw new ProjectOSError("tool_policy_denied", decision.reason, {
      details: {
        tool: policyTool,
        decision: decision.decision,
        match,
        toolResult: deniedToolResult(policyTool, decision.reason),
      },
    });
  }

  const shellApproved = policyTool === "shell" &&
    input.auditDirectory !== undefined &&
    recordedAllow(latestAllow(input.auditDirectory, commandSetHash));
  const verificationApproved = policyTool === "run_verification" &&
    input.policyAskResolved === true;
  if (decision.decision === "ask" && !shellApproved && !verificationApproved) {
    return withToolResult(policyTool, {
      command: input.command,
      status: "failed",
      exitCode: null,
      durationMs: 0,
      timedOut: false,
      outputTruncated: false,
      output: `tool_policy_ask: ${decision.reason}`,
      sandbox: {
        decision: "ask",
        reasons: ["tool_policy_ask", decision.reason],
        softOnly: true,
        platform:
          process.platform === "darwin"
            ? "darwin"
            : process.platform === "linux"
              ? "linux"
              : process.platform === "win32"
                ? "win32"
                : "other",
      },
      blocked: true,
    });
  }

  const config = loadShellSandboxConfig(input.workspaceRoot);
  const sandboxed = await runSandboxedCommand({
    command: input.command,
    cwd: input.workspaceRoot,
    config,
    approvalResolved: Boolean(input.sandboxApprovalResolved),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return withToolResult(policyTool, sandboxed);
}

function withToolResult(
  tool: Extract<HarnessToolName, "shell" | "run_verification">,
  result: RunSandboxedCommandResult,
): RunHarnessShellResult {
  return {
    ...result,
    toolResult: shellCommandToToolResult(tool, result),
  };
}
