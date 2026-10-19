import type { ExecCommand } from "../../contracts/exec-command.js";
import type {
  CapabilityContext,
  ToolPermissionRule,
} from "../../contracts/tool-policy.js";
import { ProjectOSError } from "../../errors.js";
import { loadToolPermissionDocument } from "./permissions.js";
import { evaluateToolCall } from "./tool-policy.js";
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
  policyAskResolved?: boolean;
}

/**
 * Unified shell entry: ToolPolicy → soft sandbox → spawn.
 * Never silently escalates to full machine access.
 */
export async function runHarnessShell(
  input: RunHarnessShellInput,
): Promise<RunSandboxedCommandResult> {
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

  if (decision.decision === "deny") {
    throw new ProjectOSError("tool_policy_denied", decision.reason, {
      details: { tool: policyTool, decision: decision.decision, match },
    });
  }

  if (decision.decision === "ask" && !input.policyAskResolved) {
    return {
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
    };
  }

  const config = loadShellSandboxConfig(input.workspaceRoot);
  return runSandboxedCommand({
    command: input.command,
    cwd: input.workspaceRoot,
    config,
    approvalResolved: Boolean(input.sandboxApprovalResolved),
  });
}
