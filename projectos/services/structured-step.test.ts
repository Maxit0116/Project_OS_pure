import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ModelGatewayRequest, ModelGatewayResponse } from "../contracts/model-gateway.js";
import { ProjectOSError } from "../errors.js";
import {
  runStructuredStep,
  StructuredIssues,
  type StructuredAttempt,
  type StructuredStepSpec,
} from "./structured-step.js";

type Scripted =
  | { tool: string; args: string; finish?: string; tokens?: number }
  | { text: string; finish?: string; tokens?: number };

function script(replies: Scripted[]) {
  const requests: ModelGatewayRequest[] = [];
  const complete = async (request: ModelGatewayRequest): Promise<ModelGatewayResponse> => {
    requests.push(request);
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)]!;
    const finishReason = reply.finish ?? "stop";
    return {
      requestId: `r${requests.length}`,
      provider: "p",
      model: "m",
      output: "tool" in reply ? reply.args : reply.text,
      ...("tool" in reply ? { toolName: reply.tool } : {}),
      finishReason,
      usage: { inputTokens: 1, outputTokens: reply.tokens ?? (finishReason === "length" ? 2048 : 5) },
      latencyMs: 1,
    };
  };
  return { complete, requests };
}

const PlanSchema = z.object({ objective: z.string().min(1), kind: z.enum(["symbol", "endpoint"]) });
const base: ModelGatewayRequest = { requestKind: "agent_step", input: { task: "plan" }, redactionPolicy: "none" };
const spec = (extra: Partial<StructuredStepSpec<z.infer<typeof PlanSchema>>> = {}): StructuredStepSpec<z.infer<typeof PlanSchema>> => ({
  step: "test_step",
  tools: [{ type: "function", function: { name: "submit", parameters: { type: "object" } } }],
  accept: ({ value }) => PlanSchema.parse(value),
  maxOutputTokens: 100,
  retryMaxOutputTokens: 400,
  ...extra,
});

describe("runStructuredStep", () => {
  it("offers the tools, passes its own budget, and accepts a tool call that fits", async () => {
    const { complete, requests } = script([{ tool: "submit", args: "{\"objective\":\"ship\",\"kind\":\"symbol\"}" }]);
    const result = await runStructuredStep(complete, base, spec());
    expect(result.value).toEqual({ objective: "ship", kind: "symbol" });
    expect(result.tool).toBe("submit");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.structured?.tools[0]!.function.name).toBe("submit");
    expect(requests[0]!.maxOutputTokens).toBe(100);
    expect(result.attempts).toMatchObject([{ attempt: 1, via: "tool", tool: "submit", outcome: "accepted" }]);
  });

  it("still accepts a model that answers in text, fences and all", async () => {
    const { complete } = script([{ text: "```json\n{\"objective\":\"ship\",\"kind\":\"endpoint\"}\n```" }]);
    const result = await runStructuredStep(complete, base, spec());
    expect(result.value.kind).toBe("endpoint");
    expect(result.attempts[0]).toMatchObject({ via: "text", outcome: "accepted" });
  });

  it("tells the model which field was wrong and why, then accepts the corrected answer", async () => {
    // Observed live: the model wrote kind "function"; the retry was told only "invalid plan shape".
    const { complete, requests } = script([
      { tool: "submit", args: "{\"objective\":\"ship\",\"kind\":\"function\"}" },
      { tool: "submit", args: "{\"objective\":\"ship\",\"kind\":\"symbol\"}" },
    ]);
    const result = await runStructuredStep(complete, base, spec());
    expect(result.value.kind).toBe("symbol");
    const repair = (requests[1]!.input as { repair: { problem: string; previousAnswerStartedWith: string } }).repair;
    expect(repair.problem).toMatch(/kind: Invalid enum value/u);
    expect(repair.problem).toMatch(/symbol/u);
    expect(repair.previousAnswerStartedWith).toContain("function");
    expect((requests[0]!.input as { repair?: unknown }).repair).toBeUndefined();
    expect(requests[1]!.maxOutputTokens).toBe(400);
    expect(result.attempts.map((a) => a.outcome)).toEqual(["does_not_fit", "accepted"]);
    expect(result.attempts[0]!.issues![0]).toMatch(/^kind:/u);
  });

  it("asks again with more room, and without a correction, when an answer is cut off", async () => {
    const { complete, requests } = script([
      { tool: "submit", args: "{\"objective\":\"sh", finish: "length" },
      { tool: "submit", args: "{\"objective\":\"ship\",\"kind\":\"symbol\"}" },
    ]);
    const result = await runStructuredStep(complete, base, spec());
    expect(result.value.objective).toBe("ship");
    expect((requests[1]!.input as { repair?: unknown }).repair).toBeUndefined();
    expect(requests.map((r) => r.maxOutputTokens)).toEqual([100, 400]);
    expect(result.attempts.map((a) => a.outcome)).toEqual(["cut_off", "accepted"]);
  });

  it("reports tool arguments that are not JSON as exactly that", async () => {
    const { complete, requests } = script([
      { tool: "submit", args: "{\"objective\":\"ship\"}}" },
      { tool: "submit", args: "{\"objective\":\"ship\",\"kind\":\"symbol\"}" },
    ]);
    await runStructuredStep(complete, base, spec());
    expect((requests[1]!.input as { repair: { problem: string } }).repair.problem).toMatch(/arguments of submit were not valid JSON/u);
  });

  it("accepts the step's own StructuredIssues as feedback too", async () => {
    const { complete, requests } = script([
      { tool: "submit", args: "{\"objective\":\"ship\",\"kind\":\"symbol\"}" },
      { tool: "submit", args: "{\"objective\":\"ship it properly\",\"kind\":\"symbol\"}" },
    ]);
    const result = await runStructuredStep(complete, base, spec({
      accept: ({ value }) => {
        const plan = PlanSchema.parse(value);
        if (plan.objective === "ship") throw new StructuredIssues(["objective: name the work, not just 'ship'"]);
        return plan;
      },
    }));
    expect(result.value.objective).toBe("ship it properly");
    expect((requests[1]!.input as { repair: { problem: string } }).repair.problem).toContain("name the work");
  });

  it("gives up after its attempts with a coded error that names the step and keeps the attempts", async () => {
    const { complete, requests } = script([{ tool: "submit", args: "{\"objective\":\"\",\"kind\":\"nope\"}" }]);
    const failure = await runStructuredStep(complete, base, spec()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProjectOSError);
    expect((failure as ProjectOSError).code).toBe("model_output_invalid");
    expect((failure as ProjectOSError).message).toMatch(/test_step answer did not fit after 3 attempts/u);
    expect(((failure as ProjectOSError).details as { attempts: StructuredAttempt[] }).attempts).toHaveLength(3);
    expect(requests).toHaveLength(3);
  });

  it("lets a bug in the step's own check surface instead of hiding it as a bad answer", async () => {
    const { complete } = script([{ tool: "submit", args: "{\"objective\":\"ship\",\"kind\":\"symbol\"}" }]);
    await expect(runStructuredStep(complete, base, spec({
      accept: () => { throw new TypeError("bug in accept"); },
    }))).rejects.toThrow("bug in accept");
  });

  it("reports every attempt as it happens", async () => {
    const seen: string[] = [];
    const { complete } = script([
      { text: "no json here" },
      { tool: "submit", args: "{\"objective\":\"ship\",\"kind\":\"symbol\"}" },
    ]);
    await runStructuredStep(complete, base, spec({ onAttempt: (attempt) => seen.push(`${attempt.attempt}:${attempt.outcome}`) }));
    expect(seen).toEqual(["1:not_json", "2:accepted"]);
  });
});
