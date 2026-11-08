/**
 * Local HTTP fixture (NOT real DeepSeek) for the Plan truncation / near-cap class.
 * Live gateway completes rows showed status=ok + outputTokens=4096; they do not
 * include finishReason. Fixture may set finish_reason only to exercise protocol.
 * Uses production PlanService + ModelGateway against a loopback OpenAI-chat server.
 * No real provider keys; no ledger writes.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";

import truncatedPlanFixture from "./fixtures/implementation-plan-truncated-4096.json" with { type: "json" };
import type { AgentContextBundle } from "../contracts/local-context.js";
import type { ModelProfile } from "../contracts/settings.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import { ModelGateway } from "./model-gateway/gateway.js";
import { PlanService, parsePlanJson } from "./plan-service.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function withFixtureServer(
  handler: (req: IncomingMessage, res: ServerResponse, body: unknown) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<{ seenMaxTokens: number[] }> {
  const seenMaxTokens: number[] = [];
  const server = createServer(async (req, res) => {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      if (typeof body.max_tokens === "number") {
        seenMaxTokens.push(body.max_tokens);
      }
      handler(req, res, body);
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("fixture server failed to bind");
  }
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
  return { seenMaxTokens };
}

describe("PlanService HTTP fixture (live truncation class)", () => {
  const localContext = {
    version: "0.1.0",
    kind: "global",
    projectId: "proj_fixture",
    topLevelNodes: [],
    bundleHash: "sha256:fixture",
  } as unknown as AgentContextBundle;

  it("old single-shot parse of the truncated HTTP body fails closed", () => {
    expect(() => parsePlanJson(truncatedPlanFixture.truncatedOutput)).toThrow(
      /malformed implementation plan JSON/i,
    );
  });

  it("production PlanService retries past 4096 and returns ready over loopback HTTP", async () => {
    const secrets = new InMemorySecretStore();
    await secrets.set("fixture-key", "sk-fixture-not-real");

    const { seenMaxTokens } = await withFixtureServer((req, res, body) => {
      expect(req.method).toBe("POST");
      expect(req.url).toContain("/chat/completions");
      const maxTokens = typeof body === "object" && body && "max_tokens" in body
        ? Number((body as { max_tokens?: number }).max_tokens)
        : 0;
      const truncated = maxTokens > 0 && maxTokens <= 4096;
      const content = truncated
        ? truncatedPlanFixture.truncatedOutput
        : JSON.stringify(truncatedPlanFixture.completeOutput);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        id: "chatcmpl_fixture_plan",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            finish_reason: truncated ? "length" : "stop",
            message: { role: "assistant", content },
          },
        ],
        usage: {
          prompt_tokens: truncatedPlanFixture.liveEvidence.observedInputTokensApprox,
          completion_tokens: truncated ? 4096 : 1800,
          total_tokens:
            truncatedPlanFixture.liveEvidence.observedInputTokensApprox
            + (truncated ? 4096 : 1800),
        },
      }));
    }, async (baseUrl) => {
      const profile = {
        id: "fixture_flash",
        name: "fixture",
        provider: "custom",
        apiFormat: "openai_chat",
        model: "fixture-model",
        baseUrl,
        apiKeyRef: "fixture-key",
      } as ModelProfile;
      const gateway = new ModelGateway({ secretStore: secrets, outboundRequestBounds: null });
      const service = new PlanService(gateway);
      const plan = await service.createPlan({
        projectId: "proj_fixture",
        scope: { kind: "global" },
        objective: "Add idempotent event dedupe for sync",
        localContext,
        profile,
        thinkingDepth: "off",
      });
      expect(plan.status).toBe("ready");
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    expect(seenMaxTokens).toEqual([4096, 8192]);
  });

  it("clarification follow-up requests 8192 first so the live 4096 saturation is skipped", async () => {
    const secrets = new InMemorySecretStore();
    await secrets.set("fixture-key", "sk-fixture-not-real");

    const { seenMaxTokens } = await withFixtureServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        id: "chatcmpl_fixture_clarify",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify(truncatedPlanFixture.completeOutput),
            },
          },
        ],
        usage: {
          prompt_tokens: 6630,
          completion_tokens: 5200,
          total_tokens: 11830,
        },
      }));
    }, async (baseUrl) => {
      const profile = {
        id: "fixture_flash",
        name: "fixture",
        provider: "custom",
        apiFormat: "openai_chat",
        model: "fixture-model",
        baseUrl,
        apiKeyRef: "fixture-key",
      } as ModelProfile;
      const gateway = new ModelGateway({ secretStore: secrets, outboundRequestBounds: null });
      const service = new PlanService(gateway);
      const plan = await service.createPlan({
        projectId: "proj_fixture",
        scope: { kind: "global" },
        objective: "Add idempotent event dedupe for sync",
        localContext,
        profile,
        thinkingDepth: "off",
        clarifyingAnswers: [
          { questionId: "q_1", answer: "Shared contract first", selectedOptionId: "q_1_opt_a" },
        ],
        existingQuestions: [{ id: "q_1", question: "Where first?" }],
        existingPlanId: "plan_live_shape",
      });
      expect(plan.status).toBe("ready");
      expect(plan.id).toBe("plan_live_shape");
    });

    expect(seenMaxTokens).toEqual([8192]);
  });

  it("HTTP stop + complete JSON at the cap is accepted with a single request", async () => {
    const secrets = new InMemorySecretStore();
    await secrets.set("fixture-key", "sk-fixture-not-real");
    let hits = 0;
    const { seenMaxTokens } = await withFixtureServer((_req, res) => {
      hits += 1;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        id: "chatcmpl_fixture_stop_cap",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify(truncatedPlanFixture.completeOutput),
            },
          },
        ],
        usage: {
          prompt_tokens: 3900,
          completion_tokens: 4096,
          total_tokens: 7996,
        },
      }));
    }, async (baseUrl) => {
      const profile = {
        id: "fixture_flash",
        name: "fixture",
        provider: "custom",
        apiFormat: "openai_chat",
        model: "fixture-model",
        baseUrl,
        apiKeyRef: "fixture-key",
      } as ModelProfile;
      const gateway = new ModelGateway({ secretStore: secrets, outboundRequestBounds: null });
      const plan = await new PlanService(gateway).createPlan({
        projectId: "proj_fixture",
        scope: { kind: "global" },
        objective: "Add idempotent event dedupe for sync",
        localContext,
        profile,
        thinkingDepth: "off",
      });
      expect(plan.status).toBe("ready");
    });
    expect(hits).toBe(1);
    expect(seenMaxTokens).toEqual([4096]);
  });
});
