import { createHash } from "node:crypto";

import {
  CodeFileUnderstandingEntrySchema,
  type CodeFileUnderstandingEntry,
} from "../contracts/code-file-understanding.js";
import type { ModelProfile } from "../contracts/settings.js";
import { ProjectOSError } from "../errors.js";
import type { ModelGateway } from "./model-gateway/index.js";
import {
  responseLanguageInstruction,
  type ResolvedResponseLanguage,
} from "./agent-language-policy.js";

const MAX_SOURCE_CHARS = 6_000;
const MAX_NEIGHBOR_LABELS = 8;

const SYSTEM_PROMPT = `You write OS-level file understanding for a developer IDE architecture map.
Given one source file and graph context, return JSON only:
{"description":"","role":""}

description: 1–2 sentences (Chinese ≈40–120 characters, or English ≈25–60 words). Explain what this file does in the system, who/what uses it, what it connects to, and its boundary. Do not merely restate the file name or path. Do not invent APIs or callers that are not supported by the supplied evidence.

role: exactly one ownership sentence for the detail drawer — what this file is responsible for. Do not repeat the description. Do not use stereotype labels like "Application" or "Library" alone.

Use the same language as the response-language instruction. No markdown fences.`;

export interface CodeFileUnderstandingModelInput {
  projectId: string;
  path: string;
  sourceExcerpt: string;
  contentHash: string;
  fileType: string | null;
  stereotype: string | null;
  exports: string[];
  usedBy: string[];
  dependsOn: string[];
  parentComponentName: string | null;
  parentComponentSummary: string | null;
  profile: ModelProfile;
  responseLanguage: ResolvedResponseLanguage;
}

export class CodeFileUnderstandingService {
  constructor(private readonly gateway: ModelGateway) {}

  async generateWithModel(
    input: CodeFileUnderstandingModelInput,
  ): Promise<CodeFileUnderstandingEntry> {
    const response = await this.gateway.complete(input.profile, {
      projectId: input.projectId,
      requestKind: "context_summary",
      modelPreference: input.profile.id,
      systemPrompt: `${SYSTEM_PROMPT}\n${responseLanguageInstruction(input.responseLanguage)}`,
      input: {
        path: input.path,
        fileType: input.fileType,
        stereotype: input.stereotype,
        exports: input.exports.slice(0, 24),
        usedBy: input.usedBy.slice(0, MAX_NEIGHBOR_LABELS),
        dependsOn: input.dependsOn.slice(0, MAX_NEIGHBOR_LABELS),
        parentComponent: input.parentComponentName
          ? {
              name: input.parentComponentName,
              summary: input.parentComponentSummary,
            }
          : null,
        sourceExcerpt: truncateSource(input.sourceExcerpt),
      },
      redactionPolicy: "secrets_and_paths",
      maxOutputTokens: 500,
      thinkingDepth: "off",
    });

    const parsed = parseCodeFileUnderstandingOutput(response.output);
    if (!parsed) {
      throw new ProjectOSError(
        "agent_orchestration_failed",
        "The model returned unusable code-file understanding",
      );
    }

    return CodeFileUnderstandingEntrySchema.parse({
      path: input.path,
      description: parsed.description,
      role: parsed.role,
      contentHash: input.contentHash,
      updatedAt: new Date().toISOString(),
      source: "llm",
    });
  }
}

export function hashFileContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 24);
}

export function truncateSource(content: string): string {
  if (content.length <= MAX_SOURCE_CHARS) return content;
  return `${content.slice(0, MAX_SOURCE_CHARS)}\n/* …truncated… */`;
}

export function parseCodeFileUnderstandingOutput(
  raw: string,
): { description: string; role: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const description =
      typeof record.description === "string" ? record.description.trim() : "";
    const role = typeof record.role === "string" ? record.role.trim() : "";
    if (!description || !role) return null;
    if (description === role) return null;
    return { description, role };
  } catch {
    return null;
  }
}
