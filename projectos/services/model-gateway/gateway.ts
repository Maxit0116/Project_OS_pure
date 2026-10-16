import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
  ModelToolCall,
  ModelToolDefinition,
} from "../../contracts/model-gateway.js";
import type { ModelProfile } from "../../contracts/settings.js";
import { modelProfileLabel } from "../../contracts/settings.js";
import type { SecretStore } from "../../persistence/secret-store.js";
import { ProjectOSError } from "../../errors.js";
import { redactText } from "./redaction.js";
import {
  apiKeyRequired,
  createProviderAdapter,
  resolveApiKey,
  resolveProfileForGateway,
  type ProviderCompleteInput,
  type ProviderMessage,
} from "./providers.js";

export interface ModelGatewayOptions {
  secretStore: SecretStore;
}

export interface ModelToolExecutionResult {
  content: string;
  isError?: boolean;
}

export interface ModelToolLoopOptions {
  tools: ModelToolDefinition[];
  executeTool: (
    call: ModelToolCall,
    signal?: AbortSignal,
  ) => Promise<ModelToolExecutionResult>;
  onToolCall?: (event: {
    call: ModelToolCall;
    result?: ModelToolExecutionResult;
    durationMs?: number;
  }) => void;
  maxIterations?: number;
  maxToolCalls?: number;
  maxTotalDurationMs?: number;
  signal?: AbortSignal;
}

export class ModelGateway {
  private readonly secretStore: SecretStore;

  constructor(options: ModelGatewayOptions) {
    this.secretStore = options.secretStore;
  }

  async complete(
    profile: ModelProfile,
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    const started = Date.now();
    const resolved = resolveProfileForGateway(profile);
    const adapter = createProviderAdapter(resolved.apiFormat);
    const apiKey = await resolveApiKey(this.secretStore, resolved);
    if (!apiKey && apiKeyRequired(resolved.apiFormat)) {
      throw new ProjectOSError(
        "model_connection_failed",
        `Model profile '${profile.id}' is missing an API key`,
      );
    }

    const input = this.buildProviderInput(request);
    const result = await adapter.complete(resolved, apiKey, input);
    const output = redactText(result.output, request.redactionPolicy);
    const reasoning = result.reasoning
      ? redactText(result.reasoning, request.redactionPolicy)
      : undefined;

    return {
      requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      provider: modelProfileLabel(profile),
      model: profile.model,
      output,
      ...(reasoning ? { reasoning } : {}),
      ...(result.finishReason ? { finishReason: result.finishReason } : {}),
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
      latencyMs: Date.now() - started,
    };
  }

  async completeWithTools(
    profile: ModelProfile,
    request: ModelGatewayRequest,
    options: ModelToolLoopOptions,
  ): Promise<ModelGatewayResponse> {
    if (options.tools.length === 0) return this.complete(profile, request);
    const started = Date.now();
    const resolved = resolveProfileForGateway(profile);
    const adapter = createProviderAdapter(resolved.apiFormat);
    const apiKey = await resolveApiKey(this.secretStore, resolved);
    if (!apiKey && apiKeyRequired(resolved.apiFormat)) {
      throw new ProjectOSError(
        "model_connection_failed",
        `Model profile '${profile.id}' is missing an API key`,
      );
    }

    const baseInput = this.buildProviderInput(request);
    const messages: ProviderMessage[] = [{
      role: "user",
      content: baseInput.userPrompt ?? "",
    }];
    const maxIterations = options.maxIterations ?? 8;
    const maxToolCalls = options.maxToolCalls ?? 32;
    const maxTotalDurationMs = options.maxTotalDurationMs ?? 120_000;
    let toolCallCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let lastOutput = "";
    let lastReasoning: string | undefined;
    let lastFinishReason: string | undefined;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      if (Date.now() - started > maxTotalDurationMs) {
        throw new ProjectOSError(
          "external_agent_failed",
          `Model exceeded the ${maxTotalDurationMs}ms MCP tool-loop time limit`,
        );
      }
      if (options.signal?.aborted) {
        throw new ProjectOSError("external_agent_failed", "MCP tool loop was cancelled");
      }
      const providerInput: ProviderCompleteInput = {
        ...baseInput,
        messages,
        tools: options.tools,
        ...(options.signal ? { signal: options.signal } : {}),
      };
      const result = await adapter.complete(resolved, apiKey, providerInput);
      inputTokens += result.inputTokens;
      outputTokens += result.outputTokens;
      lastOutput = result.output;
      lastReasoning = result.reasoning;
      lastFinishReason = result.finishReason;
      if (!result.toolCalls?.length) {
        return {
          requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          provider: modelProfileLabel(profile),
          model: profile.model,
          output: redactText(lastOutput, request.redactionPolicy),
          ...(lastReasoning
            ? { reasoning: redactText(lastReasoning, request.redactionPolicy) }
            : {}),
          ...(lastFinishReason ? { finishReason: lastFinishReason } : {}),
          usage: { inputTokens, outputTokens },
          latencyMs: Date.now() - started,
        };
      }

      const toolCalls = result.toolCalls;
      toolCallCount += toolCalls.length;
      if (toolCallCount > maxToolCalls) {
        throw new ProjectOSError(
          "external_agent_failed",
          `Model exceeded the ${maxToolCalls} MCP tool-call limit`,
        );
      }
      messages.push({
        role: "assistant",
        content: result.output,
        toolCalls,
      });
      for (const call of toolCalls) {
        let execution: ModelToolExecutionResult;
        const callStarted = Date.now();
        try {
          const parsedArguments = JSON.parse(call.arguments) as unknown;
          if (
            parsedArguments === null ||
            typeof parsedArguments !== "object" ||
            Array.isArray(parsedArguments)
          ) {
            throw new Error("Tool arguments must be a JSON object");
          }
          execution = await options.executeTool(
            {
              ...call,
              arguments: JSON.stringify(parsedArguments),
            },
            options.signal,
          );
        } catch (error) {
          execution = {
            isError: true,
            content: error instanceof Error ? error.message : String(error),
          };
        }
        options.onToolCall?.({
          call,
          result: execution,
          durationMs: Date.now() - callStarted,
        });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: redactText(execution.content, request.redactionPolicy),
        });
      }
    }

    throw new ProjectOSError(
      "external_agent_failed",
      `Model exceeded the ${maxIterations} MCP tool-loop iteration limit`,
    );
  }

  async testConnection(profile: ModelProfile) {
    const started = Date.now();
    const resolved = resolveProfileForGateway(profile);
    const adapter = createProviderAdapter(resolved.apiFormat);
    const apiKey = await resolveApiKey(this.secretStore, resolved);
    if (!apiKey && apiKeyRequired(resolved.apiFormat)) {
      return {
        ok: false,
        message: "API key is required for this model profile",
        latencyMs: Date.now() - started,
      };
    }
    const result = await adapter.testConnection(resolved, apiKey);
    return {
      ...result,
      latencyMs: Date.now() - started,
    };
  }

  async listModels(profile: ModelProfile) {
    const resolved = resolveProfileForGateway(profile);
    const adapter = createProviderAdapter(resolved.apiFormat);
    if (!adapter.listModels) {
      return [{ id: profile.model, name: profile.model }];
    }
    const apiKey = await resolveApiKey(this.secretStore, resolved);
    return adapter.listModels(resolved, apiKey);
  }

  private buildProviderInput(request: ModelGatewayRequest): ProviderCompleteInput {
    const serialized =
      typeof request.input === "string"
        ? request.input
        : JSON.stringify(request.input, null, 2);
    const userPrompt = redactText(serialized, request.redactionPolicy);
    return {
      userPrompt,
      ...(request.systemPrompt
        ? {
            systemPrompt: redactText(request.systemPrompt, request.redactionPolicy),
          }
        : {}),
      ...(request.maxOutputTokens !== undefined
        ? { maxOutputTokens: request.maxOutputTokens }
        : {}),
      ...(request.thinkingDepth !== undefined
        ? { thinkingDepth: request.thinkingDepth }
        : {}),
      ...(request.images?.length ? { images: request.images } : {}),
    };
  }
}
