import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
  ModelToolCall,
  ModelToolDefinition,
} from "../../contracts/model-gateway.js";
import type { CapabilityContext, ToolPermissionRule } from "../../contracts/tool-policy.js";
import type { ModelProfile } from "../../contracts/settings.js";
import { modelProfileLabel } from "../../contracts/settings.js";
import type { SecretStore } from "../../persistence/secret-store.js";
import { ProjectOSError } from "../../errors.js";
import { loadToolPermissionDocument } from "../harness/permissions.js";
import { evaluateToolCall } from "../harness/tool-policy.js";
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
  /** Fired when ToolPolicy blocks or asks (for Agent Flow `tool_policy_decision`). */
  onPolicyDecision?: (event: {
    tool: "mcp_tool";
    decision: "allow" | "ask" | "deny";
    reason: string;
    match: string;
  }) => void;
  maxIterations?: number;
  maxToolCalls?: number;
  maxTotalDurationMs?: number;
  signal?: AbortSignal;
  /** When set, every tool call is gated by Agent Harness ToolPolicy (H3.A). */
  toolPolicy?: {
    context: CapabilityContext;
    /** Explicit rules. When omitted, load `.projectos/permissions.json` if `workspaceRoot` is set. */
    rules?: readonly ToolPermissionRule[];
    workspaceRoot?: string;
  };
}

export class ModelGateway {
  private readonly secretStore: SecretStore;

  constructor(options: ModelGatewayOptions) {
    this.secretStore = options.secretStore;
  }

  async complete(
    profile: ModelProfile,
    request: ModelGatewayRequest,
    options?: { signal?: AbortSignal; maxTotalDurationMs?: number },
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

    if (options?.signal?.aborted) {
      throw new ProjectOSError(
        "operation_cancelled",
        "Model request cancelled",
        { details: { requestId: newModelRequestId() } },
      );
    }

    const requestId = newModelRequestId();
    throwIfCallerBudgetSpent(requestId, started, options?.maxTotalDurationMs);
    const deadline = budgetAbortSignal(options?.signal, options?.maxTotalDurationMs, started);
    const input: ProviderCompleteInput = {
      ...this.buildProviderInput(request),
      ...(deadline.signal ? { signal: deadline.signal } : {}),
    };
    let result;
    try {
      result = await adapter.complete(resolved, apiKey, input);
    } catch (error) {
      if (options?.signal?.aborted) {
        throw new ProjectOSError(
          "operation_cancelled",
          "Model request cancelled",
          { cause: error, details: { requestId } },
        );
      }
      throwIfCallerBudgetSpent(requestId, started, options?.maxTotalDurationMs);
      throw attachModelRequestId(requestId, error);
    } finally {
      deadline.stop();
    }
    const output = redactText(result.output, request.redactionPolicy);
    const reasoning = result.reasoning
      ? redactText(result.reasoning, request.redactionPolicy)
      : undefined;
    const usageReported = result.usageReported !== false;

    return {
      requestId,
      provider: modelProfileLabel(profile),
      model: profile.model,
      output,
      ...(reasoning ? { reasoning } : {}),
      ...(result.finishReason ? { finishReason: result.finishReason } : {}),
      usage: {
        inputTokens: usageReported ? result.inputTokens : 0,
        outputTokens: usageReported ? result.outputTokens : 0,
      },
      usageStatus: usageReported ? "reported" : "missing",
      latencyMs: Date.now() - started,
    };
  }

  async completeWithTools(
    profile: ModelProfile,
    request: ModelGatewayRequest,
    options: ModelToolLoopOptions,
  ): Promise<ModelGatewayResponse> {
    if (options.tools.length === 0) {
      return this.complete(profile, request, {
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.maxTotalDurationMs !== undefined
          ? { maxTotalDurationMs: options.maxTotalDurationMs }
          : {}),
      });
    }
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

    const requestId = newModelRequestId();
    const baseInput = this.buildProviderInput(request);
    const messages: ProviderMessage[] = [{
      role: "user",
      content: baseInput.userPrompt ?? "",
    }];
    const maxIterations = options.maxIterations ?? 8;
    const maxToolCalls = options.maxToolCalls ?? 32;
    const maxTotalDurationMs = options.maxTotalDurationMs ?? 120_000;
    let usageMissing = false;
    let toolCallCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let lastOutput = "";
    let lastReasoning: string | undefined;
    let lastFinishReason: string | undefined;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      if (Date.now() - started >= maxTotalDurationMs) {
        throw new ProjectOSError(
          "external_agent_failed",
          `Model exceeded the ${maxTotalDurationMs}ms MCP tool-loop time limit`,
          { details: { requestId } },
        );
      }
      if (options.signal?.aborted) {
        throw new ProjectOSError(
          "external_agent_failed",
          "MCP tool loop was cancelled",
          { details: { requestId } },
        );
      }
      const deadline = budgetAbortSignal(options.signal, maxTotalDurationMs, started);
      const providerInput: ProviderCompleteInput = {
        ...baseInput,
        messages,
        tools: options.tools,
        ...(deadline.signal ? { signal: deadline.signal } : {}),
      };
      let result;
      try {
        result = await adapter.complete(resolved, apiKey, providerInput);
      } catch (error) {
        if (options.signal?.aborted) {
          throw new ProjectOSError(
            "external_agent_failed",
            "MCP tool loop was cancelled",
            { cause: error, details: { requestId } },
          );
        }
        if (Date.now() - started >= maxTotalDurationMs) {
          throw new ProjectOSError(
            "external_agent_failed",
            `Model exceeded the ${maxTotalDurationMs}ms MCP tool-loop time limit`,
            { cause: error, details: { requestId } },
          );
        }
        throw attachModelRequestId(requestId, error);
      } finally {
        deadline.stop();
      }
      if (result.usageReported === false) usageMissing = true;
      inputTokens += result.usageReported === false ? 0 : result.inputTokens;
      outputTokens += result.usageReported === false ? 0 : result.outputTokens;
      lastOutput = result.output;
      lastReasoning = result.reasoning;
      lastFinishReason = result.finishReason;
      if (!result.toolCalls?.length) {
        return {
          requestId,
          provider: modelProfileLabel(profile),
          model: profile.model,
          output: redactText(lastOutput, request.redactionPolicy),
          ...(lastReasoning
            ? { reasoning: redactText(lastReasoning, request.redactionPolicy) }
            : {}),
          ...(lastFinishReason ? { finishReason: lastFinishReason } : {}),
          usage: { inputTokens, outputTokens },
          usageStatus: usageMissing ? "missing" : "reported",
          latencyMs: Date.now() - started,
        };
      }

      const toolCalls = result.toolCalls;
      toolCallCount += toolCalls.length;
      if (toolCallCount > maxToolCalls) {
        throw new ProjectOSError(
          "external_agent_failed",
          `Model exceeded the ${maxToolCalls} MCP tool-call limit`,
          { details: { requestId } },
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
          if (options.toolPolicy) {
            const permissionRules =
              options.toolPolicy.rules ??
              (options.toolPolicy.workspaceRoot
                ? loadToolPermissionDocument(options.toolPolicy.workspaceRoot).rules
                : []);
            const policyDecision = evaluateToolCall(
              {
                tool: "mcp_tool",
                match: call.name,
              },
              options.toolPolicy.context,
              { rules: permissionRules },
            );
            options.onPolicyDecision?.({
              tool: "mcp_tool",
              decision: policyDecision.decision,
              reason: policyDecision.reason,
              match: call.name,
            });
            if (policyDecision.decision !== "allow") {
              execution = {
                isError: true,
                content: `tool_policy_${policyDecision.decision}: ${policyDecision.reason}`,
              };
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
              continue;
            }
          }
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
      { details: { requestId } },
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

function newModelRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function throwIfCallerBudgetSpent(
  requestId: string,
  started: number,
  maxTotalDurationMs: number | undefined,
): void {
  if (maxTotalDurationMs === undefined) return;
  if (Date.now() - started < maxTotalDurationMs) return;
  throw new ProjectOSError(
    "external_agent_failed",
    `Model exceeded the ${maxTotalDurationMs}ms time limit`,
    { details: { requestId } },
  );
}

function budgetAbortSignal(
  parent: AbortSignal | undefined,
  maxTotalDurationMs: number | undefined,
  started: number,
): { signal: AbortSignal | undefined; stop: () => void } {
  if (parent === undefined && maxTotalDurationMs === undefined) {
    return { signal: undefined, stop: () => {} };
  }
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  parent?.addEventListener("abort", onParentAbort);
  if (parent?.aborted) controller.abort();
  const remaining = maxTotalDurationMs === undefined
    ? undefined
    : Math.max(0, maxTotalDurationMs - (Date.now() - started));
  const timer = remaining === undefined
    ? undefined
    : setTimeout(() => controller.abort(), remaining);
  return {
    signal: controller.signal,
    stop: () => {
      if (timer !== undefined) clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

function attachModelRequestId(requestId: string, error: unknown): ProjectOSError {
  if (error instanceof ProjectOSError) {
    return new ProjectOSError(error.code, error.message, {
      cause: error.cause ?? error,
      details: { ...(error.details ?? {}), requestId },
    });
  }
  const message = error instanceof Error ? error.message : "Model request failed";
  return new ProjectOSError("model_connection_failed", message, {
    cause: error,
    details: { requestId },
  });
}
