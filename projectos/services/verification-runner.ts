import { spawn } from "node:child_process";

import type {
  ExecCommand,
  VerificationCommandResult,
} from "../contracts/exec-command.js";

const OUTPUT_LIMIT_BYTES = 64 * 1024;

export class VerificationRunner {
  async run(
    commands: ExecCommand[],
    cwd: string,
  ): Promise<VerificationCommandResult[]> {
    const results: VerificationCommandResult[] = [];
    for (const command of commands) {
      results.push(await runCommand(command, cwd));
    }
    return results;
  }
}

function runCommand(
  command: ExecCommand,
  cwd: string,
): Promise<VerificationCommandResult> {
  return new Promise((resolve) => {
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
    });

    let output = "";
    const appendOutput = (chunk: Uint8Array): void => {
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
    child.stdout?.on("data", appendOutput);
    child.stderr?.on("data", appendOutput);

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
      resolve({
        command,
        status: !timedOut && exitCode === 0 ? "passed" : "failed",
        exitCode,
        durationMs: Date.now() - started,
        timedOut,
        outputTruncated,
        ...(output ? { output } : {}),
      });
    };

    child.once("error", () => finish(null));
    child.once("close", (code) => finish(code));
  });
}
