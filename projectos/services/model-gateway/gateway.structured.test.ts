import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelGatewayRequest } from "../../contracts/model-gateway.js";
import type { ModelProfile } from "../../contracts/settings.js";
import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { ModelGateway } from "./gateway.js";
import { buildOpenAiChatBody, isDeepSeekEndpoint, resolveProfileForGateway } from "./providers.js";

const profile: ModelProfile = {
  id: "model-test",
  name: "Test model",
  provider: "custom",
  apiFormat: "openai_chat",
  model: "deepseek-v4-flash",
  baseUrl: "https://api.deepseek.com",
  apiKeyRef: "model-key",
};

const submitTool = {
  type: "function" as const,
  function: {
    name: "submit_plan",
    description: "Submit the plan",
    parameters: { type: "object", properties: { objective: { type: "string" } }, required: ["objective"] },
  },
};

async function gatewayWith(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const secrets = new InMemorySecretStore();
  await secrets.set("model-key", "secret");
  return new ModelGateway({ secretStore: secrets });
}

const request = (extra: Partial<ModelGatewayRequest> = {}): ModelGatewayRequest => ({
  projectId: "project-test",
  requestKind: "agent_step",
  input: { task: "plan" },
  redactionPolicy: "none",
  ...extra,
});

describe("ModelGateway structured requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the tools and returns the chosen call's arguments as the answer", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{
        message: {
          content: "I will submit the plan now.",
          reasoning_content: "",
          // The real DeepSeek payload carries `index` on the call, and `content` next to it.
          tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: "submit_plan", arguments: "{\"objective\":\"ship it\"}" } }],
        },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 10, completion_tokens: 6 },
    }), { status: 200 }));
    const gateway = await gatewayWith(fetchMock);

    const response = await gateway.complete(profile, request({ structured: { tools: [submitTool] } }));

    const sent = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(sent.tools).toEqual([submitTool]);
    expect(sent.tool_choice).toBeUndefined(); // a forced choice is refused while the model is thinking
    expect(response.toolName).toBe("submit_plan");
    expect(JSON.parse(response.output)).toEqual({ objective: "ship it" });
  });

  it("returns plain text, with no tool name, when the model answers in words instead", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: "{\"objective\":\"in text\"}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 6 },
    }), { status: 200 }));
    const gateway = await gatewayWith(fetchMock);

    const response = await gateway.complete(profile, request({ structured: { tools: [submitTool] } }));

    expect(response.toolName).toBeUndefined();
    expect(response.output).toBe("{\"objective\":\"in text\"}");
  });

  it("does not send tools, or report a tool name, for an ordinary request", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: "hello" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), { status: 200 }));
    const gateway = await gatewayWith(fetchMock);

    const response = await gateway.complete(profile, request());

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)).tools).toBeUndefined();
    expect(response.toolName).toBeUndefined();
  });
});

describe("DeepSeek thinking switch", () => {
  const resolved = resolveProfileForGateway(profile);

  it("turns thinking off when a step asks for it, so the reply budget is not spent reasoning", () => {
    expect(buildOpenAiChatBody(resolved, { userPrompt: "x", thinkingDepth: "off" }).thinking).toEqual({ type: "disabled" });
  });

  it("leaves thinking alone for any other depth", () => {
    expect(buildOpenAiChatBody(resolved, { userPrompt: "x", thinkingDepth: "medium" }).thinking).toBeUndefined();
    expect(buildOpenAiChatBody(resolved, { userPrompt: "x" }).thinking).toBeUndefined();
  });

  it("does not send a DeepSeek-only parameter to other endpoints", () => {
    const other = resolveProfileForGateway({ ...profile, baseUrl: "https://api.openai.com/v1", model: "gpt-4o" });
    expect(buildOpenAiChatBody(other, { userPrompt: "x", thinkingDepth: "off" }).thinking).toBeUndefined();
    expect(isDeepSeekEndpoint("https://api.deepseek.com/v1")).toBe(true);
    expect(isDeepSeekEndpoint("https://example.com/deepseek.com")).toBe(false);
    expect(isDeepSeekEndpoint(undefined)).toBe(false);
  });
});
