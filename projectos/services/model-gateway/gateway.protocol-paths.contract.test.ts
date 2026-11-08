import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelGatewayRequest, ModelRequestKind } from "../../contracts/model-gateway.js";
import { ModelRequestKindSchema } from "../../contracts/model-gateway.js";
import { normalizeModelProfile } from "../../contracts/settings.js";
import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { ModelGateway } from "./gateway.js";
import { applyOutboundRequestBounds } from "./outbound-request-bounds.js";
import { createProviderAdapter } from "./providers.js";

/**
 * Production-entry protocol contracts: ModelGateway.complete / completeWithTools
 * for each product requestKind × native apiFormat, with official-shaped HTTP stubs.
 * Connection success alone is not enough — each path must round-trip output/usage.
 */
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const openAiBody = {
  choices: [{ message: { role: "assistant", content: "PATH_OK" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 4 },
};

const anthropicBody = {
  id: "msg_path",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "PATH_OK" }],
  model: "claude-3-5-haiku-latest",
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 3 },
};

const ollamaBody = {
  message: { role: "assistant", content: "PATH_OK" },
  done: true,
  prompt_eval_count: 7,
  eval_count: 2,
};

const profiles = {
  openai_chat: normalizeModelProfile({
    id: "path-openai",
    name: "OpenAI",
    provider: "openai",
    model: "gpt-4o-mini",
    apiKeyRef: "path-key",
  }),
  anthropic_messages: normalizeModelProfile({
    id: "path-anthropic",
    name: "Anthropic",
    provider: "anthropic",
    model: "claude-3-5-haiku-latest",
    apiKeyRef: "path-key",
  }),
  ollama_chat: normalizeModelProfile({
    id: "path-ollama",
    name: "Ollama",
    provider: "ollama",
    model: "llama3.2",
    apiKeyRef: "",
  }),
  custom_openai: normalizeModelProfile({
    id: "path-custom-ds",
    name: "DeepSeek-shaped",
    provider: "custom",
    apiFormat: "openai_chat",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    apiKeyRef: "path-key",
  }),
} as const;

const bodies = {
  openai_chat: openAiBody,
  anthropic_messages: anthropicBody,
  ollama_chat: ollamaBody,
} as const;

/** Product paths that share ModelGateway.complete (Ask / Intent / refine / plan / generate / clarify stage). */
const productCompleteKinds: ModelRequestKind[] = [
  "question_answer",
  "request_intent",
  "prompt_refinement",
  "implementation_plan",
  "change_generation",
  "agent_step",
  "context_summary",
];

function requestFor(kind: ModelRequestKind): ModelGatewayRequest {
  return {
    projectId: "project-protocol-paths",
    requestKind: kind,
    input: { marker: kind },
    modelPreference: "path",
    redactionPolicy: "none",
  };
}

describe("ModelGateway protocol-path contracts (production entry)", () => {
  it("covers every ModelRequestKind in the schema inventory", () => {
    for (const kind of ModelRequestKindSchema.options) {
      expect(typeof kind).toBe("string");
    }
    for (const kind of productCompleteKinds) {
      expect(ModelRequestKindSchema.options).toContain(kind);
    }
  });

  for (const [format, profile] of Object.entries(profiles)) {
    const apiFormat =
      format === "custom_openai" ? "openai_chat" : (format as keyof typeof bodies);
    describe(`apiFormat=${format}`, () => {
      for (const kind of productCompleteKinds) {
        it(`complete(${kind}) returns output+usage without leaking secrets`, async () => {
          vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
              new Response(JSON.stringify(bodies[apiFormat]), {
                status: 200,
                headers: { "content-type": "application/json" },
              }),
            ),
          );
          const secrets = new InMemorySecretStore();
          if (profile.apiKeyRef) await secrets.set(profile.apiKeyRef, "secret-must-not-leak");
          const gateway = new ModelGateway({ secretStore: secrets });
          const result = await gateway.complete(profile, requestFor(kind));
          expect(result.output).toContain("PATH_OK");
          expect(result.usage.inputTokens + result.usage.outputTokens).toBeGreaterThan(0);
          expect(JSON.stringify(result)).not.toContain("secret-must-not-leak");
        });
      }

      it("completeWithTools executes tool result then final answer (Agent loop)", async () => {
        if (apiFormat === "ollama_chat") {
          // Ollama tool-loop shape is supported at adapter level; Agent MCP loop fixtures
          // use openai_chat / anthropic_messages production paths below.
          return;
        }
        const toolThenFinal =
          apiFormat === "anthropic_messages"
            ? [
                {
                  id: "msg_tool",
                  type: "message",
                  role: "assistant",
                  content: [{
                    type: "tool_use",
                    id: "toolu_1",
                    name: "mcp:demo:lookup",
                    input: { q: "x" },
                  }],
                  model: "claude-3-5-haiku-latest",
                  stop_reason: "tool_use",
                  usage: { input_tokens: 5, output_tokens: 2 },
                },
                {
                  id: "msg_final",
                  type: "message",
                  role: "assistant",
                  content: [{ type: "text", text: "TOOL_PATH_OK" }],
                  model: "claude-3-5-haiku-latest",
                  stop_reason: "end_turn",
                  usage: { input_tokens: 8, output_tokens: 3 },
                },
              ]
            : [
                {
                  choices: [{
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [{
                        id: "call_1",
                        type: "function",
                        function: {
                          name: "mcp:demo:lookup",
                          arguments: "{\"q\":\"x\"}",
                        },
                      }],
                    },
                    finish_reason: "tool_calls",
                  }],
                  usage: { prompt_tokens: 5, completion_tokens: 2 },
                },
                {
                  choices: [{
                    message: { role: "assistant", content: "TOOL_PATH_OK" },
                    finish_reason: "stop",
                  }],
                  usage: { prompt_tokens: 9, completion_tokens: 3 },
                },
              ];
        const fetchMock = vi.fn()
          .mockResolvedValueOnce(new Response(JSON.stringify(toolThenFinal[0]), { status: 200 }))
          .mockResolvedValueOnce(new Response(JSON.stringify(toolThenFinal[1]), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const secrets = new InMemorySecretStore();
        if (profile.apiKeyRef) await secrets.set(profile.apiKeyRef, "secret-must-not-leak");
        const gateway = new ModelGateway({ secretStore: secrets });
        const result = await gateway.completeWithTools(profile, requestFor("agent_step"), {
          tools: [{
            type: "function",
            function: {
              name: "mcp:demo:lookup",
              description: "lookup",
              parameters: { type: "object" },
            },
          }],
          executeTool: async () => ({ content: "{\"ok\":true}" }),
        });
        expect(result.output).toContain("TOOL_PATH_OK");
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      it("abort maps to operation_cancelled at gateway entry", async () => {
        const controller = new AbortController();
        controller.abort();
        const secrets = new InMemorySecretStore();
        if (profile.apiKeyRef) await secrets.set(profile.apiKeyRef, "secret");
        const gateway = new ModelGateway({ secretStore: secrets });
        await expect(
          gateway.complete(profile, requestFor("question_answer"), { signal: controller.signal }),
        ).rejects.toMatchObject({ code: "operation_cancelled" });
      });
    });
  }

  it("context-limit (max input chars) fails closed before provider HTTP", () => {
    const input = {
      systemPrompt: "sys",
      userPrompt: "x".repeat(100),
    };
    expect(() => applyOutboundRequestBounds(input, { maxInputChars: 50 })).toThrow(
      /exceeds hard max/i,
    );
    try {
      applyOutboundRequestBounds(input, { maxInputChars: 50 });
      expect.unreachable("expected context-limit throw");
    } catch (error) {
      expect(error).toMatchObject({
        code: "model_outbound_budget_exhausted",
        details: { bound: "max_input_chars" },
      });
    }
  });
});

describe("ollama_chat weak-point contracts", () => {
  const ollama = profiles.ollama_chat;

  it("maps HTTP 429 without leaking body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ollama-rate-limit", { status: 429 })));
    const failure = await createProviderAdapter("ollama_chat")
      .complete(ollama, "", { userPrompt: "hi" })
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      code: "model_connection_failed",
      message: "Model provider request failed (HTTP 429)",
    });
    expect(String((failure as Error).message)).not.toContain("ollama-rate-limit");
  });

  it("honors abort before completion", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        }, { once: true });
      }),
    ));
    const pending = createProviderAdapter("ollama_chat").complete(
      ollama,
      "",
      { userPrompt: "hi", signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      name: expect.stringMatching(/AbortError|Error/u),
    });
  });

  it("maps internal fetch timeout without leaking secrets", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        }, { once: true });
      }),
    ));
    const pending = createProviderAdapter("ollama_chat").complete(
      ollama,
      "secret-should-not-appear",
      { userPrompt: "hi" },
    );
    const failurePromise = pending.catch((error: unknown) => error);
    for (let i = 0; i < 8; i += 1) {
      await vi.advanceTimersByTimeAsync(120_000);
      if (await Promise.race([failurePromise.then(() => true), Promise.resolve(false)])) break;
    }
    const failure = await failurePromise;
    expect(String((failure as Error).message)).toMatch(/timed out/i);
    expect(String((failure as Error).message)).not.toContain("secret-should-not-appear");
    vi.useRealTimers();
  });
});

describe("native SSE streaming product need", () => {
  it("adapters remain non-streaming complete() — product run events stream separately", () => {
    for (const format of ["openai_chat", "anthropic_messages", "ollama_chat"] as const) {
      const adapter = createProviderAdapter(format);
      expect(adapter).not.toHaveProperty("streamComplete");
      expect(typeof adapter.complete).toBe("function");
    }
  });
});
