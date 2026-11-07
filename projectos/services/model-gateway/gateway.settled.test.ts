import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelGatewayRequest } from "../../contracts/model-gateway.js";
import { ProjectOSError } from "../../errors.js";
import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { ModelGateway, type ModelGatewaySettledEvent } from "./gateway.js";
import { createFileOutboundBudget } from "./outbound-budget.js";

const budgetDirs: string[] = [];

describe("ModelGateway onSettled", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const dir of budgetDirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
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

  it("does not reserve budget when already aborted before any provider outbound", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pos-gw-budget-"));
    budgetDirs.push(dir);
    const budget = createFileOutboundBudget(join(dir, "ledger.json"), 1);
    const secrets = new InMemorySecretStore();
    await secrets.set("model-key", "secret");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new ModelGateway({ secretStore: secrets, outboundBudget: budget });
    const controller = new AbortController();
    controller.abort();
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
    expect(fetchMock).not.toHaveBeenCalled();
    expect(budget.snapshot().reservations).toHaveLength(0);
  });

  it("reserves before fake-provider outbound and blocks the next call when exhausted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pos-gw-budget-"));
    budgetDirs.push(dir);
    const budget = createFileOutboundBudget(join(dir, "ledger.json"), 1);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
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
      outboundBudget: budget,
      onSettled: (event) => settled.push(event),
    });
    const profile = {
      id: "model-test",
      name: "Test",
      provider: "custom" as const,
      apiFormat: "openai_chat" as const,
      model: "test-model",
      baseUrl: "http://127.0.0.1:4000/v1",
      apiKeyRef: "model-key",
    };
    const request: ModelGatewayRequest = {
      projectId: "project-test",
      requestKind: "question_answer",
      input: { question: "ping" },
      modelPreference: "model-test",
      redactionPolicy: "none",
    };
    await gateway.complete(profile, request);
    expect(settled[0]?.status).toBe("ok");
    expect(budget.snapshot().reservations).toHaveLength(1);
    await expect(gateway.complete(profile, request)).rejects.toBeInstanceOf(ProjectOSError);
    await expect(gateway.complete(profile, request)).rejects.toMatchObject({
      code: "model_outbound_budget_exhausted",
    });
    // Exhaustion rejects before fetch — still only one reservation.
    expect(budget.snapshot().reservations).toHaveLength(1);
  });

  it("reserves one budget slot per HTTP attempt including transient retries (fake adapter)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pos-gw-budget-retry-"));
    budgetDirs.push(dir);
    const budget = createFileOutboundBudget(join(dir, "ledger.json"), 3);
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new TypeError("fetch failed"), {
            cause: { code: "ECONNRESET" },
          });
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200 },
        );
      }),
    );
    const secrets = new InMemorySecretStore();
    await secrets.set("model-key", "secret");
    const gateway = new ModelGateway({ secretStore: secrets, outboundBudget: budget });
    await gateway.complete(
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
    );
    expect(calls).toBe(2);
    // Failed attempt + successful attempt — no double-count at gateway layer.
    expect(budget.snapshot().reservations).toHaveLength(2);
    expect(budget.snapshot().reservations.map((row) => row.status)).toEqual([
      "failed",
      "ok",
    ]);
    // Usage annotates the successful reservation id (not the failed retry slot).
    expect(budget.snapshot().reservations[0]).toMatchObject({
      status: "failed",
      usageStatus: "missing",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(budget.snapshot().reservations[1]).toMatchObject({
      status: "ok",
      usageStatus: "reported",
      inputTokens: 1,
      outputTokens: 1,
    });
  });
});
