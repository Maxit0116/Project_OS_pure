import type { ExecCommand } from "../contracts/exec-command.js";
import type { CapabilityContext, ToolPermissionRule } from "../contracts/tool-policy.js";
import { evaluateToolCall } from "./harness/tool-policy.js";

const HIGH_RISK =
  /\b(rm\s+-rf|sudo|mkfs|dd\s+if=|shutdown|reboot|curl\s+[^\n]*\|\s*sh|:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;|:|\bchmod\s+-R\s+777\b)/i;

export function isHighRiskTerminalCommand(commandLine: string): boolean {
  return HIGH_RISK.test(commandLine.trim());
}

/**
 * Parse `command` from Action payload / node goal into ExecCommand.
 * Supports simple shell words; does not expand globs or pipes.
 */
export function parseTerminalExecCommand(input: {
  payload?: Record<string, unknown>;
  nodeGoal?: string;
  timeoutMs?: number;
}): ExecCommand {
  const raw =
    (typeof input.payload?.command === "string" && input.payload.command.trim()) ||
    (typeof input.payload?.cmd === "string" && input.payload.cmd.trim()) ||
    (input.nodeGoal ?? "").trim() ||
    "echo";
  const timeoutMs =
    typeof input.payload?.timeoutMs === "number"
      ? Math.min(300_000, Math.max(100, Math.floor(input.payload.timeoutMs)))
      : (input.timeoutMs ?? 30_000);

  const parts = raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [raw];
  const tokens = parts.map((part) => part.replace(/^['"]|['"]$/g, ""));
  const command = tokens[0] || "echo";
  const args = tokens.slice(1);
  return { command, args, timeoutMs };
}

export function evaluateTerminalPolicyDecision(input: {
  command: ExecCommand;
  policy: CapabilityContext;
  permissionRules?: readonly ToolPermissionRule[];
}): "allow" | "deny" | "ask" {
  const match = [input.command.command, ...input.command.args].join(" ");
  const decision = evaluateToolCall(
    { tool: "shell", match },
    input.policy,
    { rules: input.permissionRules ?? [{ effect: "allow", tool: "shell" }] },
  );
  return decision.decision;
}
