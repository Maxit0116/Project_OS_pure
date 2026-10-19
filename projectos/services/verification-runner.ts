import type {
  ExecCommand,
  VerificationCommandResult,
} from "../contracts/exec-command.js";
import { runHarnessShell } from "./harness/run-shell.js";
import { writeCapabilityContext } from "./harness/tool-policy.js";

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
  ): Promise<VerificationCommandResult[]> {
    const policy = writeCapabilityContext({
      mode: "change",
      allowedWritePaths: [],
    });
    const results: VerificationCommandResult[] = [];
    for (const command of commands) {
      const sandboxed = await runHarnessShell({
        workspaceRoot: cwd,
        command,
        policy,
        policyTool: "run_verification",
        sandboxApprovalResolved: true,
        policyAskResolved: true,
      });
      const { sandbox: _sandbox, blocked: _blocked, ...result } = sandboxed;
      results.push(result);
    }
    return results;
  }
}
