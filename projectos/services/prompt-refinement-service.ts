import { z } from "zod";

import type { ContextPayload } from "../contracts/context.js";
import type {
  PromptRefineRequest,
  PromptRefinement,
} from "../contracts/prompt-refinement.js";
import type { ModelProfile, ThinkingDepth } from "../contracts/settings.js";
import { ProjectOSError } from "../errors.js";
import { ensureAlignmentOnRefinement } from "./alignment-contract.js";
import { ModelGateway } from "./model-gateway/index.js";
import { redactText } from "./model-gateway/redaction.js";
import {
  responseLanguageInstruction,
  type ResolvedResponseLanguage,
} from "./agent-language-policy.js";
import { orderedModelOutputSources } from "./model-json-output.js";
import { separateLeadingThinkBlock } from "./model-gateway/providers.js";

const REFINEMENT_SYSTEM_PROMPT = `You refine user prompts for a graph-driven IDE into an alignment contract.
Respond with JSON only using this shape:
{
  "understood": "string — short prose summary",
  "ambiguities": ["string — unclear points, also mirrored as guess items"],
  "suggestions": ["string — optional ideas"],
  "affectedNodeIds": ["string"],
  "affectedFiles": ["string"],
  "confidence": 0.0,
  "alignment": {
    "items": [
      { "id": "stated_1", "kind": "stated", "text": "short requirement", "selected": true },
      { "id": "guess_1", "kind": "guess", "text": "inferred but unstated", "selected": false }
    ],
    "questions": [
      {
        "id": "q1",
        "question": "How should X be implemented?",
        "topic": "implementation",
        "blocking": true,
        "options": [
          { "id": "o1", "label": "Option A", "description": "..." },
          { "id": "o2", "label": "Option B" }
        ]
      }
    ]
  }
}
Rules:
- kind "stated" = explicit user asks (default selected true). kind "guess" = your inferences (default selected false).
- Keep item text short (one clause). Max 12 items total, max 5 questions, max 3 blocking questions.
- Questions are only for decisions you must know before coding (implementation approach, scope, UX form). Prefer 0–2 questions for simple asks.
- Do not invent write authorization; affectedFiles are predictions only.`;

const ModelAlignmentItemSchema = z.object({
  id: z.string().trim().min(1).max(128).optional(),
  kind: z.enum(["stated", "guess", "constraint", "out_of_scope"]),
  text: z.string().trim().min(1).max(500),
  selected: z.boolean().optional(),
  comment: z.string().trim().max(2_000).optional(),
});

const ModelAlignmentQuestionSchema = z.object({
  id: z.string().trim().min(1).max(128).optional(),
  question: z.string().trim().min(1).max(500),
  topic: z
    .enum(["implementation", "scope", "ux", "data", "testing", "other"])
    .optional(),
  blocking: z.boolean().optional(),
  options: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(128).optional(),
        label: z.string().trim().min(1).max(200),
        description: z.string().trim().max(500).optional(),
      }),
    )
    .min(2)
    .max(5)
    .optional(),
});

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
  alignment: z
    .object({
      items: z.array(ModelAlignmentItemSchema).max(12),
      questions: z.array(ModelAlignmentQuestionSchema).max(5).optional(),
    })
    .optional(),
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
      ...(input.request.images?.length
        ? { images: input.request.images }
        : {}),
    });

    const parsed = parseRefinementJson(
      redactText(response.output, "secrets_and_paths"),
      input.knownNodeIds,
      response.reasoning,
      input.request.rawPrompt,
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
  reasoning: string | undefined,
  rawPrompt: string,
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
      const id = `refinement_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { alignment: modelAlignment, ...rest } = parsed.data;
      const refinement: Omit<PromptRefinement, "mode"> = {
        id,
        ...rest,
        ...(modelAlignment
          ? {
              alignment: {
                version: "0.1.0" as const,
                id: `align_${id}`,
                rawPrompt,
                items: modelAlignment.items.map((item, index) => ({
                  id: item.id ?? `${id}_item_${index + 1}`,
                  kind: item.kind,
                  text: item.text,
                  selected:
                    item.selected ??
                    (item.kind === "guess" ? false : true),
                  ...(item.comment ? { comment: item.comment } : {}),
                })),
                questions: (modelAlignment.questions ?? []).map((question, index) => ({
                  id: question.id ?? `${id}_q_${index + 1}`,
                  question: question.question,
                  topic: question.topic ?? "other",
                  blocking: question.blocking ?? true,
                  ...(question.options
                    ? {
                        options: question.options.map((option, optionIndex) => ({
                          id: option.id ?? `${id}_q_${index + 1}_opt_${optionIndex + 1}`,
                          label: option.label,
                          ...(option.description
                            ? { description: option.description }
                            : {}),
                        })),
                      }
                    : {}),
                })),
                confidence: rest.confidence,
                status: "awaiting_user" as const,
              },
            }
          : {}),
      };
      return ensureAlignmentOnRefinement(refinement as PromptRefinement, rawPrompt);
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
