import { z } from "zod";

import {
  FirstPrinciplesLlmTurnSchema,
  FirstPrinciplesQuestionSchema,
  type FirstPrinciplesLayerId,
  type FirstPrinciplesLlmTurn,
  type FirstPrinciplesQuestion,
  type FirstPrinciplesSession,
} from "../../contracts/first-principles.js";
import type { ModelProfile, ThinkingDepth } from "../../contracts/settings.js";
import type { ModelGateway } from "../model-gateway/index.js";
import { orderedModelOutputSources } from "../model-json-output.js";
import { separateLeadingThinkBlock } from "../model-gateway/providers.js";
import { fallbackQuestionForLayer } from "./fallback-questions.js";

const FP_SYSTEM_PROMPT = `You are a First Principles debate partner for a solo founder / indie developer.
Your job is Why/Whether — never How to implement code.
Respond with JSON only:
{
  "kind": "question" | "thesis_ready" | "conflict",
  "reflect": "≤2 sentences restating understanding",
  "question": "one primary question for the CURRENT layer only",
  "options": [{ "id": "opt_a", "label": "short", "description": "tradeoff" }, ...],
  "claimUpdates": [{ "text": "atomic claim", "status": "assumed"|"evidenced"|"contested", "evidenceRefs": ["path#L"] }],
  "conflict": { "summary": "...", "leftLabel": "...", "rightLabel": "...", "evidenceRefs": [] },
  "graphHint": { "diagramKind": "causal"|"journey"|"boundary"|"decision"|"data_responsibility" },
  "skipRemainingLayers": false
}
Rules:
- Exactly one primary question when kind=question; options must be 2–5 mutually exclusive choices.
- Encourage falsifiers; allow an honest Go path.
- If codebase exploration evidence contradicts the user, prefer kind=conflict.
- If enough is known to write a Thesis, use kind=thesis_ready (optionally skipRemainingLayers=true).
- Never propose diffs, file edits, or implementation step lists.`;

function layerBrief(layerId: FirstPrinciplesLayerId): string {
  switch (layerId) {
    case "L0":
      return "Anchor a concrete painful event and who owns the pain.";
    case "L1":
      return "First-principles atoms: Who / Job-to-be-done / Constraints / Cost of inaction / Falsifier.";
    case "L2":
      return "Kill Test — which disproof is closest to reality?";
    case "L3":
      return "MVP obligation — minimal falsifiable slice + non-goals.";
    case "L4":
      return "Structure externalization — which diagram best exposes the claim?";
  }
}

function buildUserPayload(
  session: FirstPrinciplesSession,
  explorationMarkdown?: string,
): Record<string, unknown> {
  return {
    mode: "first_principles",
    writeCapability: false,
    currentLayerId: session.currentLayerId,
    layerGoal: layerBrief(session.currentLayerId),
    rawVision: session.rawVision,
    problemStatement: session.problemStatement,
    painOwner: session.painOwner,
    atomicClaims: session.atomicClaims,
    killedAlternatives: session.killedAlternatives,
    mvpObligation: session.mvpObligation,
    nonGoals: session.nonGoals,
    acceptanceSignals: session.acceptanceSignals,
    turnCount: session.turnCount,
    answeredSummary: session.layers.flatMap((layer) =>
      layer.answers.map((answer) => ({
        layerId: layer.id,
        questionId: answer.questionId,
        kind: answer.kind,
        selectedOptionId: answer.selectedOptionId,
        text: answer.text,
      })),
    ),
    ...(explorationMarkdown?.trim()
      ? { explorationMarkdown: explorationMarkdown.slice(0, 6_000) }
      : {}),
  };
}

function parseLlmTurn(output: string, reasoning?: string): FirstPrinciplesLlmTurn | null {
  for (const source of orderedModelOutputSources(output, reasoning)) {
    const cleaned = separateLeadingThinkBlock(source).content.trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      const decoded = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
      const parsed = FirstPrinciplesLlmTurnSchema.safeParse(decoded);
      if (parsed.success) return parsed.data;
    } catch {
      /* try next source */
    }
  }
  return null;
}

export function questionFromLlmTurn(
  session: FirstPrinciplesSession,
  turn: FirstPrinciplesLlmTurn,
): FirstPrinciplesQuestion | null {
  if (turn.kind !== "question" || !turn.question?.trim() || !turn.options || turn.options.length < 2) {
    return null;
  }
  const draft = {
    id: `fp_llm_${session.currentLayerId}_${session.turnCount}_${globalThis.crypto.randomUUID().slice(0, 8)}`,
    layerId: session.currentLayerId,
    question: turn.question.trim(),
    reflect: turn.reflect,
    options: turn.options.slice(0, 5),
    blocking: true,
    allowSkip: true,
    metaOptions: ["unsure", "skip_layer", "wrong_question"] as const,
    ...(turn.graphHint ? { graphHint: turn.graphHint } : {}),
  };
  const parsed = FirstPrinciplesQuestionSchema.safeParse(draft);
  return parsed.success ? parsed.data : null;
}

export async function generateFirstPrinciplesLlmTurn(input: {
  session: FirstPrinciplesSession;
  profile: ModelProfile;
  thinkingDepth: ThinkingDepth;
  gateway: ModelGateway;
  explorationMarkdown?: string;
}): Promise<FirstPrinciplesLlmTurn | null> {
  try {
    const response = await input.gateway.complete(input.profile, {
      projectId: input.session.projectId,
      requestKind: "question_answer",
      modelPreference: input.profile.id,
      systemPrompt: FP_SYSTEM_PROMPT,
      input: buildUserPayload(input.session, input.explorationMarkdown),
      redactionPolicy: "secrets_and_paths",
      maxOutputTokens: 2048,
      thinkingDepth: input.thinkingDepth,
    });
    return parseLlmTurn(response.output, response.reasoning);
  } catch {
    return null;
  }
}

export function resolveQuestionWithFallback(
  session: FirstPrinciplesSession,
  turn: FirstPrinciplesLlmTurn | null,
): FirstPrinciplesQuestion {
  if (turn) {
    const fromLlm = questionFromLlmTurn(session, turn);
    if (fromLlm) return fromLlm;
  }
  return fallbackQuestionForLayer(session.currentLayerId, session);
}

export const FirstPrinciplesLlmTurnParseSchema = z.object({
  turn: FirstPrinciplesLlmTurnSchema.nullable(),
});
