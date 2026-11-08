import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeModelProfile,
  normalizeModelProfiles,
} from "../../contracts/settings.js";
import {
  anthropicMessagesUrl,
  anthropicThinkingBudget,
  buildAnthropicMessagesBody,
  buildOpenAiChatBody,
  createProviderAdapter,
  extractOpenAiMessageParts,
  ollamaChatUrl,
  openAiChatCompletionsUrl,
  type ModelProviderAdapter,
} from "./providers.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("normalizeModelProfile", () => {
  it("fills OpenAI preset defaults", () => {
    const resolved = normalizeModelProfile({
      id: "m1",
      name: "OpenAI",
      provider: "openai",
      model: "gpt-4o-mini",
      apiKeyRef: "ref",
    });
    expect(resolved.apiFormat).toBe("openai_chat");
    expect(resolved.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("migrates openai_compatible to custom openai_chat", () => {
    const resolved = normalizeModelProfile({
      id: "m2",
      name: "DeepSeek",
      provider: "openai_compatible",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
      apiKeyRef: "ref",
    });
    expect(resolved.provider).toBe("custom");
    expect(resolved.apiFormat).toBe("openai_chat");
    expect(resolved.baseUrl).toBe("https://api.deepseek.com");
  });

  it("requires baseUrl for custom provider", () => {
    expect(() =>
      normalizeModelProfile({
        id: "m3",
        name: "Custom",
        provider: "custom",
        model: "foo",
        apiKeyRef: "ref",
      }),
    ).toThrow(/baseUrl/i);
  });

  it("normalizes custom profile with explicit apiFormat", () => {
    const resolved = normalizeModelProfile({
      id: "m4",
      name: "Remote Ollama",
      provider: "custom",
      apiFormat: "ollama_chat",
      displayName: "My Ollama",
      model: "llama3.2",
      baseUrl: "http://10.0.0.5:11434",
      apiKeyRef: "",
    });
    expect(resolved.apiFormat).toBe("ollama_chat");
    expect(resolved.baseUrl).toBe("http://10.0.0.5:11434");
  });
});

describe("normalizeModelProfiles", () => {
  it("normalizes all profiles in a list", () => {
    const profiles = normalizeModelProfiles([
      {
        id: "m1",
        name: "OpenAI",
        provider: "openai",
        model: "gpt-4o-mini",
        apiKeyRef: "ref",
      },
    ]);
    expect(profiles[0]?.apiFormat).toBe("openai_chat");
  });
});

describe("createProviderAdapter", () => {
  it("routes by apiFormat", () => {
    expect(createProviderAdapter("openai_chat").constructor.name).toBe(
      "OpenAiProviderAdapter",
    );
    expect(createProviderAdapter("anthropic_messages").constructor.name).toBe(
      "AnthropicProviderAdapter",
    );
    expect(createProviderAdapter("ollama_chat").constructor.name).toBe(
      "OllamaProviderAdapter",
    );
  });
});

describe("provider connection probes", () => {
  const profiles = [
    normalizeModelProfile({
      id: "openai",
      name: "OpenAI",
      provider: "openai",
      model: "gpt-4o-mini",
      apiKeyRef: "openai-key",
    }),
    normalizeModelProfile({
      id: "anthropic",
      name: "Anthropic",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKeyRef: "anthropic-key",
    }),
    normalizeModelProfile({
      id: "ollama",
      name: "Ollama",
      provider: "ollama",
      model: "llama3.2",
      apiKeyRef: "",
    }),
  ];

  it.each(profiles)("normalizes a successful $apiFormat probe", async (profile) => {
    const adapter = createProviderAdapter(profile.apiFormat);
    vi.spyOn(adapter, "complete").mockResolvedValue({
      output: "OK",
      inputTokens: 1,
      outputTokens: 1,
    });

    await expect(adapter.testConnection(profile, "secret")).resolves.toEqual({
      ok: true,
    });
    expect(adapter.complete).toHaveBeenCalledWith(profile, "secret", {
      userPrompt: "Reply with OK",
      maxOutputTokens: 8,
    });
  });

  it.each([
    [new Error("Provider unavailable"), "Provider unavailable"],
    ["non-error rejection", "Connection failed"],
  ])("normalizes probe failure %p", async (rejection, expectedMessage) => {
    const profile = profiles[0]!;
    const adapter: ModelProviderAdapter = createProviderAdapter(profile.apiFormat);
    vi.spyOn(adapter, "complete").mockRejectedValue(rejection);

    await expect(adapter.testConnection(profile, "secret")).resolves.toEqual({
      ok: false,
      message: expectedMessage,
    });
  });
});

describe("provider response boundary", () => {
  const openAiProfile = normalizeModelProfile({
    id: "safe-response-openai",
    name: "OpenAI",
    provider: "openai",
    model: "gpt-4o-mini",
    apiKeyRef: "openai-key",
  });

  it("turns a non-JSON success into a safe typed error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not-json", {
      status: 200,
    })));

    const failure = await createProviderAdapter("openai_chat").complete(
      openAiProfile,
      "secret",
      { userPrompt: "hello" },
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({
      code: "model_connection_failed",
      message: "Model provider returned invalid JSON",
    });
    expect(failure).not.toHaveProperty("cause");
    expect((failure as Error).message).not.toContain("not-json");
  });

  it("rejects an oversized chunked success body before parsing it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      new Uint8Array(8 * 1024 * 1024 + 1),
      { status: 200 },
    )));

    await expect(createProviderAdapter("openai_chat").complete(
      openAiProfile,
      "secret",
      { userPrompt: "hello" },
    )).rejects.toMatchObject({
      code: "model_connection_failed",
      message: expect.stringContaining("exceeded"),
    });
  });

  it("never exposes a provider error body in the surfaced error", async () => {
    const providerSecret = "raw-provider-body-must-not-reach-the-ui";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(providerSecret, {
      status: 500,
    })));

    const failure = await createProviderAdapter("openai_chat").complete(
      openAiProfile,
      "secret",
      { userPrompt: "hello" },
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({
      code: "model_connection_failed",
      message: "Model provider request failed (HTTP 500)",
    });
    expect((failure as Error).message).not.toContain(providerSecret);
  });

  it("times out the Ollama model-list request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          }, { once: true });
        }),
    ));
    const ollamaProfile = normalizeModelProfile({
      id: "timeout-ollama",
      name: "Ollama",
      provider: "ollama",
      model: "llama3.2",
      apiKeyRef: "",
    });

    const pending = createProviderAdapter("ollama_chat")
      .listModels!(ollamaProfile, undefined);
    const timedOut = expect(pending)
      .rejects.toThrow("Model request timed out after 120s");
    await vi.advanceTimersByTimeAsync(120_000);
    await timedOut;
  });
});

describe("baseUrl normalization", () => {
  it("builds OpenAI chat completions URL from host root", () => {
    expect(openAiChatCompletionsUrl("https://api.deepseek.com")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
    expect(openAiChatCompletionsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("builds Anthropic messages URL", () => {
    expect(anthropicMessagesUrl("https://api.anthropic.com/v1")).toBe(
      "https://api.anthropic.com/v1/messages",
    );
  });

  it("builds Ollama chat URL", () => {
    expect(ollamaChatUrl("http://127.0.0.1:11434")).toBe(
      "http://127.0.0.1:11434/api/chat",
    );
  });
});

describe("thinking depth body mapping", () => {
  const openAiProfile = normalizeModelProfile({
    id: "m1",
    name: "OpenAI",
    provider: "openai",
    model: "o3-mini",
    apiKeyRef: "ref",
  });

  const anthropicProfile = normalizeModelProfile({
    id: "m2",
    name: "Anthropic",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    apiKeyRef: "ref",
  });

  it("omits reasoning_effort when thinking depth is off", () => {
    const body = buildOpenAiChatBody(openAiProfile, {
      userPrompt: "hello",
      thinkingDepth: "off",
    });
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("maps thinking depth to OpenAI reasoning_effort", () => {
    const body = buildOpenAiChatBody(openAiProfile, {
      userPrompt: "hello",
      thinkingDepth: "high",
    });
    expect(body.reasoning_effort).toBe("high");
  });

  it("maps thinking depth to Anthropic thinking budget", () => {
    const body = buildAnthropicMessagesBody(anthropicProfile, {
      userPrompt: "hello",
      thinkingDepth: "low",
    });
    expect(body.thinking).toEqual({
      type: "enabled",
      budget_tokens: anthropicThinkingBudget("low"),
    });
  });

  it("omits reasoning_effort for non-reasoning OpenAI models", () => {
    const body = buildOpenAiChatBody(
      normalizeModelProfile({
        id: "m5",
        name: "GPT-4o",
        provider: "openai",
        model: "gpt-4o",
        apiKeyRef: "ref",
      }),
      {
        userPrompt: "hello",
        thinkingDepth: "high",
      },
    );
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("embeds images in OpenAI user content when provided", () => {
    const body = buildOpenAiChatBody(openAiProfile, {
      userPrompt: "describe this",
      images: [{ mimeType: "image/png", base64: "abc123" }],
    });
    const messages = body.messages as Array<{ role: string; content: unknown }>;
    const user = messages.find((message) => message.role === "user");
    expect(Array.isArray(user?.content)).toBe(true);
    const parts = user?.content as Array<Record<string, unknown>>;
    expect(parts.some((part) => part.type === "text")).toBe(true);
    expect(parts.some((part) => part.type === "image_url")).toBe(true);
  });

  it("embeds images in Anthropic user content when provided", () => {
    const body = buildAnthropicMessagesBody(anthropicProfile, {
      userPrompt: "describe this",
      images: [{ mimeType: "image/png", base64: "abc123" }],
    });
    const messages = body.messages as Array<{ role: string; content: unknown }>;
    const user = messages.find((message) => message.role === "user");
    expect(Array.isArray(user?.content)).toBe(true);
    const parts = user?.content as Array<Record<string, unknown>>;
    expect(parts.some((part) => part.type === "image")).toBe(true);
    expect(parts.some((part) => part.type === "text")).toBe(true);
  });

  it("keeps OpenAI user content as a string without images", () => {
    const body = buildOpenAiChatBody(openAiProfile, {
      userPrompt: "hello only",
    });
    const messages = body.messages as Array<{ role: string; content: unknown }>;
    const user = messages.find((message) => message.role === "user");
    expect(user?.content).toBe("hello only");
  });

  it("extracts answer and provider reasoning as distinct fields", () => {
    expect(
      extractOpenAiMessageParts({
        content: "Final answer",
        reasoning_content: "Deep reasoning trace",
      }),
    ).toEqual({
      output: "Final answer",
      reasoning: "Deep reasoning trace",
    });
  });

  it("reads the `reasoning` field when the provider omits `reasoning_content` (K2Think/OpenRouter)", () => {
    expect(
      extractOpenAiMessageParts({
        content: "Final answer",
        reasoning: "Deep reasoning trace",
      }),
    ).toEqual({
      output: "Final answer",
      reasoning: "Deep reasoning trace",
    });
  });

  it("prefers `reasoning_content` over `reasoning` when both are present", () => {
    expect(
      extractOpenAiMessageParts({
        content: "Final answer",
        reasoning_content: "Authoritative trace",
        reasoning: "Secondary trace",
      }),
    ).toEqual({
      output: "Final answer",
      reasoning: "Authoritative trace",
    });
  });

  it("never promotes reasoning_content to the final answer", () => {
    expect(
      extractOpenAiMessageParts({
        content: "",
        reasoning_content: "Deep reasoning trace",
      }),
    ).toEqual({
      output: "",
      reasoning: "Deep reasoning trace",
    });
  });

  it("does not fabricate reasoning when the provider omits it", () => {
    expect(extractOpenAiMessageParts({ content: "Ordinary answer" })).toEqual({
      output: "Ordinary answer",
    });
  });

  it("uses a complete leading think block as fallback reasoning", () => {
    expect(extractOpenAiMessageParts({
      content: "<think>Provider trace</think>\nFinal answer",
    })).toEqual({
      output: "Final answer",
      reasoning: "Provider trace",
    });
  });

  it("keeps reasoning_content authoritative while removing a leading think block", () => {
    expect(extractOpenAiMessageParts({
      content: "<think>Embedded trace</think>\nFinal answer",
      reasoning_content: "Authoritative trace",
    })).toEqual({
      output: "Final answer",
      reasoning: "Authoritative trace",
    });
  });

  it("returns an empty answer for a response containing only a think block", () => {
    expect(extractOpenAiMessageParts({
      content: "<think>Provider trace only</think>",
    })).toEqual({
      output: "",
      reasoning: "Provider trace only",
    });
  });

  it.each([
    ["ordinary prose", "Use <think> literally in this sentence."],
    ["code", "```html\n<think>literal element</think>\n```"],
    ["unclosed leading block", "<think>unfinished trace\nFinal answer"],
  ])("preserves %s containing non-leading or incomplete think markup", (_label, content) => {
    expect(extractOpenAiMessageParts({ content })).toEqual({ output: content });
  });

  it("captures the OpenAI-compatible finish reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: { content: "partial" },
        finish_reason: "length",
      }],
      usage: { prompt_tokens: 2, completion_tokens: 4 },
    }), { status: 200 })));
    const adapter = createProviderAdapter("openai_chat");

    await expect(adapter.complete(openAiProfile, "secret", {
      userPrompt: "generate",
    })).resolves.toMatchObject({
      output: "partial",
      finishReason: "length",
      inputTokens: 2,
      outputTokens: 4,
      usageReported: true,
    });
  });

  it("records omitted provider usage as zero instead of an estimate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "partial" }, finish_reason: "stop" }],
    }), { status: 200 })));
    const adapter = createProviderAdapter("openai_chat");

    await expect(adapter.complete(openAiProfile, "secret", {
      userPrompt: "generate a long prompt that must not be turned into a token estimate",
    })).resolves.toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      usageReported: false,
    });
  });
});

describe("provider HTTP contract matrix (openai_chat + anthropic_messages)", () => {
  const openAi = normalizeModelProfile({
    id: "contract-openai",
    name: "OpenAI",
    provider: "openai",
    model: "gpt-4o-mini",
    apiKeyRef: "openai-key",
  });
  const anthropic = normalizeModelProfile({
    id: "contract-anthropic",
    name: "Anthropic",
    provider: "anthropic",
    model: "claude-3-5-haiku-latest",
    apiKeyRef: "anthropic-key",
  });
  const customDeepSeekShape = normalizeModelProfile({
    id: "contract-custom-ds",
    name: "DeepSeek-compatible",
    provider: "custom",
    apiFormat: "openai_chat",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    apiKeyRef: "ds-key",
  });

  const formats: Array<{
    label: string;
    format: "openai_chat" | "anthropic_messages";
    profile: ReturnType<typeof normalizeModelProfile>;
    okBody: unknown;
  }> = [
    {
      label: "openai_chat",
      format: "openai_chat",
      profile: openAi,
      okBody: {
        choices: [{
          message: {
            role: "assistant",
            content: "OK",
            tool_calls: [{
              id: "call_1",
              type: "function",
              function: { name: "ping", arguments: "{\"x\":1}" },
            }],
          },
          finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens: 11, completion_tokens: 3 },
      },
    },
    {
      label: "anthropic_messages",
      format: "anthropic_messages",
      profile: anthropic,
      okBody: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        content: [
          { type: "text", text: "OK" },
          {
            type: "tool_use",
            id: "toolu_1",
            name: "ping",
            input: { x: 1 },
          },
        ],
        model: "claude-3-5-haiku-latest",
        stop_reason: "tool_use",
        usage: { input_tokens: 9, output_tokens: 2 },
      },
    },
    {
      label: "custom openai_chat (DeepSeek-shaped)",
      format: "openai_chat",
      profile: customDeepSeekShape,
      okBody: {
        choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
      },
    },
  ];

  const ollama = normalizeModelProfile({
    id: "contract-ollama",
    name: "Ollama",
    provider: "ollama",
    model: "llama3.2",
    apiKeyRef: "",
  });

  for (const entry of formats) {
    describe(entry.label, () => {
      it("maps HTTP 401 to model_connection_failed without leaking body", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("api-key-leak-secret", { status: 401 })));
        const failure = await createProviderAdapter(entry.format)
          .complete(entry.profile, "secret", { userPrompt: "hi" })
          .catch((error: unknown) => error);
        expect(failure).toMatchObject({
          code: "model_connection_failed",
          message: "Model provider request failed (HTTP 401)",
        });
        expect((failure as Error).message).not.toContain("api-key-leak-secret");
      });

      it("maps HTTP 429 rate limit without leaking body", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("rate-limit-body", { status: 429 })));
        const failure = await createProviderAdapter(entry.format)
          .complete(entry.profile, "secret", { userPrompt: "hi" })
          .catch((error: unknown) => error);
        expect(failure).toMatchObject({
          code: "model_connection_failed",
          message: "Model provider request failed (HTTP 429)",
        });
        expect((failure as Error).message).not.toContain("rate-limit-body");
      });

      it("rejects malformed JSON success", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("{not-json", { status: 200 })));
        await expect(createProviderAdapter(entry.format).complete(
          entry.profile,
          "secret",
          { userPrompt: "hi" },
        )).rejects.toMatchObject({
          code: "model_connection_failed",
          message: "Model provider returned invalid JSON",
        });
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
        const pending = createProviderAdapter(entry.format).complete(
          entry.profile,
          "secret",
          { userPrompt: "hi", signal: controller.signal },
        );
        controller.abort();
        await expect(pending).rejects.toMatchObject({
          name: expect.stringMatching(/AbortError|Error/u),
        });
      });

      it("parses a successful official-shaped response with usage semantics", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(
          JSON.stringify(entry.okBody),
          { status: 200, headers: { "content-type": "application/json" } },
        )));
        const result = await createProviderAdapter(entry.format).complete(
          entry.profile,
          "secret",
          { userPrompt: "hi" },
        );
        expect(result.output).toContain("OK");
        expect(result.usageReported).toBe(true);
        expect(result.inputTokens).toBeGreaterThan(0);
        expect(result.outputTokens).toBeGreaterThan(0);
        if (entry.label === "openai_chat" || entry.label === "anthropic_messages") {
          expect(result.toolCalls?.length).toBe(1);
          expect(result.toolCalls?.[0]?.name).toBe("ping");
        }
      });

    });
  }

  it("maps internal fetch timeout to a timed-out Error without leaking the API key", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        }, { once: true });
      }),
    ));
    const pending = createProviderAdapter("openai_chat").complete(
      openAi,
      "secret-token-should-not-leak",
      { userPrompt: "hi" },
    );
    // Transient retries mean several timeout windows; advance until settled.
    const failurePromise = pending.catch((error: unknown) => error);
    for (let i = 0; i < 8; i += 1) {
      await vi.advanceTimersByTimeAsync(120_000);
      if (await Promise.race([
        failurePromise.then(() => true),
        Promise.resolve(false),
      ])) break;
    }
    const failure = await failurePromise;
    expect(failure).toBeInstanceOf(Error);
    expect(String((failure as Error).message)).toMatch(/timed out/i);
    expect(String((failure as Error).message)).not.toContain("secret-token-should-not-leak");
    vi.useRealTimers();
  });

  describe("ollama_chat contract", () => {
    it("maps HTTP 401 without leaking body", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("ollama-auth-body", { status: 401 })));
      const failure = await createProviderAdapter("ollama_chat")
        .complete(ollama, "", { userPrompt: "hi" })
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({
        code: "model_connection_failed",
        message: "Model provider request failed (HTTP 401)",
      });
      expect((failure as Error).message).not.toContain("ollama-auth-body");
    });

    it("rejects malformed JSON success", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{broken", { status: 200 })));
      await expect(createProviderAdapter("ollama_chat").complete(
        ollama,
        "",
        { userPrompt: "hi" },
      )).rejects.toMatchObject({
        code: "model_connection_failed",
        message: "Model provider returned invalid JSON",
      });
    });

    it("parses official-shaped chat response", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(
        JSON.stringify({
          message: { role: "assistant", content: "OK" },
          done: true,
          prompt_eval_count: 4,
          eval_count: 2,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )));
      const result = await createProviderAdapter("ollama_chat").complete(
        ollama,
        "",
        { userPrompt: "hi" },
      );
      expect(result.output).toContain("OK");
    });
  });

  it("documents supported apiFormat surface (not every vendor brand)", () => {
    expect(createProviderAdapter("openai_chat").constructor.name).toMatch(/OpenAi/);
    expect(createProviderAdapter("anthropic_messages").constructor.name).toMatch(/Anthropic/);
    expect(createProviderAdapter("ollama_chat").constructor.name).toMatch(/Ollama/);
    // Unknown brands use custom + openai_chat (OpenAI-compatible subset), not a native adapter.
    expect(customDeepSeekShape.apiFormat).toBe("openai_chat");
    expect(customDeepSeekShape.provider).toBe("custom");
  });
});
