import { describe, expect, it } from "vitest";

import type { AgentContextBundle } from "../contracts/local-context.js";
import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
  ModelToolCall,
} from "../contracts/model-gateway.js";
import type { ModelProfile } from "../contracts/settings.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import type { ResolvedResponseLanguage } from "./agent-language-policy.js";
import {
  GroundedAnswerService,
  REASONING_MAX_BYTES,
  REASONING_MAX_CHARACTERS,
} from "./grounded-answer-service.js";
import { readCapabilityContext } from "./harness/tool-policy.js";
import {
  ModelGateway,
  type ModelToolExecutionResult,
  type ModelToolLoopOptions,
} from "./model-gateway/index.js";

const profile: ModelProfile = {
  id: "answer-model",
  name: "Answer model",
  provider: "openai",
  model: "reasoning-model",
  apiKeyRef: "answer-key",
  isDefault: true,
};

const localContext = {
  scope: { kind: "node", nodeId: "node_auth" },
} as AgentContextBundle;

const chinese: ResolvedResponseLanguage = {
  tag: "zh",
  source: "detected",
  expectedScripts: ["han"],
};

describe("GroundedAnswerService", () => {
  it("treats project context as optional background for ordinary conversation", async () => {
    const gateway = new QueuedGateway([
      response({ output: "你好！有什么我可以帮你的吗？" }),
    ]);

    await new GroundedAnswerService(gateway).answer({
      projectId: "project-test",
      question: "你好",
      localContext,
      profile,
      thinkingDepth: "medium",
      responseLanguage: chinese,
    });

    const systemPrompt = gateway.requests[0]?.systemPrompt ?? "";
    expect(systemPrompt).toContain(
      "For greetings, thanks, and small talk, respond naturally and briefly without summarizing or describing the supplied project context.",
    );
    expect(systemPrompt).toContain(
      "Never volunteer a node or file description merely because context was supplied.",
    );
    expect(systemPrompt).toContain(
      "For factual claims about this project or its code, rely only on the supplied context",
    );
    expect(systemPrompt).toContain(
      "Use it when relevant; its presence is not a request to summarize the node.",
    );
    expect(systemPrompt).toContain(
      "synopsisOmittedNodeCount field describes only the concise project synopsis",
    );
    expect(systemPrompt).toContain(
      "selected and connected file contents",
    );
    const serializedInput = JSON.stringify(gateway.requests[0]?.input);
    expect(serializedInput.indexOf("<untrusted_local_context>"))
      .toBeLessThan(serializedInput.indexOf('"localContext"'));
    expect(serializedInput.indexOf('"localContext"'))
      .toBeLessThan(serializedInput.indexOf("</untrusted_local_context>"));
  });

  it("returns redacted, capped provider reasoning with an honest truncation flag", async () => {
    const answerSecret = `sk-proj-${"a".repeat(32)}`;
    const reasoningSecret =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlX3ZhbHVlXzEyMzQ1Njc4OTA";
    const gateway = new QueuedGateway([response({
      output: `这里是一个只包含经过验证的项目上下文并且不会泄露任何凭据的安全答案。${answerSecret} /Users/rui/private.txt`,
      reasoning: `${reasoningSecret} ${"思".repeat(REASONING_MAX_CHARACTERS + 10)}`,
    })]);

    const result = await answerWith(gateway, chinese);

    expect(result.answer).toContain("[REDACTED]");
    expect(result.answer).toContain("[PATH]");
    expect(result.answer).not.toContain(answerSecret);
    expect(result.reasoning).toMatchObject({
      source: "provider_supplied",
      truncated: true,
    });
    expect(result.reasoning?.content).toContain("[REDACTED]");
    expect(result.reasoning?.content).not.toContain(reasoningSecret);
    expect([...(result.reasoning?.content ?? "")].length)
      .toBeLessThanOrEqual(REASONING_MAX_CHARACTERS);
    expect(new TextEncoder().encode(result.reasoning?.content ?? "").byteLength)
      .toBeLessThanOrEqual(REASONING_MAX_BYTES);
  });

  it("does not fabricate reasoning when the gateway omits it", async () => {
    const result = await answerWith(
      new QueuedGateway([response({ output: "这是符合要求的中文答案。" })]),
      chinese,
    );

    expect(result.reasoning).toBeUndefined();
  });

  it("rejects reasoning-only responses as empty answers", async () => {
    await expect(answerWith(
      new QueuedGateway([response({ output: "", reasoning: "Internal trace" })]),
      chinese,
    )).rejects.toMatchObject({
      code: "agent_answer_unavailable",
      message: "The model returned an empty answer",
      details: {
        reasoning: {
          content: "Internal trace",
          source: "provider_supplied",
          truncated: false,
        },
      },
    });
  });

  it("returns only reasoning associated with the accepted language retry", async () => {
    const gateway = new QueuedGateway([
      response({
        output: "This response is written entirely in English.",
        reasoning: "rejected attempt reasoning",
      }),
      response({
        output: "这是重试后通过语言检查的中文答案。",
        reasoning: "accepted attempt reasoning",
      }),
    ]);

    const result = await answerWith(gateway, chinese);

    expect(gateway.requests).toHaveLength(2);
    expect(result.validation).toBe("retry_passed");
    expect(result.reasoning?.content).toBe("accepted attempt reasoning");
    expect(result.reasoning?.content).not.toContain("rejected");
  });

  it("returns the language-steered retry when it still has a gross mismatch", async () => {
    const gateway = new QueuedGateway([
      response({ output: "The first answer is in English." }),
      response({
        output: "The retried answer is still in English.",
        reasoning: "retry reasoning",
      }),
    ]);

    const result = await answerWith(gateway, chinese);

    expect(gateway.requests).toHaveLength(2);
    expect(result).toEqual({
      answer: "The retried answer is still in English.",
      reasoning: {
        content: "retry reasoning",
        source: "provider_supplied",
        truncated: false,
      },
      validation: "mismatch_after_retry",
    });
  });

  it("uses completeWithTools when MCP tools are provided and records mcpToolCalls", async () => {
    const gateway = new QueuedGateway([
      response({ output: "根据工具结果：找到了。" }),
    ]);
    const executeTool = async (
      call: ModelToolCall,
    ): Promise<ModelToolExecutionResult> => {
      expect(call.name).toBe("mcp:docs:search");
      return { content: "found" };
    };
    gateway.completeWithToolsImpl = async (_profile, request, options) => {
      gateway.requests.push(request);
      expect(options.tools).toHaveLength(1);
      const call: ModelToolCall = {
        id: "call_1",
        name: "mcp:docs:search",
        arguments: "{}",
      };
      const result = await options.executeTool(call);
      options.onToolCall?.({ call, result, durationMs: 5 });
      const next = gateway.shiftResponse();
      return next;
    };

    const result = await new GroundedAnswerService(gateway).answer({
      projectId: "project-test",
      question: "查一下文档",
      localContext,
      profile,
      thinkingDepth: "medium",
      responseLanguage: chinese,
      mcp: {
        tools: [{
          type: "function",
          function: {
            name: "mcp:docs:search",
            parameters: { type: "object", properties: {} },
          },
        }],
        executeTool,
        toolPolicy: {
          context: readCapabilityContext({ mode: "ask", allowedReadPaths: [] }),
          rules: [{ effect: "allow", tool: "mcp_tool", match: "mcp:docs:*" }],
        },
      },
    });

    expect(result.answer).toContain("找到了");
    expect(result.mcpToolCalls).toEqual([
      expect.objectContaining({
        serverId: "docs",
        toolName: "search",
        callId: "call_1",
        status: "completed",
        durationMs: 5,
      }),
    ]);
    expect(gateway.completeCalls).toBe(0);
    expect(gateway.completeWithToolsCalls).toBe(1);
  });
});

class QueuedGateway extends ModelGateway {
  readonly requests: ModelGatewayRequest[] = [];
  completeCalls = 0;
  completeWithToolsCalls = 0;
  completeWithToolsImpl?: ModelGateway["completeWithTools"];

  constructor(private readonly responses: ModelGatewayResponse[]) {
    super({ secretStore: new InMemorySecretStore() });
  }

  shiftResponse(): ModelGatewayResponse {
    const next = this.responses.shift();
    if (!next) throw new Error("Missing queued model response");
    return next;
  }

  override async complete(
    _profile: ModelProfile,
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    this.completeCalls += 1;
    this.requests.push(request);
    return this.shiftResponse();
  }

  override async completeWithTools(
    profile: ModelProfile,
    request: ModelGatewayRequest,
    options: ModelToolLoopOptions,
  ): Promise<ModelGatewayResponse> {
    this.completeWithToolsCalls += 1;
    if (this.completeWithToolsImpl) {
      return this.completeWithToolsImpl(profile, request, options);
    }
    return super.completeWithTools(profile, request, options);
  }
}

function response(input: {
  output: string;
  reasoning?: string;
}): ModelGatewayResponse {
  return {
    requestId: "request-test",
    provider: "test",
    model: "reasoning-model",
    output: input.output,
    ...(input.reasoning ? { reasoning: input.reasoning } : {}),
    usage: { inputTokens: 10, outputTokens: 10 },
    latencyMs: 1,
  };
}

async function answerWith(
  gateway: ModelGateway,
  responseLanguage: ResolvedResponseLanguage,
) {
  return new GroundedAnswerService(gateway).answer({
    projectId: "project-test",
    question: "请解释这个节点",
    localContext,
    profile,
    thinkingDepth: "medium",
    responseLanguage,
  });
}
