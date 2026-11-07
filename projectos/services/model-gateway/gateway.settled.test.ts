import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelGatewayRequest } from "../../contracts/model-gateway.js";
import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { ModelGateway, type ModelGatewaySettledEvent } from "./gateway.js";

describe("ModelGateway onSettled", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports ok with usage for a successful complete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "pong" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 3, completion_tokens: 1 },
          }),
          { status: 200 },
        ),
      ),
    );
    const secrets = new InMemorySecretStore();
    await secrets.set("model-key", "secret");
    const settled: ModelGatewaySettledEvent[] = [];
    const gateway = new ModelGateway({
      secretStore: secrets,
      onSettled: (event) => settled.push(event),
    });
    const request: ModelGatewayRequest = {
      projectId: "project-test",
      requestKind: "question_answer",
      input: { question: "ping" },
      modelPreference: "model-test",
      redactionPolicy: "none",
    };
    const result = await gateway.complete(
      {
        id: "model-test",
        name: "Test",
        provider: "custom",
        apiFormat: "openai_chat",
        model: "test-model",
        baseUrl: "http://127.0.0.1:4000/v1",
        apiKeyRef: "model-key",
      },
      request,
    );
    expect(result.output).toBe("pong");
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({
      requestId: result.requestId,
      status: "ok",
      usageStatus: "reported",
      inputTokens: 3,
      outputTokens: 1,
      model: "test-model",
    });
  });

  it("reports cancelled when the caller aborts before the provider returns", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new Error("aborted"));
      }),
    );
    const secrets = new InMemorySecretStore();
    await secrets.set("model-key", "secret");
    const settled: ModelGatewaySettledEvent[] = [];
    const gateway = new ModelGateway({
      secretStore: secrets,
      onSettled: (event) => settled.push(event),
    });
    await expect(
      gateway.complete(
        {
          id: "model-test",
          name: "Test",
          provider: "custom",
          apiFormat: "openai_chat",
          model: "test-model",
          baseUrl: "http://127.0.0.1:4000/v1",
          apiKeyRef: "model-key",
        },
        {
          projectId: "project-test",
          requestKind: "question_answer",
          input: { question: "ping" },
          modelPreference: "model-test",
          redactionPolicy: "none",
        },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: "operation_cancelled" });
    expect(settled).toHaveLength(1);
    expect(settled[0]?.status).toBe("cancelled");
    expect(settled[0]?.usageStatus).toBe("missing");
  });
});
