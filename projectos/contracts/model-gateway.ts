import { z } from "zod";

import { ThinkingDepthSchema } from "./settings.js";

export const ModelRequestKindSchema = z.enum([
  "feature_decomposition",
  "structure_graph_scan",
  "prompt_refinement",
  "request_intent",
  "change_generation",
  "root_cause_analysis",
  "implementation_plan",
  "code_review",
  "context_summary",
  "agent_step",
  "question_answer",
  "chat_title",
  "loop_authoring",
]);

export const RedactionPolicySchema = z.enum([
  "none",
  "local_paths_only",
  "secrets_and_paths",
]);

export const ModelImagePartSchema = z
  .object({
    mimeType: z.enum(["image/png", "image/jpeg"]),
    base64: z.string().min(1).max(6_000_000),
  })
  .strict();

export const ModelToolDefinitionSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1).max(256),
    description: z.string().max(16_384).optional(),
    parameters: z.record(z.unknown()),
  }).strict(),
}).strict();

export const ModelToolCallSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(256),
  arguments: z.string().max(1_000_000),
}).strict();

export const ModelGatewayRequestSchema = z
  .object({
    projectId: z.string().optional(),
    requestKind: ModelRequestKindSchema,
    modelPreference: z.string().optional(),
    input: z.unknown(),
    redactionPolicy: RedactionPolicySchema.default("secrets_and_paths"),
    maxOutputTokens: z.number().finite().int().min(0).optional(),
    systemPrompt: z.string().optional(),
    thinkingDepth: ThinkingDepthSchema.optional(),
    /** Optional vision parts (OpenAI / Anthropic). Ignored by text-only providers. */
    images: z.array(ModelImagePartSchema).max(4).optional(),
    /**
     * Ask for the answer as a call to one of these tools. The gateway returns the chosen call's
     * arguments as `output` and its name as `toolName`; a model that answers in plain text anyway
     * comes back as text with no `toolName`, and the caller decides what to do with it.
     */
    structured: z
      .object({ tools: z.array(ModelToolDefinitionSchema).min(1).max(8) })
      .strict()
      .optional(),
  })
  .strict();

export const ModelGatewayUsageSchema = z
  .object({
    inputTokens: z.number().finite().int().min(0),
    outputTokens: z.number().finite().int().min(0),
  })
  .strict();

export const ModelGatewayResponseSchema = z
  .object({
    requestId: z.string(),
    provider: z.string(),
    model: z.string(),
    output: z.string(),
    /** Set when `output` is the arguments of a tool call the model made for `structured`. */
    toolName: z.string().min(1).max(256).optional(),
    reasoning: z.string().trim().min(1).optional(),
    finishReason: z.string().trim().min(1).optional(),
    usage: ModelGatewayUsageSchema,
    /** Absent usage is not estimated. Omitted on older responses means reported. */
    usageStatus: z.enum(["reported", "missing"]).optional(),
    latencyMs: z.number().finite().int().min(0),
  })
  .strict();

export type ModelRequestKind = z.infer<typeof ModelRequestKindSchema>;
export type RedactionPolicy = z.infer<typeof RedactionPolicySchema>;
export type ModelImagePart = z.infer<typeof ModelImagePartSchema>;
export type ModelGatewayRequest = z.infer<typeof ModelGatewayRequestSchema>;
export type ModelGatewayUsage = z.infer<typeof ModelGatewayUsageSchema>;
export type ModelGatewayResponse = z.infer<typeof ModelGatewayResponseSchema>;

export type ModelToolDefinition = z.infer<typeof ModelToolDefinitionSchema>;
export type ModelToolCall = z.infer<typeof ModelToolCallSchema>;
