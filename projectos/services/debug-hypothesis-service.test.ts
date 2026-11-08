import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { AgentContextBundle } from "../contracts/local-context.js";
import type { DebugSession } from "../contracts/debug-session.js";
import type { ModelProfile } from "../contracts/settings.js";
import { DebugHypothesisService } from "./debug-hypothesis-service.js";

const profile: ModelProfile = {
  id: "model-1",
  name: "Test",
  provider: "openai",
  model: "gpt-test",
  apiKeyRef: "test-key",
};

const localContext = {
  bundleHash: `sha256:${"a".repeat(64)}`,
  synopsis: "test",
  files: [],
} as unknown as AgentContextBundle;

describe("DebugHypothesisService", () => {
  it("falls back to seedManualHypotheses when the model fails", async () => {
    const gateway = {
      complete: vi.fn(async () => {
        throw new Error("model down");
      }),
    };
    const service = new DebugHypothesisService(gateway as never);
    const hypotheses = await service.generateHypotheses({
      projectId: "proj",
      bugDescription: "Login redirect loops forever",
      localContext,
      profile,
      thinkingDepth: "medium",
    });
    expect(hypotheses.length).toBeGreaterThan(0);
    expect(hypotheses[0]?.summary).toContain("Login redirect");
  });

  it("falls back to first hypothesis when log analysis JSON is invalid", async () => {
    const gateway = {
      complete: vi.fn(async () => ({
        output: "not-json",
        reasoning: undefined,
      })),
    };
    const service = new DebugHypothesisService(gateway as never);
    const session = {
      hypotheses: [
        {
          id: "hyp_a",
          summary: "Null owner",
          confidence: 0.7,
          evidence: [],
        },
      ],
      instrumentation: [{ filePath: "app.ts" }],
      bugDescription: "boom",
    } as unknown as DebugSession;
    const result = await service.chooseRootCauseFromLogs({
      projectId: "proj",
      session,
      logs: [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          sessionId: "dbg",
          location: "app.ts:1",
          payload: "error",
        },
      ],
      profile,
      thinkingDepth: "medium",
    });
    expect(result.chosenRootCauseId).toBe("hyp_a");
    expect(result.proposedFix.summary).toContain("Null owner");
  });

  describe("model answers that arrive cut off or not quite right", () => {
    type Reply = { output: string; finishReason?: string; toolName?: string; outputTokens?: number };
    const scripted = (replies: Reply[]) => {
      const requests: Array<{ maxOutputTokens?: number; input: unknown; toolNames: string[] }> = [];
      const gateway = {
        complete: vi.fn(async (_profile: unknown, request: { maxOutputTokens?: number; input: unknown; structured?: { tools: Array<{ function: { name: string } }> } }) => {
          requests.push({
            ...(request.maxOutputTokens !== undefined ? { maxOutputTokens: request.maxOutputTokens } : {}),
            input: request.input,
            toolNames: request.structured?.tools.map((entry) => entry.function.name) ?? [],
          });
          const reply = replies[Math.min(requests.length - 1, replies.length - 1)]!;
          return {
            requestId: "r", provider: "p", model: "m",
            output: reply.output,
            ...(reply.toolName ? { toolName: reply.toolName } : {}),
            ...(reply.finishReason ? { finishReason: reply.finishReason } : {}),
            usage: { inputTokens: 1, outputTokens: reply.outputTokens ?? (reply.finishReason === "length" ? 8192 : 50) },
            latencyMs: 1,
          };
        }),
      };
      return { gateway, requests };
    };
    const hypothesesJson = JSON.stringify({ hypotheses: [{ id: "hyp_1", summary: "The status filter includes done tasks", confidence: 0.8, evidence: ["lib/team.ts"] }] });

    it("asks again with more room when the hypotheses are cut off, instead of showing placeholders", async () => {
      // Observed live: 2048 tokens were spent reasoning, the JSON ended mid-string, and the person saw
      // "Inspect code paths related to: <the bug text>" instead of the model's own hypothesis.
      const { gateway, requests } = scripted([
        { output: hypothesesJson.slice(0, 80), finishReason: "length" },
        { output: hypothesesJson, toolName: "submit_hypotheses" },
      ]);
      const hypotheses = await new DebugHypothesisService(gateway as never).generateHypotheses({
        projectId: "proj", bugDescription: "Team page counts done tasks", localContext, profile, thinkingDepth: "medium",
      });
      expect(hypotheses.map((item) => item.summary)).toEqual(["The status filter includes done tasks"]);
      expect(requests.map((request) => request.maxOutputTokens)).toEqual([8192, 16_384]);
      expect(requests[0]!.toolNames).toEqual(["submit_hypotheses"]);
    });

    it("sends back an instrumentation anchor that is not in the file, naming it, and takes the corrected one", async () => {
      const bad = JSON.stringify({ specs: [{ id: "inst_1", filePath: "lib/team.ts", hypothesisId: "hyp_1", anchor: "no such text", kind: "console_log" }] });
      const good = JSON.stringify({ specs: [{ id: "inst_1", filePath: "lib/team.ts", hypothesisId: "hyp_1", anchor: "OPEN_TASK_STATUSES", kind: "console_log" }] });
      const { gateway, requests } = scripted([{ output: bad, toolName: "submit_instrumentation" }, { output: good, toolName: "submit_instrumentation" }]);
      const root = mkdtempSync(join(tmpdir(), "dbg-"));
      mkdirSync(join(root, "lib"));
      writeFileSync(join(root, "lib/team.ts"), "const OPEN_TASK_STATUSES = ['todo']\n");
      const specs = await new DebugHypothesisService(gateway as never).proposeInstrumentationSpecs({
        projectId: "proj",
        session: { bugDescription: "boom", hypotheses: [{ id: "hyp_1", summary: "s", confidence: 0.5, evidence: [] }], instrumentation: [] } as unknown as DebugSession,
        scopeFiles: ["lib/team.ts"], workspaceRoot: root, profile, thinkingDepth: "medium",
      });
      expect(specs.map((spec) => spec.anchor)).toEqual(["OPEN_TASK_STATUSES"]);
      expect((requests[1]!.input as { repair: { problem: string } }).repair.problem).toMatch(/specs\.0\.anchor: not found verbatim in the preview of lib\/team\.ts/u);
    });

    it("sends back a root cause that is not one of the hypotheses, listing the ones that are", async () => {
      const session = { hypotheses: [{ id: "hyp_a", summary: "Null owner", confidence: 0.7, evidence: [] }], instrumentation: [], bugDescription: "boom" } as unknown as DebugSession;
      const { gateway, requests } = scripted([
        { output: JSON.stringify({ chosenRootCauseId: "hyp_zzz", proposedFixSummary: "x" }), toolName: "submit_root_cause" },
        { output: JSON.stringify({ chosenRootCauseId: "hyp_a", proposedFixSummary: "Guard the owner", touchedFiles: ["a.ts"] }), toolName: "submit_root_cause" },
      ]);
      const result = await new DebugHypothesisService(gateway as never).chooseRootCauseFromLogs({
        projectId: "proj", session, logs: [], profile, thinkingDepth: "medium",
      });
      expect(result).toMatchObject({ chosenRootCauseId: "hyp_a", proposedFix: { summary: "Guard the owner", touchedFiles: ["a.ts"] } });
      expect((requests[1]!.input as { repair: { problem: string } }).repair.problem).toMatch(/'hyp_zzz' is not one of hyp_a/u);
    });

    it("sends back a root cause that names no file, because a bug reported without a file is fixed in the file the analysis names", async () => {
      // Observed live: with no file selected the analysis described the right file in prose, left
      // touchedFiles empty, and the fix then failed for want of a target.
      const session = { hypotheses: [{ id: "hyp_a", summary: "Null owner", confidence: 0.7, evidence: [] }], instrumentation: [], bugDescription: "boom" } as unknown as DebugSession;
      const { gateway, requests } = scripted([
        { output: JSON.stringify({ chosenRootCauseId: "hyp_a", proposedFixSummary: "Guard the owner in lib/team.ts" }), toolName: "submit_root_cause" },
        { output: JSON.stringify({ chosenRootCauseId: "hyp_a", proposedFixSummary: "Guard the owner", touchedFiles: ["lib/team.ts"] }), toolName: "submit_root_cause" },
      ]);
      const result = await new DebugHypothesisService(gateway as never).chooseRootCauseFromLogs({
        projectId: "proj", session, logs: [], profile, thinkingDepth: "medium",
      });
      expect(result.proposedFix.touchedFiles).toEqual(["lib/team.ts"]);
      expect((requests[1]!.input as { repair: { problem: string } }).repair.problem).toMatch(/touchedFiles: name at least one repo-relative file path/u);
    });

    it("reports every problem with a root-cause answer at once", async () => {
      const session = { hypotheses: [{ id: "hyp_a", summary: "Null owner", confidence: 0.7, evidence: [] }], instrumentation: [], bugDescription: "boom" } as unknown as DebugSession;
      const { gateway, requests } = scripted([
        { output: JSON.stringify({ chosenRootCauseId: "hyp_zzz", proposedFixSummary: "x" }), toolName: "submit_root_cause" },
        { output: JSON.stringify({ chosenRootCauseId: "hyp_a", proposedFixSummary: "y", touchedFiles: ["a.ts"] }), toolName: "submit_root_cause" },
      ]);
      await new DebugHypothesisService(gateway as never).chooseRootCauseFromLogs({
        projectId: "proj", session, logs: [], profile, thinkingDepth: "medium",
      });
      const problem = (requests[1]!.input as { repair: { problem: string } }).repair.problem;
      expect(problem).toMatch(/'hyp_zzz' is not one of hyp_a/u);
      expect(problem).toMatch(/touchedFiles: name at least one/u);
    });

    it("still falls back to placeholders when the model never produces a usable answer", async () => {
      const { gateway } = scripted([{ output: "not json at all" }]);
      const hypotheses = await new DebugHypothesisService(gateway as never).generateHypotheses({
        projectId: "proj", bugDescription: "Login redirect loops", localContext, profile, thinkingDepth: "medium",
      });
      expect(hypotheses[0]?.summary).toContain("Login redirect");
    });
  });
});
