import { describe, expect, it, vi } from "vitest";

import {
  ImplementationPlanSchema,
  CreatePlanRequestSchema,
} from "../contracts/implementation-plan.js";
import { DebugSessionSchema } from "../contracts/debug-session.js";
import { ChatSessionModeSchema } from "../contracts/chat-session.js";
import {
  PlanService,
  buildPromptFromPlan,
  mergeClarifyingQuestions,
  normalizeClarifyingQuestions,
  parsePlanJson,
  sanitizePlanPayload,
} from "./plan-service.js";
import { buildInstrumentationSnippet } from "./debug-instrumentation-service.js";
import { chooseRootCause, createInitialDebugSession, findHarnessRecordForSession, prepareManualDebugSession, resolveDebugFixFilePath } from "./debug-session-service.js";
import graphFixture from "../client/sample-projectos-fixtures/graph.json" with { type: "json" };
import authHarnessFixture from "../client/sample-projectos-fixtures/harness/err_auth_provider_callback.json" with { type: "json" };
import truncatedPlanFixture from "./fixtures/implementation-plan-truncated-4096.json" with { type: "json" };
import { HarnessRecordSchema } from "../contracts/harness.js";
import { ProjectGraphSchema } from "../contracts/graph.js";
import type { ModelGateway } from "./model-gateway/index.js";
import type { AgentContextBundle } from "../contracts/local-context.js";
import type { ModelProfile } from "../contracts/settings.js";
import { ProjectOSError } from "../errors.js";
import { isTruncatedModelOutput } from "./model-json-output.js";

describe("implementation plan contracts", () => {
  it("accepts plan and debug chat modes", () => {
    expect(ChatSessionModeSchema.parse("plan")).toBe("plan");
    expect(ChatSessionModeSchema.parse("debug")).toBe("debug");
  });

  it("parses a minimal implementation plan", () => {
    const plan = ImplementationPlanSchema.parse({
      version: "0.1.0",
      id: "plan_1",
      projectId: "proj_1",
      scope: { kind: "file", nodeId: "node_1", selectedFilePath: "lib/auth.ts" },
      objective: "Normalize callback handling",
      steps: [
        {
          id: "step_1",
          description: "Update provider callback normalization",
          affectedFiles: ["lib/auth.ts"],
          acceptanceCriteria: ["Callback URL is normalized"],
        },
      ],
      todos: [{ id: "todo_1", content: "Update auth helper", status: "pending" }],
      ambiguities: [],
      rationale: "Keeps callback handling consistent.",
      status: "ready",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(plan.status).toBe("ready");
    expect(CreatePlanRequestSchema.parse({
      projectId: "proj_1",
      scope: plan.scope,
      objective: plan.objective,
    }).objective).toBe(plan.objective);
  });
});

describe("plan-service helpers", () => {
  it("marks plan ready when ambiguities remain but all questions are answered", () => {
    const merged = mergeClarifyingQuestions(
      [],
      [{ questionId: "q_1", answer: "Use existing auth flow" }],
      [{ id: "q_1", question: "Which auth flow?" }],
    );
    const unanswered = merged.filter((question) => !question.answer?.trim());
    expect(unanswered).toHaveLength(0);
    expect(unanswered.length > 0 ? "needs_clarification" : "ready").toBe("ready");
  });

  it("normalizes questions without options into selectable defaults", () => {
    const normalized = normalizeClarifyingQuestions([
      {
        id: "q_1",
        question: "Which auth flow?",
      },
    ]);
    expect(normalized[0]?.options?.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves provided options when merging answers", () => {
    const merged = mergeClarifyingQuestions(
      [],
      [{ questionId: "q_1", answer: "Clear on open", selectedOptionId: "opt_a" }],
      [
        {
          id: "q_1",
          question: "Badge behavior?",
          options: [
            { id: "opt_a", label: "Clear on open" },
            { id: "opt_b", label: "Persist" },
          ],
        },
      ],
    );
    expect(merged[0]?.selectedOptionId).toBe("opt_a");
    expect(merged[0]?.options).toHaveLength(2);
  });

  it("sanitizes malformed option payloads before validation", () => {
    const sanitized = sanitizePlanPayload({
      objective: "Fix badge",
      steps: [],
      todos: [],
      ambiguities: ["behavior"],
      clarifyingQuestions: [
        {
          question: "How should badge clear?",
          options: [
            { label: "On open" },
            { id: "opt_b", label: "On dismiss", description: "Manual only" },
          ],
        },
      ],
      rationale: "Because",
    }) as { clarifyingQuestions?: Array<{ options?: unknown[] }> };
    expect(sanitized.clarifyingQuestions?.[0]?.options).toHaveLength(2);
  });

  it("builds a change prompt from a plan", () => {
    const prompt = buildPromptFromPlan(
      ImplementationPlanSchema.parse({
        version: "0.1.0",
        id: "plan_1",
        projectId: "proj_1",
        scope: { kind: "file", nodeId: "node_1", selectedFilePath: "lib/auth.ts" },
        objective: "Fix callback",
        steps: [
          {
            id: "step_1",
            description: "Normalize callback",
            affectedFiles: ["lib/auth.ts"],
            acceptanceCriteria: ["Works"],
          },
        ],
        todos: [],
        ambiguities: [],
        rationale: "Because",
        status: "ready",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(prompt).toContain("Objective: Fix callback");
    expect(prompt).toContain("Normalize callback");
  });
});

describe("implementation plan truncation regression (live acceptance shape)", () => {
  const profile = {
    id: "model_flash",
    name: "flash",
    provider: "custom",
    apiFormat: "openai_chat",
    model: "deepseek-v4-flash",
    baseUrl: "http://127.0.0.1:9",
    apiKeyRef: "ref",
  } as ModelProfile;

  const localContext = {
    version: "0.1.0",
    kind: "global",
    projectId: "proj_1",
    topLevelNodes: [],
    bundleHash: "sha256:test",
  } as unknown as AgentContextBundle;

  it("old single-shot 4096 path: truncated fixture is detected and fails parse", () => {
    const truncated = truncatedPlanFixture.truncatedOutput;
    expect(
      isTruncatedModelOutput(
        {
          finishReason: truncatedPlanFixture.liveEvidence.finishReason,
          usage: {
            outputTokens: truncatedPlanFixture.liveEvidence.observedOutputTokens,
          },
        },
        truncatedPlanFixture.liveEvidence.maxOutputTokens,
      ),
    ).toBe(true);
    expect(() => parsePlanJson(truncated)).toThrow(/malformed implementation plan JSON/i);
  });

  it("new path: saturating 4096 retries at 8192 and returns a ready plan", async () => {
    const caps: number[] = [];
    const complete = vi.fn(async (_profile: unknown, request: { maxOutputTokens?: number }) => {
      const max = request.maxOutputTokens ?? 0;
      caps.push(max);
      if (max <= 4096) {
        return {
          requestId: "plan_trunc",
          provider: "DeepSeek",
          model: "deepseek-v4-flash",
          latencyMs: 1,
          finishReason: "length",
          usage: { inputTokens: 3986, outputTokens: 4096 },
          output: truncatedPlanFixture.truncatedOutput,
        };
      }
      return {
        requestId: "plan_ok",
        provider: "DeepSeek",
        model: "deepseek-v4-flash",
        latencyMs: 1,
        finishReason: "stop",
        usage: { inputTokens: 3986, outputTokens: 1800 },
        output: JSON.stringify(truncatedPlanFixture.completeOutput),
      };
    });
    const service = new PlanService({ complete } as unknown as ModelGateway);
    const plan = await service.createPlan({
      projectId: "proj_1",
      scope: { kind: "global" },
      objective: "Add idempotent event dedupe for sync",
      localContext,
      profile,
      thinkingDepth: "medium",
    });
    expect(caps).toEqual([4096, 8192]);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(plan.status).toBe("ready");
    expect(plan.steps).toHaveLength(3);
  });

  it("clarification follow-up starts at 8192 so the live 4096 saturation class is skipped", async () => {
    const caps: number[] = [];
    const complete = vi.fn(async (_profile: unknown, request: { maxOutputTokens?: number }) => {
      caps.push(request.maxOutputTokens ?? 0);
      return {
        requestId: "plan_ready",
        provider: "DeepSeek",
        model: "deepseek-v4-flash",
        latencyMs: 1,
        finishReason: "stop",
        usage: { inputTokens: 6630, outputTokens: 5200 },
        output: JSON.stringify(truncatedPlanFixture.completeOutput),
      };
    });
    const service = new PlanService({ complete } as unknown as ModelGateway);
    const plan = await service.createPlan({
      projectId: "proj_1",
      scope: { kind: "global" },
      objective: "Add idempotent event dedupe for sync",
      localContext,
      profile,
      thinkingDepth: "medium",
      existingPlanId: "plan_existing",
      clarifyingAnswers: [
        { questionId: "q_1", answer: "Shared contract first", selectedOptionId: "q_1_opt_a" },
      ],
      existingQuestions: [{ id: "q_1", question: "Where first?" }],
    });
    expect(caps).toEqual([8192]);
    expect(plan.status).toBe("ready");
    expect(plan.id).toBe("plan_existing");
  });

  it("still fails closed when the raised budget is also truncated", async () => {
    const complete = vi.fn(async (_profile: unknown, request: { maxOutputTokens?: number }) => ({
      requestId: "plan_still_trunc",
      provider: "DeepSeek",
      model: "deepseek-v4-flash",
      latencyMs: 1,
      finishReason: "length",
      usage: {
        inputTokens: 6630,
        outputTokens: request.maxOutputTokens ?? 4096,
      },
      output: truncatedPlanFixture.truncatedOutput,
    }));
    const service = new PlanService({ complete } as unknown as ModelGateway);
    await expect(
      service.createPlan({
        projectId: "proj_1",
        scope: { kind: "global" },
        objective: "Add idempotent event dedupe for sync",
        localContext,
        profile,
        thinkingDepth: "medium",
      }),
    ).rejects.toBeInstanceOf(ProjectOSError);
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

describe("debug session helpers", () => {
  it("creates an initial debug session", () => {
    const session = createInitialDebugSession(
      {
        projectId: "proj_1",
        scope: { kind: "node", nodeId: "feat_login" },
        bugDescription: "Auth callback failed",
      },
      null,
      43123,
    );
    expect(DebugSessionSchema.parse(session).phase).toBe("hypothesize");
    expect(session.debugLogPort).toBe(43123);
  });

  it("prepares a manual debug session for reproduction", () => {
    const session = prepareManualDebugSession(
      createInitialDebugSession(
        {
          projectId: "proj_1",
          scope: { kind: "node", nodeId: "feat_login" },
          bugDescription: "Auth callback failed",
        },
        null,
        43123,
      ),
      [],
    );
    expect(DebugSessionSchema.parse(session).phase).toBe("reproduce");
    expect(session.hypotheses.length).toBeGreaterThan(0);
  });

  it("resolves a debug fix file from node scope and harness by business node", () => {
    const graph = ProjectGraphSchema.parse(graphFixture);
    const harness = HarnessRecordSchema.parse(authHarnessFixture);
    const session = DebugSessionSchema.parse({
      version: "0.1.0",
      sessionId: "debug_1",
      projectId: harness.projectId,
      scope: { kind: "node", nodeId: "feat_notifications" },
      bugDescription: "Notifications badge does not clear",
      reproSteps: ["Open notifications"],
      hypotheses: [],
      instrumentation: [],
      logEntries: [],
      phase: "fix",
      verification: { status: "not_run" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(resolveDebugFixFilePath(session, { graph })).toContain("notifications");
    expect(
      findHarnessRecordForSession([harness], {
        ...session,
        scope: { kind: "node", nodeId: "feat_login" },
        bugDescription: "Something else entirely",
      })?.errorId,
    ).toBe("err_auth_provider_callback");
  });

  it("chooses a root cause and proposed fix", () => {
    const session = chooseRootCause(
      DebugSessionSchema.parse({
        version: "0.1.0",
        sessionId: "debug_1",
        projectId: "proj_1",
        scope: { kind: "node", nodeId: "feat_login" },
        bugDescription: "Auth callback failed",
        reproSteps: ["Reproduce"],
        hypotheses: [
          {
            id: "hyp_1",
            summary: "Provider callback mismatch",
            confidence: 0.8,
            evidence: ["stack trace"],
          },
        ],
        instrumentation: [
          {
            id: "inst_1",
            filePath: "lib/auth.ts",
            lineRange: "export ",
            kind: "fetch_log",
            status: "applied",
          },
        ],
        logEntries: [],
        phase: "analyze",
        verification: { status: "not_run" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(session.chosenRootCauseId).toBe("hyp_1");
    expect(session.proposedFix?.patchKind).toBe("root_cause");
  });

  it("builds instrumentation snippets with debug server port", () => {
    const snippet = buildInstrumentationSnippet(
      "debug_1",
      "hyp_1",
      "export function",
      "fetch_log",
      45123,
    );
    expect(snippet).toContain("45123");
    expect(snippet).toContain("debug_1");
  });
});
