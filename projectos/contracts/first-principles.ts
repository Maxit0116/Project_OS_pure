import { z } from "zod";

import { ClarifyingQuestionSchema } from "./implementation-plan.js";

/** Ask · First Principles — Ask sub-mode (not a ChatSessionMode). */

export const AskSubModeSchema = z.enum(["chat", "first_principles"]);
export type AskSubMode = z.infer<typeof AskSubModeSchema>;

export const FirstPrinciplesLayerIdSchema = z.enum([
  "L0",
  "L1",
  "L2",
  "L3",
  "L4",
]);
export type FirstPrinciplesLayerId = z.infer<typeof FirstPrinciplesLayerIdSchema>;

export const FIRST_PRINCIPLES_LAYER_ORDER: FirstPrinciplesLayerId[] = [
  "L0",
  "L1",
  "L2",
  "L3",
  "L4",
];

export const FirstPrinciplesVerdictSchema = z.enum([
  "go",
  "pivot",
  "kill",
  "park",
]);
export type FirstPrinciplesVerdict = z.infer<typeof FirstPrinciplesVerdictSchema>;

export const FirstPrinciplesSessionStatusSchema = z.enum([
  "framing",
  "layer_active",
  "conflict",
  "thesis_review",
  "concluded",
  "abandoned",
]);
export type FirstPrinciplesSessionStatus = z.infer<
  typeof FirstPrinciplesSessionStatusSchema
>;

export const AtomicClaimStatusSchema = z.enum([
  "assumed",
  "evidenced",
  "contested",
]);
export type AtomicClaimStatus = z.infer<typeof AtomicClaimStatusSchema>;

export const FirstPrinciplesDiagramKindSchema = z.enum([
  "causal",
  "journey",
  "boundary",
  "decision",
  "data_responsibility",
]);
export type FirstPrinciplesDiagramKind = z.infer<
  typeof FirstPrinciplesDiagramKindSchema
>;

export const FirstPrinciplesGraphHintSchema = z
  .object({
    diagramKind: FirstPrinciplesDiagramKindSchema.optional(),
    patch: z
      .array(
        z
          .object({
            op: z.enum(["emphasize", "dim", "relabel", "add_note"]),
            targetKey: z.string().min(1).max(120),
            value: z.string().max(500).optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();
export type FirstPrinciplesGraphHint = z.infer<
  typeof FirstPrinciplesGraphHintSchema
>;

export const FirstPrinciplesMetaOptionSchema = z.enum([
  "unsure",
  "skip_layer",
  "wrong_question",
]);
export type FirstPrinciplesMetaOption = z.infer<
  typeof FirstPrinciplesMetaOptionSchema
>;

export const FirstPrinciplesQuestionSchema = ClarifyingQuestionSchema.extend({
  layerId: FirstPrinciplesLayerIdSchema,
  blocking: z.boolean().default(true),
  allowSkip: z.boolean().default(true),
  reflect: z.string().trim().max(800).optional(),
  metaOptions: z.array(FirstPrinciplesMetaOptionSchema).max(3).optional(),
  graphHint: FirstPrinciplesGraphHintSchema.optional(),
});
export type FirstPrinciplesQuestion = z.infer<
  typeof FirstPrinciplesQuestionSchema
>;

export const FirstPrinciplesAnswerKindSchema = z.enum([
  "option",
  "custom",
  "unsure",
  "skip_layer",
  "wrong_question",
]);
export type FirstPrinciplesAnswerKind = z.infer<
  typeof FirstPrinciplesAnswerKindSchema
>;

export const FirstPrinciplesAnswerSchema = z
  .object({
    questionId: z.string().min(1).max(120),
    kind: FirstPrinciplesAnswerKindSchema,
    selectedOptionId: z.string().min(1).max(120).optional(),
    text: z.string().trim().max(4_000).optional(),
    answeredAt: z.string().min(1).max(64),
  })
  .strict();
export type FirstPrinciplesAnswer = z.infer<typeof FirstPrinciplesAnswerSchema>;

export const AtomicClaimSchema = z
  .object({
    id: z.string().min(1).max(120),
    text: z.string().trim().min(1).max(500),
    status: AtomicClaimStatusSchema,
    evidenceRefs: z.array(z.string().min(1).max(240)).max(8).optional(),
  })
  .strict();
export type AtomicClaim = z.infer<typeof AtomicClaimSchema>;

export const FirstPrinciplesConflictSchema = z
  .object({
    id: z.string().min(1).max(120),
    layerId: FirstPrinciplesLayerIdSchema,
    summary: z.string().trim().min(1).max(800),
    leftLabel: z.string().trim().min(1).max(240),
    rightLabel: z.string().trim().min(1).max(240),
    leftClaimId: z.string().min(1).max(120).optional(),
    rightClaimId: z.string().min(1).max(120).optional(),
    evidenceRefs: z.array(z.string().min(1).max(240)).max(8).optional(),
  })
  .strict();
export type FirstPrinciplesConflict = z.infer<typeof FirstPrinciplesConflictSchema>;

export const FirstPrinciplesConflictResolutionSchema = z.enum([
  "keep_left",
  "keep_right",
  "rephrase",
]);
export type FirstPrinciplesConflictResolution = z.infer<
  typeof FirstPrinciplesConflictResolutionSchema
>;

export const FirstPrinciplesLlmTurnSchema = z
  .object({
    kind: z.enum(["question", "thesis_ready", "conflict"]),
    reflect: z.string().trim().max(800).optional(),
    question: z.string().trim().min(1).max(500).optional(),
    options: z
      .array(
        z
          .object({
            id: z.string().min(1).max(120),
            label: z.string().trim().min(1).max(160),
            description: z.string().trim().max(320).optional(),
          })
          .strict(),
      )
      .min(2)
      .max(5)
      .optional(),
    claimUpdates: z
      .array(
        z
          .object({
            id: z.string().min(1).max(120).optional(),
            text: z.string().trim().min(1).max(500),
            status: AtomicClaimStatusSchema,
            evidenceRefs: z.array(z.string().min(1).max(240)).max(8).optional(),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    conflict: FirstPrinciplesConflictSchema.omit({ id: true, layerId: true })
      .extend({
        id: z.string().min(1).max(120).optional(),
        layerId: FirstPrinciplesLayerIdSchema.optional(),
      })
      .optional(),
    graphHint: FirstPrinciplesGraphHintSchema.optional(),
    skipRemainingLayers: z.boolean().optional(),
  })
  .strict();
export type FirstPrinciplesLlmTurn = z.infer<typeof FirstPrinciplesLlmTurnSchema>;

export const FirstPrinciplesFeatureWriteResultSchema = z
  .object({
    written: z.boolean(),
    featureId: z.string().min(1).max(120).nullable(),
    skippedLocked: z.boolean().default(false),
    path: z.string().min(1).max(512).optional(),
    message: z.string().max(500).optional(),
  })
  .strict();
export type FirstPrinciplesFeatureWriteResult = z.infer<
  typeof FirstPrinciplesFeatureWriteResultSchema
>;

export const FirstPrinciplesLayerStateSchema = z
  .object({
    id: FirstPrinciplesLayerIdSchema,
    status: z.enum(["pending", "active", "complete", "skipped"]),
    questions: z.array(FirstPrinciplesQuestionSchema).max(8),
    answers: z.array(FirstPrinciplesAnswerSchema).max(16),
  })
  .strict();
export type FirstPrinciplesLayerState = z.infer<
  typeof FirstPrinciplesLayerStateSchema
>;

export const FirstPrinciplesThesisSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    thesis: z.string().trim().min(1).max(800),
    forWhom: z.string().trim().min(1).max(240),
    whyNow: z.string().trim().min(1).max(500),
    mvp: z.string().trim().min(1).max(800),
    successSignal: z.string().trim().min(1).max(500),
    nonGoals: z.array(z.string().trim().min(1).max(240)).max(12),
    confidence: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
    verdict: FirstPrinciplesVerdictSchema,
  })
  .strict();
export type FirstPrinciplesThesis = z.infer<typeof FirstPrinciplesThesisSchema>;

export const FirstPrinciplesPainOwnerSchema = z.enum([
  "self",
  "target_user",
  "trend",
  "unknown",
]);
export type FirstPrinciplesPainOwner = z.infer<
  typeof FirstPrinciplesPainOwnerSchema
>;

/** Soft turn cap before forcing thesis_review (Dev Plan D7). */
export const FIRST_PRINCIPLES_TURN_SOFT_LIMIT = 16;

export const FirstPrinciplesSessionSchema = z
  .object({
    version: z.literal("0.1.0"),
    id: z.string().min(1).max(120),
    projectId: z.string().min(1).max(120),
    chatSessionId: z.string().min(1).max(120).optional(),
    status: FirstPrinciplesSessionStatusSchema,
    currentLayerId: FirstPrinciplesLayerIdSchema,
    rawVision: z.string().trim().min(1).max(8_000),
    layers: z.array(FirstPrinciplesLayerStateSchema).length(5),
    atomicClaims: z.array(AtomicClaimSchema).max(24),
    problemStatement: z.string().trim().max(800).optional(),
    painOwner: FirstPrinciplesPainOwnerSchema.optional(),
    killedAlternatives: z.array(z.string().trim().min(1).max(500)).max(12),
    mvpObligation: z.string().trim().max(800).optional(),
    acceptanceSignals: z.array(z.string().trim().min(1).max(500)).max(12),
    nonGoals: z.array(z.string().trim().min(1).max(500)).max(12),
    diagramIds: z.array(z.string().min(1).max(120)).max(20),
    activeQuestion: FirstPrinciplesQuestionSchema.nullable().optional(),
    pendingConflict: FirstPrinciplesConflictSchema.nullable().optional(),
    explorationSummary: z.string().trim().max(8_000).optional(),
    thesis: FirstPrinciplesThesisSchema.optional(),
    featuresFeatureId: z.string().min(1).max(120).optional(),
    turnCount: z.number().int().nonnegative().max(64),
    suggestSuppressed: z.boolean().optional(),
    createdAt: z.string().min(1).max(64),
    updatedAt: z.string().min(1).max(64),
    concludedAt: z.string().min(1).max(64).optional(),
  })
  .strict();
export type FirstPrinciplesSession = z.infer<typeof FirstPrinciplesSessionSchema>;

export const ThesisIndexEntrySchema = z
  .object({
    id: z.string().min(1).max(120),
    title: z.string().trim().min(1).max(160),
    verdict: FirstPrinciplesVerdictSchema,
    updatedAt: z.string().min(1).max(64),
    chatSessionId: z.string().min(1).max(120).optional(),
  })
  .strict();
export type ThesisIndexEntry = z.infer<typeof ThesisIndexEntrySchema>;

export const ThesisIndexSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(ThesisIndexEntrySchema).max(200),
  })
  .strict();
export type ThesisIndex = z.infer<typeof ThesisIndexSchema>;

export const StartFirstPrinciplesRequestSchema = z
  .object({
    projectId: z.string().min(1).max(120),
    chatSessionId: z.string().min(1).max(120).optional(),
    vision: z.string().trim().min(1).max(8_000),
  })
  .strict();
export type StartFirstPrinciplesRequest = z.infer<
  typeof StartFirstPrinciplesRequestSchema
>;

export const AnswerFirstPrinciplesRequestSchema = z
  .object({
    projectId: z.string().min(1).max(120),
    sessionId: z.string().min(1).max(120),
    answer: FirstPrinciplesAnswerSchema.omit({ answeredAt: true }).extend({
      answeredAt: z.string().min(1).max(64).optional(),
    }),
  })
  .strict();
export type AnswerFirstPrinciplesRequest = z.infer<
  typeof AnswerFirstPrinciplesRequestSchema
>;

export const ResolveFirstPrinciplesConflictRequestSchema = z
  .object({
    projectId: z.string().min(1).max(120),
    sessionId: z.string().min(1).max(120),
    resolution: FirstPrinciplesConflictResolutionSchema,
    rephraseText: z.string().trim().max(800).optional(),
  })
  .strict();
export type ResolveFirstPrinciplesConflictRequest = z.infer<
  typeof ResolveFirstPrinciplesConflictRequestSchema
>;

export const ConfirmFirstPrinciplesThesisRequestSchema = z
  .object({
    sessionId: z.string().min(1).max(120),
    thesis: FirstPrinciplesThesisSchema,
    acknowledgeLowConfidence: z.boolean().optional(),
    writePlannedFeature: z.boolean().optional(),
  })
  .strict();
export type ConfirmFirstPrinciplesThesisRequest = z.infer<
  typeof ConfirmFirstPrinciplesThesisRequestSchema
>;

export const WriteFirstPrinciplesFeatureRequestSchema = z
  .object({
    projectId: z.string().min(1).max(120),
    sessionId: z.string().min(1).max(120),
  })
  .strict();
export type WriteFirstPrinciplesFeatureRequest = z.infer<
  typeof WriteFirstPrinciplesFeatureRequestSchema
>;

export const FirstPrinciplesHandoffTargetSchema = z.enum([
  "plan",
  "agent",
  "ask_chat",
]);
export type FirstPrinciplesHandoffTarget = z.infer<
  typeof FirstPrinciplesHandoffTargetSchema
>;

export const HandoffFirstPrinciplesRequestSchema = z
  .object({
    sessionId: z.string().min(1).max(120),
    target: FirstPrinciplesHandoffTargetSchema,
  })
  .strict();
export type HandoffFirstPrinciplesRequest = z.infer<
  typeof HandoffFirstPrinciplesRequestSchema
>;

export const FirstPrinciplesHandoffPayloadSchema = z
  .object({
    target: FirstPrinciplesHandoffTargetSchema,
    brief: z.string().min(1).max(8_000),
    clarifyingAnswers: z
      .array(
        z
          .object({
            questionId: z.string().min(1),
            answer: z.string().min(1),
            selectedOptionId: z.string().min(1).optional(),
          })
          .strict(),
      )
      .max(32),
    session: FirstPrinciplesSessionSchema,
  })
  .strict();
export type FirstPrinciplesHandoffPayload = z.infer<
  typeof FirstPrinciplesHandoffPayloadSchema
>;

export function emptyThesisIndex(): ThesisIndex {
  return { version: 1, entries: [] };
}

export function looksLikeVisionPrompt(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  const visionHints =
    /感觉|也许|要不要|想法|愿景|酷|maybe|perhaps|what if|should we|would be cool|vision|idea|我想加|做个|加一个/u;
  const technicalAsk =
    /\?|？|how does|what does|where is|为什么报错|怎么实现|这个函数|这个文件/u;
  const hasPath = /[/\\][\w.-]+\.\w{1,8}\b/u.test(trimmed);
  let score = 0;
  if (visionHints.test(lower)) score += 1;
  if (trimmed.length < 80) score += 1;
  if (!technicalAsk.test(trimmed)) score += 1;
  if (!hasPath) score += 1;
  if (/feature|功能|订阅|协作|助手|dashboard|面板/u.test(lower)) score += 1;
  return score >= 2 && !hasPath;
}
