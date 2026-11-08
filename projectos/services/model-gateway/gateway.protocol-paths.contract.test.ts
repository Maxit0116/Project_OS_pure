import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { RequestIntentDraftSchema } from "../../contracts/request-intent.js";
import {
  ModelRequestKindSchema,
  type ModelGatewayRequest,
  type ModelRequestKind,
} from "../../contracts/model-gateway.js";
import { normalizeModelProfile } from "../../contracts/settings.js";
import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { ModelGateway } from "./gateway.js";
import { createProviderAdapter } from "./providers.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Must stay equal to schema — if a kind is added and not listed here, this suite fails. */
const EVERY_REQUEST_KIND = [
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
] as const satisfies readonly ModelRequestKind[];

const ClarifyOutputSchema = z.object({
  action: z.literal("clarify"),
  question: z.string().trim().min(1).max(500),
  options: z.array(z.object({
    id: z.string().min(1),
    label: z.string().trim().min(1),
  }).strict()).min(2).max(5),
}).strict();

const SearchReplaceOutputSchema = z.object({
  summary: z.string().trim().min(1),
  path: z.string().min(1),
  edits: z.array(z.object({
    search: z.string().min(1),
    replace: z.string(),
  })).min(1),
});

const IntentFinalActionSchema = z.object({
  action: z.literal("final"),
  intent: RequestIntentDraftSchema,
}).strict();

const PlanModelOutputSchema = z.object({
  objective: z.string().trim().min(1),
  steps: z.array(z.object({
    id: z.string().min(1),
    description: z.string().trim().min(1),
    affectedFiles: z.array(z.string()).default([]),
    acceptanceCriteria: z.array(z.string()).default([]),
  })).min(1),
  rationale: z.string().trim().min(1),
}).strict();

function wrapOpenAi(content: string) {
  return {
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 11, completion_tokens: 5 },
  };
}

function wrapAnthropic(content: string) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: content }],
    model: "claude-3-5-haiku-latest",
    stop_reason: "end_turn",
    usage: { input_tokens: 9, output_tokens: 4 },
  };
}

function wrapOllama(content: string) {
  return {
    message: { role: "assistant", content },
    done: true,
    prompt_eval_count: 8,
    eval_count: 3,
  };
}

const structuredByKind: Partial<Record<ModelRequestKind, string>> = {
  request_intent: JSON.stringify({
    action: "final",
    intent: {
      goal: "Change the login heading",
      kind: "change",
      touches: [{
        nodeId: "feat_login",
        reason: "Owns the login page",
        files: ["app/login/page.tsx"],
        allow: { editExisting: true, addParts: false, deletePartIds: [] },
      }],
      structuralProposals: [],
      assumptions: ["Copy language matches the product locale"],
      outOfScope: ["Auth backend"],
      acceptance: ["Heading text updates"],
      questions: [],
    },
  }),
  implementation_plan: JSON.stringify({
    objective: "Update login heading",
    steps: [{
      id: "s1",
      description: "Edit app/login/page.tsx heading",
      affectedFiles: ["app/login/page.tsx"],
      acceptanceCriteria: ["Heading updated"],
    }],
    rationale: "Selected feature owns the page",
  }),
  change_generation: JSON.stringify({
    summary: "Update heading",
    path: "app/login/page.tsx",
    edits: [{ search: "Sign in", replace: "Welcome back" }],
  }),
  agent_step: JSON.stringify({
    action: "clarify",
    question: "Which heading copy?",
    options: [
      { id: "a", label: "Welcome back" },
      { id: "b", label: "Sign in" },
    ],
  }),
  prompt_refinement: JSON.stringify({
    understood: "Change the login heading copy",
    ambiguities: [],
    suggestions: ["Keep auth flow untouched"],
    affectedNodeIds: ["feat_login"],
    affectedFiles: ["app/login/page.tsx"],
    confidence: "high",
  }),
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
    id: "path-custom",
    name: "Custom OpenAI-compatible",
    provider: "custom",
    apiFormat: "openai_chat",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    apiKeyRef: "path-key",
  }),
} as const;

describe("ModelGateway protocol-path contracts (production entry)", () => {
  it("every-kind inventory equals ModelRequestKindSchema exactly (fails if a kind is dropped)", () => {
    expect([...EVERY_REQUEST_KIND].sort()).toEqual([...ModelRequestKindSchema.options].sort());
    expect(EVERY_REQUEST_KIND).toHaveLength(12);
    expect(new Set(EVERY_REQUEST_KIND).size).toBe(EVERY_REQUEST_KIND.length);
  });

  for (const [label, profile] of Object.entries(profiles)) {
    const apiFormat =
      label === "custom_openai" ? "openai_chat" : (label as "openai_chat" | "anthropic_messages" | "ollama_chat");

    describe(`apiFormat=${label}`, () => {
      for (const kind of EVERY_REQUEST_KIND) {
        it(`complete(${kind}) round-trips through ModelGateway`, async () => {
          const payload = structuredByKind[kind] ?? `PATH_OK:${kind}`;
          const body =
            apiFormat === "anthropic_messages"
              ? wrapAnthropic(payload)
              : apiFormat === "ollama_chat"
                ? wrapOllama(payload)
                : wrapOpenAi(payload);
          vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
              new Response(JSON.stringify(body), {
                status: 200,
                headers: { "content-type": "application/json" },
              }),
            ),
          );
          const secrets = new InMemorySecretStore();
          if (profile.apiKeyRef) await secrets.set(profile.apiKeyRef, "secret-must-not-leak");
          const gateway = new ModelGateway({ secretStore: secrets });
          const request: ModelGatewayRequest = {
            projectId: "project-protocol-paths",
            requestKind: kind,
            input: { marker: kind },
            modelPreference: profile.id,
            redactionPolicy: "none",
          };
          const result = await gateway.complete(profile, request);
          expect(result.output.length).toBeGreaterThan(0);
          expect(JSON.stringify(result)).not.toContain("secret-must-not-leak");
          if (apiFormat !== "ollama_chat" || body) {
            // Ollama now reports usage when prompt_eval_count/eval_count present.
            expect(result.usage.inputTokens + result.usage.outputTokens).toBeGreaterThan(0);
          }
        });
      }

      it("validates structured outputs for intent / plan / generate / clarify", async () => {
        const cases: Array<{ kind: ModelRequestKind; parse: (out: string) => unknown }> = [
          {
            kind: "request_intent",
            parse: (out) => IntentFinalActionSchema.parse(JSON.parse(out)),
          },
          {
            kind: "implementation_plan",
            parse: (out) => PlanModelOutputSchema.parse(JSON.parse(out)),
          },
          {
            kind: "change_generation",
            parse: (out) => SearchReplaceOutputSchema.parse(JSON.parse(out)),
          },
          {
            kind: "agent_step",
            parse: (out) => ClarifyOutputSchema.parse(JSON.parse(out)),
          },
        ];
        for (const entry of cases) {
          const payload = structuredByKind[entry.kind]!;
          const body =
            apiFormat === "anthropic_messages"
              ? wrapAnthropic(payload)
              : apiFormat === "ollama_chat"
                ? wrapOllama(payload)
                : wrapOpenAi(payload);
          vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
              new Response(JSON.stringify(body), {
                status: 200,
                headers: { "content-type": "application/json" },
              }),
            ),
          );
          const secrets = new InMemorySecretStore();
          if (profile.apiKeyRef) await secrets.set(profile.apiKeyRef, "secret");
          const gateway = new ModelGateway({ secretStore: secrets });
          const result = await gateway.complete(profile, {
            projectId: "project-protocol-paths",
            requestKind: entry.kind,
            input: { marker: entry.kind },
            redactionPolicy: "none",
          });
          expect(() => entry.parse(result.output)).not.toThrow();
        }
      });

      it("completeWithTools Agent loop (including ollama_chat) executes tool then final", async () => {
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
            : apiFormat === "ollama_chat"
              ? [
                  {
                    message: {
                      role: "assistant",
                      content: "",
                      tool_calls: [{
                        function: { name: "mcp:demo:lookup", arguments: { q: "x" } },
                      }],
                    },
                    done: true,
                    prompt_eval_count: 4,
                    eval_count: 2,
                  },
                  {
                    message: { role: "assistant", content: "TOOL_PATH_OK" },
                    done: true,
                    prompt_eval_count: 6,
                    eval_count: 3,
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
        if (profile.apiKeyRef) await secrets.set(profile.apiKeyRef, "secret");
        const gateway = new ModelGateway({ secretStore: secrets });
        const result = await gateway.completeWithTools(profile, {
          projectId: "project-protocol-paths",
          requestKind: "agent_step",
          input: { marker: "tools" },
          redactionPolicy: "none",
        }, {
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

      it("abort before outbound maps to operation_cancelled", async () => {
        const controller = new AbortController();
        controller.abort();
        const secrets = new InMemorySecretStore();
        if (profile.apiKeyRef) await secrets.set(profile.apiKeyRef, "secret");
        const gateway = new ModelGateway({ secretStore: secrets });
        await expect(
          gateway.complete(profile, {
            projectId: "p",
            requestKind: "question_answer",
            input: { q: "x" },
            redactionPolicy: "none",
          }, { signal: controller.signal }),
        ).rejects.toMatchObject({ code: "operation_cancelled" });
      });
    });
  }

  it("context-limit is enforced through ModelGateway before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const secrets = new InMemorySecretStore();
    await secrets.set("path-key", "secret");
    const gateway = new ModelGateway({
      secretStore: secrets,
      outboundRequestBounds: { maxInputChars: 40 },
    });
    await expect(
      gateway.complete(profiles.openai_chat, {
        projectId: "p",
        requestKind: "question_answer",
        input: { blob: "x".repeat(200) },
        systemPrompt: "sys",
        redactionPolicy: "none",
      }),
    ).rejects.toMatchObject({
      code: "model_outbound_budget_exhausted",
      details: { bound: "max_input_chars" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
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
