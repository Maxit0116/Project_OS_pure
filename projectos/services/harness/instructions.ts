import type { HarnessCapabilityMode } from "../../contracts/tool-policy.js";
import { renderMemoryFence } from "./memory.js";

export interface HarnessSkillBody {
  name: string;
  body: string;
}

export interface BuildHarnessInstructionsInput {
  /** Core system prompt for this mode / agent profile. */
  baseSystemPrompt: string;
  mode: HarnessCapabilityMode;
  /** Always-on project rules (from `.projectos/rules`). */
  rulesMarkdown?: string;
  /**
   * Injectable memory index lines only (candidate / corroborated).
   * Wrapped as a non-authoritative fence. Empty skips the section.
   */
  memoryIndexMarkdown?: string;
  /** On-demand skills (invoked or Custom Mode). */
  skillBodies?: readonly HarnessSkillBody[];
  /** Optional per-model delta (H4); empty today. */
  modelDelta?: string;
}

/**
 * Single assembly point for Agent Harness instructions (H2.C).
 * Order: base → mode note → rules → memory index → skills → model delta.
 */
export function buildHarnessInstructions(
  input: BuildHarnessInstructionsInput,
): string {
  const parts: string[] = [];
  const base = input.baseSystemPrompt.trim();
  if (base) parts.push(base);

  parts.push(modeCapabilityNote(input.mode));

  const rules = input.rulesMarkdown?.trim();
  if (rules) {
    parts.push(`## Project Rules\n\n${rules}`);
  }

  const memory = renderMemoryFence(input.memoryIndexMarkdown ?? "");
  if (memory) parts.push(memory);

  if (input.skillBodies?.length) {
    const skillBlocks = input.skillBodies
      .filter((skill) => skill.body.trim().length > 0)
      .map(
        (skill) =>
          `### Skill: ${skill.name}\n\n${skill.body.trim()}`,
      );
    if (skillBlocks.length > 0) {
      parts.push(`## Active Skills\n\n${skillBlocks.join("\n\n")}`);
    }
  }

  const delta = input.modelDelta?.trim();
  if (delta) {
    parts.push(`## Model-specific guidance\n\n${delta}`);
  }

  return parts.join("\n\n");
}

function modeCapabilityNote(mode: HarnessCapabilityMode): string {
  switch (mode) {
    case "ask":
    case "anchored":
    case "plan":
      return "Mode constraint: read-only. Do not propose or apply file edits, diffs, or shell commands.";
    case "change":
      return "Mode constraint: scoped edits only. Stay inside server-authorized write paths; never expand your own write scope.";
    case "debug":
      return "Mode constraint: hypothesis-driven debug. Prefer evidence over speculative multi-file rewrites.";
    case "team_memory":
      return "Mode constraint: memory/context capture only; no write authorization.";
    case "system":
      return "Mode constraint: system/infrastructure call; follow the caller-provided authorization.";
    default:
      return "Mode constraint: follow the caller-provided authorization.";
  }
}
