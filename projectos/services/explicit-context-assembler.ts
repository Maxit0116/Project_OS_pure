import { createHash } from "node:crypto";

import type { ContextAttachedPayload } from "../contracts/events.js";
import type { AgentContextBundle } from "../contracts/local-context.js";
import type { ResolvedAttachmentPayload } from "../contracts/prompt-composer.js";
import type { SkillContent } from "../contracts/skills.js";
import { summarizeLocalContext } from "./local-context-summary.js";

export interface AugmentedAgentContext {
  bundle: AgentContextBundle;
  supplementalMarkdown: string;
  activeSkillMarkdown?: string;
  attachmentSummary: ContextAttachedPayload;
}

export interface AssembleExplicitContextInput {
  autoBundle: AgentContextBundle;
  resolvedAttachments: ResolvedAttachmentPayload[];
  invokedSkill?: SkillContent | null;
}

function hashPayload(parts: string[]): string {
  return `sha256:${createHash("sha256").update(parts.join("\n"), "utf8").digest("hex")}`;
}

export function assembleExplicitContext(
  input: AssembleExplicitContextInput,
): AugmentedAgentContext {
  const supplementalSections = input.resolvedAttachments
    .map((attachment) => attachment.markdown ?? attachment.content ?? "")
    .filter(Boolean)
    .map((section) => `## Explicit attachment\n\n${section}`);

  const activeSkillMarkdown = input.invokedSkill
    ? `## Active Skill: ${input.invokedSkill.descriptor.name}\n\n${input.invokedSkill.body}`
    : undefined;

  const supplementalMarkdown = [
    ...(activeSkillMarkdown ? [activeSkillMarkdown] : []),
    ...supplementalSections,
  ].join("\n\n");

  const autoSummary = summarizeLocalContext(input.autoBundle);
  const hasExplicit =
    input.resolvedAttachments.length > 0 || Boolean(input.invokedSkill);
  const attachmentSummary: ContextAttachedPayload = {
    autoFiles: autoSummary.files,
    explicitAttachments: input.resolvedAttachments.map((attachment) => ({
      label: attachment.label,
      kind: attachment.ref.kind,
      disposition: attachment.disposition,
      byteLength: attachment.byteLength,
      includedByteLength: attachment.includedByteLength,
      ...(attachment.omissionReason ? { omissionReason: attachment.omissionReason } : {}),
    })),
    ...(input.invokedSkill ? { invokedSkillId: input.invokedSkill.descriptor.id } : {}),
    bundleHash: hasExplicit
      ? hashPayload([autoSummary.bundleHash, supplementalMarkdown])
      : autoSummary.bundleHash,
  };

  return {
    bundle: input.autoBundle,
    supplementalMarkdown,
    activeSkillMarkdown,
    attachmentSummary,
  };
}

export function buildAugmentedModelInput<T extends Record<string, unknown>>(
  baseInput: T,
  augmented: AugmentedAgentContext,
): T & {
  localContext: AgentContextBundle;
  explicitContext?: { markdown: string };
} {
  return {
    ...baseInput,
    localContext: augmented.bundle,
    ...(augmented.supplementalMarkdown.trim()
      ? { explicitContext: { markdown: augmented.supplementalMarkdown } }
      : {}),
  };
}
