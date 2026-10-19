import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelGatewayRequest } from "../../contracts/model-gateway.js";
import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { readCapabilityContext } from "../harness/tool-policy.js";
import { ModelGateway } from "./gateway.js";

describe("ModelGateway MCP tool loop", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("executes provider tool calls and returns the final model answer", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "call-1",
              type: "function",
              function: {
                name: "mcp:demo:lookup",
                arguments: JSON.stringify({ query: "Project OS" }),
              },
            }],
          },
          finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          message: { content: "The tool found the answer." },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 40, completion_tokens: 10 },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const secrets = new InMemorySecretStore();
    await secrets.set("model-key", "secret");
    const gateway = new ModelGateway({ secretStore: secrets });
    const request: ModelGatewayRequest = {
      projectId: "project-test",
      requestKind: "question_answer",
      input: { question: "Find the answer" },
      modelPreference: "model-test",
      redactionPolicy: "none",
    };
    const toolCalls: string[] = [];
    const result = await gateway.completeWithTools({
      id: "model-test",
      name: "Test model",
      provider: "custom",
      apiFormat: "openai_chat",
      model: "test-model",
      baseUrl: "http://127.0.0.1:4000/v1",
      apiKeyRef: "model-key",
    }, request, {
      tools: [{
        type: "function",
        function: {
          name: "mcp:demo:lookup",
          description: "Look something up",
          parameters: { type: "object" },
        },
      }],
      executeTool: async (call) => {
        toolCalls.push(`${call.name}:${call.arguments}`);
        return { content: JSON.stringify({ answer: "found" }) };
      },
    });

    expect(result.output).toBe("The tool found the answer.");
    expect(toolCalls).toEqual([
      'mcp:demo:lookup:{"query":"Project OS"}',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("blocks MCP tool calls denied by ToolPolicy before executeTool", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "call-1",
              type: "function",
              function: {
                name: "mcp:demo:lookup",
                arguments: JSON.stringify({ query: "x" }),
              },
            }],
          },
          finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          message: { content: "Blocked tool was skipped." },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 20, completion_tokens: 6 },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const secrets = new InMemorySecretStore();
    await secrets.set("model-key", "secret");
    const gateway = new ModelGateway({ secretStore: secrets });
    let executed = 0;
    const policyEvents: Array<{ decision: string; match: string }> = [];
    const result = await gateway.completeWithTools({
      id: "model-test",
      name: "Test model",
      provider: "custom",
      apiFormat: "openai_chat",
      model: "test-model",
      baseUrl: "http://127.0.0.1:4000/v1",
      apiKeyRef: "model-key",
    }, {
      projectId: "project-test",
      requestKind: "question_answer",
      input: { question: "Find" },
      modelPreference: "model-test",
      redactionPolicy: "none",
    }, {
      tools: [{
        type: "function",
        function: {
          name: "mcp:demo:lookup",
          description: "Look something up",
          parameters: { type: "object" },
        },
      }],
      toolPolicy: {
        context: readCapabilityContext({ mode: "ask", allowedReadPaths: [] }),
        rules: [],
      },
      onPolicyDecision: (event) => {
        policyEvents.push({
          decision: event.decision,
          match: event.match,
        });
      },
      executeTool: async () => {
        executed += 1;
        return { content: "should-not-run" };
      },
    });

    expect(executed).toBe(0);
    expect(result.output).toBe("Blocked tool was skipped.");
    expect(policyEvents).toEqual([
      { decision: "deny", match: "mcp:demo:lookup" },
    ]);
  });
});
