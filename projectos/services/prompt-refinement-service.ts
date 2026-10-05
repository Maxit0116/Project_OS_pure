import { z } from "zod";

import type { ContextPayload } from "../contracts/context.js";
import type {
  PromptRefineRequest,
  PromptRefinement,
} from "../contracts/prompt-refinement.js";
import type { ModelProfile, ThinkingDepth } from "../contracts/settings.js";
import { ProjectOSError } from "../errors.js";
import { ModelGateway } from "./model-gateway/index.js";
import { redactText } from "./model-gateway/redaction.js";
import {
  responseLanguageInstruction,
  type ResolvedResponseLanguage,
} from "./agent-language-policy.js";
import { orderedModelOutputSources } from "./model-json-output.js";
import { separateLeadingThinkBlock } from "./model-gateway/providers.js";

const REFINEMENT_SYSTEM_PROMPT = `You refine user prompts for a graph-driven IDE.
Respond with JSON only using this shape:
{
  "understood": "string",
  "ambiguities": ["string"],
  "suggestions": ["string"],
  "affectedNodeIds": ["string"],
  "affectedFiles": ["string"],
  "confidence": 0.0
}`;

const ModelRefinementPayloadSchema = z.object({
  understood: z.string().trim().min(1),
  ambiguities: z.array(z.string()),
  suggestions: z.array(z.string()),
  affectedNodeIds: z.array(z.string().trim().min(1).max(256)).max(4_096),
  affectedFiles: z.array(
    z.string().trim().min(1).max(500).refine(
      isSafeAffectedFilePath,
      "Affected files must be safe workspace-relative paths",
    ),
  ).max(65_536),
  confidence: z.number().finite().min(0).max(1),
});

export interface ModelRefinementInput {
  request: PromptRefineRequest;
  context?: ContextPayload | undefined;
  profile: ModelProfile;
  thinkingDepth?: ThinkingDepth;
  responseLanguage: ResolvedResponseLanguage;
  supplementalMarkdown?: string;
  knownNodeIds: ReadonlySet<string>;
}

export class PromptRefinementService {
  constructor(private readonly gateway: ModelGateway) {}

  async refineWithModel(input: ModelRefinementInput): Promise<PromptRefinement> {
    const response = await this.gateway.complete(input.profile, {
      projectId: input.request.projectId,
      requestKind: "prompt_refinement",
      modelPreference: input.profile.id,
      systemPrompt: [
        REFINEMENT_SYSTEM_PROMPT,
        responseLanguageInstruction(input.responseLanguage),
        ...(input.supplementalMarkdown?.trim()
          ? [
              "The user explicitly attached additional context. Treat it as authoritative supplemental material.",
              input.supplementalMarkdown,
            ]
          : []),
      ].join("\n"),
      input: {
        rawPrompt: input.request.rawPrompt,
        nodeId: input.request.nodeId,
        filePath: input.request.filePath,
        context: input.context,
      },
      redactionPolicy: "secrets_and_paths",
      ...(input.thinkingDepth ? { thinkingDepth: input.thinkingDepth } : {}),
    });

    const parsed = parseRefinementJson(
      redactText(response.output, "secrets_and_paths"),
      input.knownNodeIds,
      response.reasoning,
    );
    return {
      ...parsed,
      mode: "model",
    };
  }
}

function parseRefinementJson(
  output: string,
  knownNodeIds: ReadonlySet<string>,
  reasoning?: string,
): Omit<PromptRefinement, "mode"> {
  let sawDecodedJson = false;
  for (const source of orderedModelOutputSources(output, reasoning)) {
    for (const candidate of extractRefinementJsonCandidates(source)) {
      let decoded: unknown;
      try {
        decoded = JSON.parse(candidate);
      } catch {
        continue;
      }
      sawDecodedJson = true;
      const parsed = ModelRefinementPayloadSchema.safeParse(decoded);
      if (!parsed.success) {
        continue;
      }
      if (parsed.data.affectedNodeIds.some((nodeId) => !knownNodeIds.has(nodeId))) {
        throw new ProjectOSError(
          "agent_orchestration_failed",
          "The model returned an invalid prompt refinement",
        );
      }
      return {
        id: `refinement_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ...parsed.data,
      };
    }
  }

  throw new ProjectOSError(
    "agent_orchestration_failed",
    sawDecodedJson
      ? "The model returned an invalid prompt refinement"
      : "The model returned malformed prompt refinement JSON",
  );
}

function extractRefinementJsonCandidates(output: string): string[] {
  const content = separateLeadingThinkBlock(output).output;
  const sources = [
    ...Array.from(content.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu))
      .map((match) => match[1] ?? ""),
    content,
  ];
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const fencedOrWhole = source.trim();
    if (!fencedOrWhole) continue;
    const start = fencedOrWhole.indexOf("{");
    const end = fencedOrWhole.lastIndexOf("}");
    const slice = start >= 0 && end > start
      ? fencedOrWhole.slice(start, end + 1)
      : fencedOrWhole;
    if (slice && !seen.has(slice)) {
      seen.add(slice);
      candidates.push(slice);
    }
  }
  return candidates;
}

function isSafeAffectedFilePath(path: string): boolean {
  if (
    path === "[PATH]" ||
    path.includes("\0") ||
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/u.test(path)
  ) {
    return false;
  }
  const parts = path.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..") &&
    parts[0] !== ".git" && parts[0] !== ".projectos";
}
