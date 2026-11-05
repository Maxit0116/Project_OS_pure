import { z } from "zod";

import type {
  ModelApiFormat,
  ModelProfile,
  ResolvedModelProfile,
  ThinkingDepth,
} from "../../contracts/settings.js";
import type { ModelToolCall, ModelToolDefinition } from "../../contracts/model-gateway.js";
import { normalizeModelProfile } from "../../contracts/settings.js";
import { ProjectOSError } from "../../errors.js";
import { sanitizeErrorMessage } from "../../utils/sanitize-error-message.js";
import type { SecretStore } from "../../persistence/secret-store.js";

export interface ProviderImagePart {
  mimeType: "image/png" | "image/jpeg";
  base64: string;
}

export interface ProviderCompleteInput {
  systemPrompt?: string;
  userPrompt?: string;
  messages?: ProviderMessage[];
  tools?: ModelToolDefinition[];
  signal?: AbortSignal;
  maxOutputTokens?: number;
  thinkingDepth?: ThinkingDepth;
  images?: ProviderImagePart[];
}

export function buildOpenAiUserContent(
  text: string,
  images?: ProviderImagePart[],
): string | Array<Record<string, unknown>> {
  if (!images?.length) return text;
  return [
    { type: "text", text },
    ...images.map((image) => ({
      type: "image_url",
      image_url: {
        url: `data:${image.mimeType};base64,${image.base64}`,
      },
    })),
  ];
}

export function buildAnthropicUserContent(
  text: string,
  images?: ProviderImagePart[],
): string | Array<Record<string, unknown>> {
  if (!images?.length) return text;
  return [
    ...images.map((image) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mimeType,
        data: image.base64,
      },
    })),
    { type: "text", text },
  ];
}

export type ProviderMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ModelToolCall[];
  toolCallId?: string;
};

export interface ProviderCompleteResult {
  output: string;
  reasoning?: string;
  finishReason?: string;
  toolCalls?: ModelToolCall[];
  inputTokens: number;
  outputTokens: number;
  /** False when the provider omitted usage. Tokens are then 0, not an estimate. */
  usageReported?: boolean;
}

export interface ModelProviderAdapter {
  complete(
    profile: ResolvedModelProfile,
    apiKey: string | undefined,
    input: ProviderCompleteInput,
  ): Promise<ProviderCompleteResult>;
  listModels?(
    profile: ResolvedModelProfile,
    apiKey: string | undefined,
  ): Promise<Array<{ id: string; name: string }>>;
  testConnection(
    profile: ResolvedModelProfile,
    apiKey: string | undefined,
  ): Promise<{ ok: boolean; message?: string }>;
}

const PROVIDER_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

const OptionalTokenCountSchema = z.number().int().nonnegative().optional();

const OpenAiResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable().optional(),
      reasoning_content: z.string().nullable().optional(),
      reasoning: z.string().nullable().optional(),
      // A provider adds fields of its own (DeepSeek sends `index` on every tool call). The ones read
      // here are checked; the rest are ignored, or the whole reply was rejected as "invalid payload".
      tool_calls: z.array(z.object({
        id: z.string().min(1),
        type: z.literal("function"),
        function: z.object({
          name: z.string().min(1),
          arguments: z.string(),
        }),
      })).optional(),
    }),
    finish_reason: z.string().nullable().optional(),
  })).min(1),
  usage: z.object({
    prompt_tokens: OptionalTokenCountSchema,
    completion_tokens: OptionalTokenCountSchema,
  }).optional(),
});

const AnthropicResponseSchema = z.object({
  content: z.array(z.union([
    z.object({ type: z.literal("text"), text: z.string() }).passthrough(),
    z.object({
      type: z.literal("tool_use"),
      id: z.string().min(1),
      name: z.string().min(1),
      input: z.record(z.unknown()),
    }).passthrough(),
  ])),
  usage: z.object({
    input_tokens: OptionalTokenCountSchema,
    output_tokens: OptionalTokenCountSchema,
  }).optional(),
});

const OllamaResponseSchema = z.object({
  message: z.object({
    content: z.string().optional(),
    tool_calls: z.array(z.object({
      id: z.string().min(1).optional(),
      function: z.object({
        name: z.string().min(1),
        arguments: z.union([z.string(), z.record(z.unknown())]),
      }),
    })).optional(),
  }),
});

const OllamaModelsResponseSchema = z.object({
  models: z.array(z.object({ name: z.string().min(1) })),
});

async function readResponseText(response: Response, signal?: AbortSignal): Promise<string> {
  if (!response.ok) {
    throw new ProjectOSError(
      "model_connection_failed",
      `Model provider request failed (HTTP ${response.status})`,
    );
  }
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/u.test(declaredLength) &&
    Number(declaredLength) > PROVIDER_MAX_RESPONSE_BYTES
  ) {
    throw providerResponseTooLarge();
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  // An aborted read ends the stream early; the caller checks the signal and does not parse a part.
  const stop = () => { void reader.cancel().catch(() => undefined); };
  if (signal?.aborted) stop();
  else signal?.addEventListener("abort", stop, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > PROVIDER_MAX_RESPONSE_BYTES) {
        throw providerResponseTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener("abort", stop);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function providerResponseTooLarge(): ProjectOSError {
  return new ProjectOSError(
    "model_connection_failed",
    `Model provider response exceeded ${PROVIDER_MAX_RESPONSE_BYTES} bytes`,
  );
}

function parseProviderJson<Schema extends z.ZodTypeAny>(
  text: string,
  schema: Schema,
): z.output<Schema> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    // What the provider sent goes in the details, never in the message: "invalid JSON" alone cannot
    // tell an empty body from an error page from a cut-off reply.
    throw new ProjectOSError(
      "model_connection_failed",
      "Model provider returned invalid JSON",
      {
        details: {
          reason: text.trim() === "" ? "empty_body" : "invalid_json",
          bodyBytes: text.length,
          bodyStart: sanitizeErrorMessage(text.trim().slice(0, 200)),
        },
      },
    );
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new ProjectOSError(
      "model_connection_failed",
      "Model provider returned an invalid response payload",
    );
  }
  return parsed.data;
}

const PROVIDER_FETCH_TIMEOUT_MS = 120_000;
const PROVIDER_FETCH_TRANSIENT_RETRIES = 2;

function isTransientProviderFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const haystack = [
    error.name,
    error.message,
    error instanceof Error && "cause" in error && error.cause instanceof Error
      ? `${error.cause.name} ${error.cause.message}`
      : "",
  ]
    .join(" ")
    .toLowerCase();
  return (
    haystack.includes("terminated") ||
    haystack.includes("fetch failed") ||
    haystack.includes("other side closed") ||
    haystack.includes("econnreset") ||
    haystack.includes("econnrefused") ||
    haystack.includes("socket") ||
    haystack.includes("und_err_socket")
  );
}

export type NetworkFailureKind = "dns" | "refused" | "unreachable" | "timeout" | "connection";

/**
 * What the network did, read from the error code the platform attached, so a person can be told
 * "could not reach the model" instead of the bare `fetch failed` that undici throws for all of it.
 * Undefined for anything that is not the network (a bad URL, a programming error).
 */
export function classifyNetworkFailure(error: unknown): NetworkFailureKind | undefined {
  if (!(error instanceof Error)) return undefined;
  const cause = "cause" in error && error.cause instanceof Error ? error.cause : undefined;
  const code = String((cause as { code?: unknown } | undefined)?.code ?? (error as { code?: unknown }).code ?? "");
  const text = `${error.message} ${cause?.message ?? ""}`.toLowerCase();
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || text.includes("getaddrinfo")) return "dns";
  if (code === "ECONNREFUSED") return "refused";
  if (code === "ENETUNREACH" || code === "EHOSTUNREACH" || code === "ENETDOWN") return "unreachable";
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") return "timeout";
  if (code === "ECONNRESET" || code.startsWith("UND_ERR") || text.includes("fetch failed") || text.includes("other side closed")) {
    return "connection";
  }
  return undefined;
}

function unreachableError(url: string, error: unknown): Error {
  const kind = classifyNetworkFailure(error);
  if (!kind) return error instanceof Error ? error : new Error("Model request failed");
  let host = "the model provider";
  try { host = new URL(url).host; } catch { /* keep the generic name */ }
  return new ProjectOSError(
    "model_unreachable",
    `Model provider unreachable (${kind}): ${host}`,
    { cause: error, details: { kind, host } },
  );
}

const PROVIDER_BODY_RETRIES = 1;

function isUnreadableProviderBody(error: unknown): boolean {
  if (!(error instanceof ProjectOSError)) return false;
  const reason = (error.details as { reason?: unknown } | undefined)?.reason;
  return reason === "invalid_json" || reason === "empty_body";
}

/**
 * Read a reply's body within the same deadline as its headers, and ask again once when what came
 * back is not JSON at all (empty, an error page, cut off): that is the provider or a proxy failing,
 * not the model answering badly, and giving up there threw away a whole multi-call run. A reply that
 * is JSON of the wrong shape is not asked for again.
 */
async function withBodyRetry<T>(
  attempt: (readBody: (response: Response) => Promise<string>) => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  for (let tries = 0; ; tries += 1) {
    const readBody = async (response: Response): Promise<string> => {
      const bodyAbort = new AbortController();
      const timer = setTimeout(() => bodyAbort.abort(), timeoutMs);
      const onCallerAbort = () => bodyAbort.abort();
      signal?.addEventListener("abort", onCallerAbort, { once: true });
      try {
        const text = await readResponseText(response, bodyAbort.signal);
        if (bodyAbort.signal.aborted) {
          if (signal?.aborted) throw new Error("Model request cancelled");
          throw new ProjectOSError(
            "model_timeout",
            `Model request timed out after ${timeoutMs / 1000}s`,
            { details: { seconds: timeoutMs / 1000 } },
          );
        }
        return text;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onCallerAbort);
      }
    };
    try {
      return await attempt(readBody);
    } catch (error) {
      if (tries < PROVIDER_BODY_RETRIES && isUnreadableProviderBody(error) && !signal?.aborted) continue;
      throw error;
    }
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = PROVIDER_FETCH_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= PROVIDER_FETCH_TRANSIENT_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (signal?.aborted) throw new Error("Model request cancelled");
        throw new ProjectOSError(
          "model_timeout",
          `Model request timed out after ${timeoutMs / 1000}s`,
          { details: { seconds: timeoutMs / 1000 } },
        );
      }
      lastError = error;
      if (
        !isTransientProviderFetchError(error) ||
        attempt === PROVIDER_FETCH_TRANSIENT_RETRIES
      ) {
        throw unreachableError(url, error);
      }
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Model request failed");
}

function providerUsage(usage: {
  // Raw provider usage counters; either may be missing from a response.
  input?: number | undefined;
  output?: number | undefined;
} | undefined): Pick<ProviderCompleteResult, "inputTokens" | "outputTokens" | "usageReported"> {
  if (!usage) {
    return { inputTokens: 0, outputTokens: 0, usageReported: false };
  }
  return {
    inputTokens: usage.input ?? 0,
    outputTokens: usage.output ?? 0,
    usageReported: true,
  };
}

async function testProviderConnection(
  complete: () => Promise<ProviderCompleteResult>,
): Promise<{ ok: boolean; message?: string }> {
  try {
    await complete();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/u, "");
}

export function openAiChatCompletionsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

export function anthropicMessagesUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith("/messages")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/messages`;
  }
  return `${normalized}/v1/messages`;
}

export function ollamaChatUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith("/api/chat")) {
    return normalized;
  }
  return `${normalized}/api/chat`;
}

export function anthropicThinkingBudget(depth: ThinkingDepth): number {
  switch (depth) {
    case "low":
      return 1024;
    case "medium":
      return 4096;
    case "high":
      return 16000;
    default:
      return 4096;
  }
}

export function buildOpenAiChatBody(
  profile: ResolvedModelProfile,
  input: ProviderCompleteInput,
): Record<string, unknown> {
  const messages = input.messages
    ? [
        ...(input.systemPrompt
          ? [{ role: "system", content: input.systemPrompt }]
          : []),
        ...input.messages.map((message, index) => ({
        role: message.role,
        content:
          message.role === "user" && index === input.messages!.length - 1
            ? buildOpenAiUserContent(message.content, input.images)
            : message.content,
        ...(message.toolCalls
          ? {
              tool_calls: message.toolCalls.map((toolCall) => ({
                id: toolCall.id,
                type: "function",
                function: {
                  name: toolCall.name,
                  arguments: toolCall.arguments,
                },
              })),
            }
          : {}),
        ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
      })),
      ]
    : [
        ...(input.systemPrompt
          ? [{ role: "system", content: input.systemPrompt }]
          : []),
        {
          role: "user",
          content: buildOpenAiUserContent(input.userPrompt ?? "", input.images),
        },
      ];
  const body: Record<string, unknown> = {
    model: profile.model,
    messages,
    max_tokens: input.maxOutputTokens ?? 2048,
    temperature: 0.2,
  };
  if (input.tools?.length) body.tools = input.tools;
  if (
    input.thinkingDepth &&
    input.thinkingDepth !== "off" &&
    supportsOpenAiReasoningEffort(profile.model)
  ) {
    body.reasoning_effort = input.thinkingDepth;
  }
  // DeepSeek reasons by default and "off" used to change nothing: the model still spent its whole
  // output budget thinking (titles and digests were cut off at 64-400 tokens). It has an explicit switch.
  if (input.thinkingDepth === "off" && isDeepSeekEndpoint(profile.baseUrl)) {
    body.thinking = { type: "disabled" };
  }
  return body;
}

export function isDeepSeekEndpoint(baseUrl: string | undefined): boolean {
  try {
    return new URL(baseUrl ?? "").hostname.toLowerCase().endsWith("deepseek.com");
  } catch {
    return false;
  }
}

export function supportsOpenAiReasoningEffort(model: string): boolean {
  const normalized = model.toLowerCase();
  return (
    normalized.includes("o1") ||
    normalized.includes("o3") ||
    normalized.includes("o4") ||
    normalized.startsWith("gpt-5")
  );
}

export function buildAnthropicMessagesBody(
  profile: ResolvedModelProfile,
  input: ProviderCompleteInput,
): Record<string, unknown> {
  const sourceMessages = input.messages ?? [
    { role: "user" as const, content: input.userPrompt ?? "" },
  ];
  const lastUserIndex = (() => {
    for (let i = sourceMessages.length - 1; i >= 0; i -= 1) {
      if (sourceMessages[i]?.role === "user") return i;
    }
    return -1;
  })();
  const messages = sourceMessages.map((message, index) => {
    if (message.role === "assistant") {
      const content: Array<Record<string, unknown>> = [];
      if (message.content) content.push({ type: "text", text: message.content });
      for (const toolCall of message.toolCalls ?? []) {
        let inputValue: unknown = {};
        try {
          inputValue = JSON.parse(toolCall.arguments) as unknown;
        } catch {
          inputValue = {};
        }
        content.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.name,
          input: inputValue,
        });
      }
      return { role: "assistant", content };
    }
    if (message.role === "tool") {
      return {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: message.content,
        }],
      };
    }
    return {
      role: "user",
      content:
        index === lastUserIndex
          ? buildAnthropicUserContent(message.content, input.images)
          : message.content,
    };
  });
  const body: Record<string, unknown> = {
    model: profile.model,
    max_tokens: input.maxOutputTokens ?? 2048,
    system: input.systemPrompt,
    messages,
  };
  if (input.tools?.length) body.tools = input.tools.map((tool) => ({
    name: tool.function.name,
    ...(tool.function.description ? { description: tool.function.description } : {}),
    input_schema: tool.function.parameters,
  }));
  if (
    input.thinkingDepth &&
    input.thinkingDepth !== "off" &&
    supportsAnthropicThinking(profile.model)
  ) {
    body.thinking = {
      type: "enabled",
      budget_tokens: anthropicThinkingBudget(input.thinkingDepth),
    };
  }
  return body;
}

export function supportsAnthropicThinking(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.includes("claude") && (
    normalized.includes("sonnet-4") ||
    normalized.includes("opus-4") ||
    normalized.includes("3-7") ||
    normalized.includes("thinking")
  );
}

export function extractOpenAiMessageParts(
  message:
    | {
        content?: string | null | undefined;
        reasoning_content?: string | null | undefined;
        reasoning?: string | null | undefined;
        tool_calls?: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }> | undefined;
      }
    | undefined,
): {
  output: string;
  reasoning?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
} {
  const separated = separateLeadingThinkBlock(message?.content ?? "");
  // OpenAI-compatible providers disagree on the reasoning field name:
  // DeepSeek uses `reasoning_content`; K2Think/OpenRouter use `reasoning`.
  const providerReasoning = (
    message?.reasoning_content ??
    message?.reasoning ??
    ""
  ).trim();
  const reasoning = providerReasoning || separated.reasoning;
  return {
    output: separated.output,
    ...(reasoning ? { reasoning } : {}),
    ...(message?.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
  };
}

export function separateLeadingThinkBlock(content: string): {
  output: string;
  reasoning?: string;
} {
  const match = content.match(/^\s*<think>([\s\S]*?)<\/think>/iu);
  if (!match) {
    return { output: content.trim() };
  }
  const reasoning = match[1]?.trim() ?? "";
  const output = content.slice(match[0].length).trim();
  return {
    output,
    ...(reasoning ? { reasoning } : {}),
  };
}

export class OpenAiProviderAdapter implements ModelProviderAdapter {
  async complete(
    profile: ResolvedModelProfile,
    apiKey: string | undefined,
    input: ProviderCompleteInput,
  ): Promise<ProviderCompleteResult> {
    const body = await withBodyRetry(async (readBody) => {
      const response = await fetchWithTimeout(openAiChatCompletionsUrl(profile.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(buildOpenAiChatBody(profile, input)),
    }, PROVIDER_FETCH_TIMEOUT_MS, input.signal);
      return parseProviderJson(await readBody(response), OpenAiResponseSchema);
    }, PROVIDER_FETCH_TIMEOUT_MS, input.signal);
    const choice = body.choices[0]!;
    const message = extractOpenAiMessageParts(choice.message);
    const toolCalls = message.tool_calls?.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: toolCall.function.arguments,
    }));
    return {
      ...message,
      ...(toolCalls?.length ? { toolCalls } : {}),
      ...(choice.finish_reason
        ? { finishReason: choice.finish_reason }
        : {}),
      ...providerUsage(body.usage
        ? { input: body.usage.prompt_tokens, output: body.usage.completion_tokens }
        : undefined),
    };
  }

  async testConnection(
    profile: ResolvedModelProfile,
    apiKey: string | undefined,
  ): Promise<{ ok: boolean; message?: string }> {
    return testProviderConnection(() =>
      this.complete(profile, apiKey, {
        userPrompt: "Reply with OK",
        maxOutputTokens: 8,
      }),
    );
  }
}

export class AnthropicProviderAdapter implements ModelProviderAdapter {
  async complete(
    profile: ResolvedModelProfile,
    apiKey: string | undefined,
    input: ProviderCompleteInput,
  ): Promise<ProviderCompleteResult> {
    const body = await withBodyRetry(async (readBody) => {
      const response = await fetchWithTimeout(anthropicMessagesUrl(profile.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify(buildAnthropicMessagesBody(profile, input)),
    }, PROVIDER_FETCH_TIMEOUT_MS, input.signal);
      return parseProviderJson(await readBody(response), AnthropicResponseSchema);
    }, PROVIDER_FETCH_TIMEOUT_MS, input.signal);
    const output = body.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("");
    const toolCalls = body.content
      .filter((part): part is {
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, unknown>;
      } => part.type === "tool_use")
      .map((part) => ({
        id: part.id,
        name: part.name,
        arguments: JSON.stringify(part.input),
      }));
    return {
      output,
      ...(toolCalls.length ? { toolCalls } : {}),
      ...providerUsage(body.usage
        ? { input: body.usage.input_tokens, output: body.usage.output_tokens }
        : undefined),
    };
  }

  async testConnection(
    profile: ResolvedModelProfile,
    apiKey: string | undefined,
  ): Promise<{ ok: boolean; message?: string }> {
    return testProviderConnection(() =>
      this.complete(profile, apiKey, {
        userPrompt: "Reply with OK",
        maxOutputTokens: 8,
      }),
    );
  }
}

export class OllamaProviderAdapter implements ModelProviderAdapter {
  async complete(
    profile: ResolvedModelProfile,
    _apiKey: string | undefined,
    input: ProviderCompleteInput,
  ): Promise<ProviderCompleteResult> {
    const body = await withBodyRetry(async (readBody) => {
      const response = await fetchWithTimeout(ollamaChatUrl(profile.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: profile.model,
        stream: false,
        messages: [
          ...(input.systemPrompt
            ? [{ role: "system", content: input.systemPrompt }]
            : []),
        ...(input.messages
          ? input.messages.map((message) => ({
              role: message.role,
              content: message.content,
              ...(message.toolCalls
                ? {
                    tool_calls: message.toolCalls.map((toolCall) => ({
                      id: toolCall.id,
                      type: "function",
                      function: {
                        name: toolCall.name,
                        arguments: toolCall.arguments,
                      },
                    })),
                  }
                : {}),
              ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
            }))
          : [{ role: "user" as const, content: input.userPrompt ?? "" }]),
        ],
        ...(input.tools?.length ? { tools: input.tools } : {}),
      }),
    }, PROVIDER_FETCH_TIMEOUT_MS, input.signal);
      return parseProviderJson(await readBody(response), OllamaResponseSchema);
    }, PROVIDER_FETCH_TIMEOUT_MS, input.signal);
    const output = body.message.content ?? "";
    return {
      output,
      ...(body.message.tool_calls?.length
        ? {
          toolCalls: body.message.tool_calls.map((toolCall, index) => ({
              id: toolCall.id ?? `ollama_${toolCall.function.name}_${index}`,
              name: toolCall.function.name,
              arguments: typeof toolCall.function.arguments === "string"
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments),
            })),
          }
        : {}),
      ...providerUsage(undefined),
    };
  }

  async listModels(
    profile: ResolvedModelProfile,
    _apiKey: string | undefined,
  ): Promise<Array<{ id: string; name: string }>> {
    const body = await withBodyRetry(async (readBody) => {
      const response = await fetchWithTimeout(
        `${normalizeBaseUrl(profile.baseUrl)}/api/tags`,
        { method: "GET" },
      );
      return parseProviderJson(await readBody(response), OllamaModelsResponseSchema);
    }, PROVIDER_FETCH_TIMEOUT_MS, undefined);
    return body.models.map((model) => ({
      id: model.name,
      name: model.name,
    }));
  }

  async testConnection(
    profile: ResolvedModelProfile,
    apiKey: string | undefined,
  ): Promise<{ ok: boolean; message?: string }> {
    return testProviderConnection(() =>
      this.complete(profile, apiKey, {
        userPrompt: "Reply with OK",
        maxOutputTokens: 8,
      }),
    );
  }
}

export function createProviderAdapter(
  apiFormat: ModelApiFormat,
): ModelProviderAdapter {
  if (apiFormat === "anthropic_messages") {
    return new AnthropicProviderAdapter();
  }
  if (apiFormat === "ollama_chat") {
    return new OllamaProviderAdapter();
  }
  return new OpenAiProviderAdapter();
}

export function resolveProfileForGateway(profile: ModelProfile): ResolvedModelProfile {
  return normalizeModelProfile(profile);
}

export function apiKeyRequired(apiFormat: ModelApiFormat): boolean {
  return apiFormat !== "ollama_chat";
}

export async function resolveApiKey(
  secretStore: SecretStore,
  profile: ResolvedModelProfile,
): Promise<string | undefined> {
  if (!apiKeyRequired(profile.apiFormat)) {
    return undefined;
  }
  if (!profile.apiKeyRef) {
    return undefined;
  }
  return secretStore.get(profile.apiKeyRef);
}
