import type {
  ExecCommand,
  VerificationCommandResult,
} from "../contracts/exec-command.js";
import type { ToolResult } from "../contracts/tool-result.js";
import { runHarnessShell } from "./harness/run-shell.js";
import { writeCapabilityContext } from "./harness/tool-policy.js";

export interface VerificationCommandExecution extends VerificationCommandResult {
  toolResult: ToolResult;
}

export class VerificationRunner {
  /**
   * Run configured verification commands through the harness shell entry
   * (ToolPolicy `run_verification` → soft sandbox → spawn).
   *
   * Caller must already have obtained verification command-set approval.
   * That approval resolves sandbox `ask` and ToolPolicy `ask`. Deny still blocks.
   * Permission rules load from `.projectos/permissions.json` when present.
   */
  async run(
    commands: ExecCommand[],
    cwd: string,
    signal?: AbortSignal,
  ): Promise<VerificationCommandExecution[]> {
    const policy = writeCapabilityContext({
      mode: "change",
      allowedWritePaths: [],
    });
    const results: VerificationCommandExecution[] = [];
    for (const command of commands) {
      if (signal?.aborted) {
        results.push({
          command,
          status: "failed",
          exitCode: null,
          durationMs: 0,
          timedOut: false,
          outputTruncated: false,
          output: "Verification cancelled before the command started.",
          toolResult: {
            tool: "run_verification",
            ok: false,
            exitCode: null,
            summary: "Verification cancelled before the command started.",
            output: "",
            truncated: false,
          },
        });
        continue;
      }
      const sandboxed = await runHarnessShell({
        workspaceRoot: cwd,
        command,
        policy,
        policyTool: "run_verification",
        sandboxApprovalResolved: true,
        policyAskResolved: true,
        ...(signal ? { signal } : {}),
      });
      results.push({
        command: sandboxed.command,
        status: sandboxed.status,
        exitCode: sandboxed.exitCode,
        durationMs: sandboxed.durationMs,
        timedOut: sandboxed.timedOut,
        outputTruncated: sandboxed.outputTruncated,
        ...(sandboxed.output !== undefined ? { output: sandboxed.output } : {}),
        ...(sandboxed.stdout !== undefined ? { stdout: sandboxed.stdout } : {}),
        ...(sandboxed.stderr !== undefined ? { stderr: sandboxed.stderr } : {}),
        toolResult: sandboxed.toolResult,
      });
    }
    return results;
  }
}
