import { z } from "zod";

import { AgentConversationScopeSchema } from "./agent-conversation.js";
import {
  HarnessHypothesisSchema,
  HarnessProposedFixSchema,
  HarnessVerificationSchema,
} from "./harness.js";
import { PromptComposerFieldsSchema } from "./prompt-composer.js";

export const DebugSessionVersionSchema = z.literal("0.1.0");

export const DebugInstrumentationStatusSchema = z.enum([
  "pending",
  "applied",
  "removed",
]);

export const DebugInstrumentationSchema = z
  .object({
    id: z.string().min(1),
    filePath: z.string().min(1),
    lineRange: z.string().min(1),
    kind: z.enum(["fetch_log", "console_log"]),
    status: DebugInstrumentationStatusSchema,
    hypothesisId: z.string().min(1).optional(),
  })
  .strict();

export const DebugLogEntrySchema = z
  .object({
    timestamp: z.string().min(1),
    sessionId: z.string().min(1),
    hypothesisId: z.string().min(1).optional(),
    location: z.string().min(1),
    payload: z.unknown(),
  })
  .strict();

export const DebugSessionPhaseSchema = z.enum([
  "hypothesize",
  "instrument",
  "reproduce",
  "analyze",
  "fix",
  "verify",
  "cleanup",
  "complete",
]);

export const DebugSessionSchema = z
  .object({
    version: DebugSessionVersionSchema,
    sessionId: z.string().min(1),
    projectId: z.string().min(1),
    scope: AgentConversationScopeSchema,
    bugDescription: z.string().trim().min(1),
    reproSteps: z.array(z.string().trim().min(1)),
    hypotheses: z.array(HarnessHypothesisSchema),
    chosenRootCauseId: z.string().min(1).optional(),
    proposedFix: HarnessProposedFixSchema.optional(),
    instrumentation: z.array(DebugInstrumentationSchema),
    logEntries: z.array(DebugLogEntrySchema),
    phase: DebugSessionPhaseSchema,
    linkedRunId: z.string().min(1).optional(),
    verification: HarnessVerificationSchema,
    debugLogPort: z.number().int().positive().optional(),
    chatSessionId: z.string().min(1).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const StartDebugSessionRequestSchema = z
  .object({
    projectId: z.string().min(1),
    scope: AgentConversationScopeSchema,
    bugDescription: z.string().trim().min(1),
    rawError: z.string().optional(),
    chatSessionId: z.string().min(1).optional(),
  })
  .merge(PromptComposerFieldsSchema)
  .strict();

export const SubmitDebugReproRequestSchema = z
  .object({
    sessionId: z.string().min(1),
    logs: z.array(DebugLogEntrySchema).optional(),
  })
  .strict();

export const DebugSessionSnapshotSchema = DebugSessionSchema;

export type DebugSessionVersion = z.infer<typeof DebugSessionVersionSchema>;
export type DebugInstrumentationStatus = z.infer<
  typeof DebugInstrumentationStatusSchema
>;
export type DebugInstrumentation = z.infer<typeof DebugInstrumentationSchema>;
export type DebugLogEntry = z.infer<typeof DebugLogEntrySchema>;
export type DebugSessionPhase = z.infer<typeof DebugSessionPhaseSchema>;
export type DebugSession = z.infer<typeof DebugSessionSchema>;
export type StartDebugSessionRequest = z.infer<
  typeof StartDebugSessionRequestSchema
>;
export type SubmitDebugReproRequest = z.infer<
  typeof SubmitDebugReproRequestSchema
>;
export type DebugSessionSnapshot = z.infer<typeof DebugSessionSnapshotSchema>;
