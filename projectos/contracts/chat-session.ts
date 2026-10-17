import { z } from "zod";

import {
  AgentAnswerResultSchema,
  AgentConversationScopeSchema,
} from "./agent-conversation.js";
import { DebugSessionSnapshotSchema } from "./debug-session.js";
import { ImplementationPlanSchema, LatestPlanTraceSchema } from "./implementation-plan.js";
import { PromptRefinementSchema } from "./prompt-refinement.js";
import {
  ComposerDraftSchema,
  normalizeComposerDraft,
  PromptAttachmentSchema,
} from "./prompt-composer.js";

export const CHAT_SESSION_MAX_COUNT = 100;
export const CHAT_SESSION_MAX_PINNED = 50;

export const ChatSessionVersionSchema = z.union([
  z.literal("0.1.0"),
  z.literal("0.2.0"),
]);

export const ChatSessionStatusSchema = z.enum([
  "idle",
  "running",
  "awaiting_review",
  "error",
]);

export const ChatSessionModeSchema = z.enum([
  "ask",
  "change",
  "plan",
  "debug",
  "team_memory",
  "anchored",
]);

export const ChatSessionTitleSourceSchema = z.enum(["auto", "manual"]);

export const ChatSessionClassificationSchema = z.enum(["topic", "misc"]);

export const ChatSessionClassificationSourceSchema = z.enum(["auto", "manual"]);

export const SessionContextDigestSchema = z
  .object({
    responsibility: z.string().trim().min(1).max(240),
    decisions: z.array(z.string().trim().min(1).max(240)).max(3),
    openQuestions: z.array(z.string().trim().min(1).max(240)).max(3),
    refs: z.array(z.string().trim().min(1).max(240)).max(5),
    updatedAt: z.string().min(1),
    throughMessageId: z.string().min(1),
  })
  .strict();

export const ChatMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
    format: z.enum(["plain", "markdown"]).optional(),
    notice: z.string().optional(),
    timestamp: z.string().min(1),
    attachments: z.array(PromptAttachmentSchema).optional(),
    invokedSkillId: z.string().min(1).optional(),
  })
  .strict();

export const ChatSessionHeadSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    createdAt: z.string().min(1),
    lastUpdatedAt: z.string().min(1),
    chatMode: ChatSessionModeSchema,
    isArchived: z.boolean(),
    status: ChatSessionStatusSchema,
    subtitle: z.string().optional(),
    titleSource: ChatSessionTitleSourceSchema.optional(),
    titleGeneratedAt: z.string().min(1).optional(),
    parentSessionId: z.string().min(1).optional(),
    forkMessageId: z.string().min(1).optional(),
    /** Shared canvas group for topic sessions. Multi-root forests share one graphId. */
    graphId: z.string().min(1).optional(),
    classification: ChatSessionClassificationSchema.optional(),
    classificationSource: ChatSessionClassificationSourceSchema.optional(),
    responsibility: z.string().trim().min(1).max(240).optional(),
  })
  .strict();

export const LatestAskTraceSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("running"),
      scope: AgentConversationScopeSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("complete"),
      scope: AgentConversationScopeSchema,
      result: AgentAnswerResultSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("error"),
      scope: AgentConversationScopeSchema,
      message: z.string(),
    })
    .strict(),
]);

export const ChatSessionSnapshotSchema = z
  .object({
    pendingRefinement: PromptRefinementSchema.nullable().optional(),
    refinementConfirmed: z.boolean().optional(),
    latestAskTrace: LatestAskTraceSchema.nullable().optional(),
    pendingPlan: ImplementationPlanSchema.nullable().optional(),
    planConfirmed: z.boolean().optional(),
    latestPlanTrace: LatestPlanTraceSchema.nullable().optional(),
    debugSession: DebugSessionSnapshotSchema.nullable().optional(),
    agentFlowSubject: z.enum(["ask", "run", "plan", "debug"]).optional(),
    flowStatus: ChatSessionStatusSchema.optional(),
    activeRunId: z.string().nullable().optional(),
    hasPendingRefinement: z.boolean().optional(),
    hasPendingPlan: z.boolean().optional(),
  })
  .strict();

export const ChatSessionRecordSchema = z
  .object({
    version: ChatSessionVersionSchema,
    head: ChatSessionHeadSchema,
    messages: z.array(ChatMessageSchema),
    draftInput: z.string().optional(),
    draftComposer: ComposerDraftSchema.optional(),
    snapshot: ChatSessionSnapshotSchema.optional(),
    contextDigest: SessionContextDigestSchema.optional(),
    inheritedDigest: SessionContextDigestSchema.optional(),
  })
  .strict();

export const ChatSessionIndexSchema = z
  .object({
    version: ChatSessionVersionSchema,
    pinnedIds: z.array(z.string().min(1)),
    lastActiveId: z.string().min(1).optional(),
    heads: z.array(ChatSessionHeadSchema),
  })
  .strict();

export type ChatSessionStatus = z.infer<typeof ChatSessionStatusSchema>;
export type ChatSessionMode = z.infer<typeof ChatSessionModeSchema>;
export type ChatSessionTitleSource = z.infer<typeof ChatSessionTitleSourceSchema>;
export type ChatSessionClassification = z.infer<typeof ChatSessionClassificationSchema>;
export type ChatSessionClassificationSource = z.infer<
  typeof ChatSessionClassificationSourceSchema
>;
export type SessionContextDigest = z.infer<typeof SessionContextDigestSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatSessionHead = z.infer<typeof ChatSessionHeadSchema>;
export type LatestAskTrace = z.infer<typeof LatestAskTraceSchema>;
export type ChatSessionSnapshot = z.infer<typeof ChatSessionSnapshotSchema>;
export type ChatSessionRecord = z.infer<typeof ChatSessionRecordSchema>;
export type ChatSessionIndex = z.infer<typeof ChatSessionIndexSchema>;
