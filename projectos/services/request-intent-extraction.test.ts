import { describe, expect, it } from "vitest";

import graphFixture from "../client/sample-projectos-fixtures/graph.json" with { type: "json" };
import { ProjectGraphSchema } from "../contracts/graph.js";
import { ProjectOSError } from "../errors.js";
import type { ModelGateway } from "./model-gateway/index.js";
import { RequestIntentExtractionService } from "./request-intent-extraction.js";

const graph = ProjectGraphSchema.parse(graphFixture);

const FINAL_REPLY = JSON.stringify({
  action: "final",
  intent: {
    goal: "Let fetchPosts take an optional limit",
    kind: "change",
    touches: [{
      nodeId: "feat_database",
      reason: "fetchPosts lives in a file this node owns",
      allow: { editExisting: true, addParts: false, deletePartIds: [] },
    }],
    structuralProposals: [],
    assumptions: [],
    outOfScope: [],
    acceptance: ["fetchPosts() still returns 20 posts"],
    questions: [],
  },
});

/** What DeepSeek replied once when asked for JSON: its own tool-call markup. */
const DSML_REPLY = "<｜｜DSML｜｜ function_calls><｜｜DSML｜｜ invoke name=\"read_source\">";

type ScriptedReply =
  | string
  | { output: string; finishReason: "length" | "stop" }
  | { tool: string; args: unknown };

function gatewayReplying(outputs: ScriptedReply[]) {
  const seen: unknown[] = [];
  const caps: Array<number | undefined> = [];
  const systemPrompts: string[] = [];
  const toolsOffered: string[][] = [];
  const gateway = {
    complete: async (_profile: unknown, request: { input: unknown; maxOutputTokens?: number; systemPrompt?: string; structured?: { tools: Array<{ function: { name: string } }> } }) => {
      seen.push(request.input);
      toolsOffered.push(request.structured?.tools.map((tool) => tool.function.name) ?? []);
      systemPrompts.push(request.systemPrompt ?? "");
      caps.push(request.maxOutputTokens);
      const scripted = outputs[Math.min(seen.length - 1, outputs.length - 1)]!;
      const reply = typeof scripted === "string"
        ? { output: scripted, finishReason: "stop" as const }
        : "tool" in scripted
          ? { output: JSON.stringify(scripted.args), finishReason: "stop" as const, toolName: scripted.tool }
          : { ...scripted, toolName: undefined };
      return {
        output: reply.output,
        ...(reply.toolName ? { toolName: reply.toolName } : {}),
        finishReason: reply.finishReason,
        usage: { inputTokens: 1, outputTokens: reply.finishReason === "length" ? 2048 : 1 },
        requestId: "r",
        provider: "custom",
        model: "m",
        durationMs: 1,
      };
    },
  } as unknown as ModelGateway;
  return { gateway, seen, caps, systemPrompts, toolsOffered };
}

function extractWith(gateway: ModelGateway) {
  return new RequestIntentExtractionService(gateway).extract({
    request: {
      projectId: graph.projectId,
      rawRequest: "Let fetchPosts take an optional limit",
      nodeId: "feat_database",
      filePath: "lib/data.ts",
      executorSelection: { kind: "model", modelProfileId: "model_1" },
    },
    graph,
    globalContext: {
      projectName: "Sample",
      conciseDescription: "Sample SaaS",
      immediateNodes: [],
      immediateRelations: [],
      topLevelNodes: [],
    } as never,
    execution: {
      profile: {
        id: "model_1",
        name: "DeepSeek",
        provider: "custom",
        model: "deepseek-v4-flash",
        apiKeyRef: "key",
      },
      thinkingDepth: "medium",
    } as never,
  });
}

describe("master discovery output handling", () => {
  it("recovers when the model answers the first discovery step with something that is not JSON", async () => {
    const { gateway, seen } = gatewayReplying([DSML_REPLY, FINAL_REPLY]);
    const intent = await extractWith(gateway);
    expect(intent.goal).toBe("Let fetchPosts take an optional limit");
    expect(seen).toHaveLength(2);
    // The retry tells the model what went wrong, and shows the start of its own reply, once.
    const retryInput = seen[1] as { repair?: { problem: string; previousAnswerStartedWith: string } };
    expect(retryInput.repair?.problem).toBe("the reply was neither a tool call nor a JSON object");
    expect(retryInput.repair?.previousAnswerStartedWith).toContain("DSML");
    expect((seen[0] as { repair?: unknown }).repair).toBeUndefined();
  });

  it("also retries JSON that does not match the action schema", async () => {
    const { gateway, seen } = gatewayReplying([JSON.stringify({ action: "dance" }), FINAL_REPLY]);
    await extractWith(gateway);
    expect(seen).toHaveLength(2);
    expect((seen[1] as { repair: { problem: string } }).repair.problem).toMatch(/^action: /u);
  });

  it("tells the model which part of its answer did not fit, so the retry can fix it", async () => {
    // Observed live: the model invented a structural proposal of kind "add_relation" for a code-level
    // dependency; the retry was told only that the JSON "did not match", and the run failed.
    const bad = JSON.parse(FINAL_REPLY) as { intent: Record<string, unknown> };
    bad.intent.structuralProposals = [{ kind: "add_relation", sourceNodeId: "feat_database", targetNodeId: "feat_blog" }];
    const { gateway, seen, systemPrompts } = gatewayReplying([JSON.stringify(bad), FINAL_REPLY]);
    const intent = await extractWith(gateway);
    expect(intent.structuralEffects).toEqual([]);
    const problem = (seen[1] as { repair: { problem: string } }).repair.problem;
    expect(problem).toMatch(/structuralProposals/u);
    expect(problem).toMatch(/add_node.*delete_node.*connect_nodes/u);
    // And the first request already says what the kinds are and when to leave the array empty.
    expect(systemPrompts[0]).toMatch(/not a structural change, so leave it empty/u);
    expect(JSON.stringify((seen[0] as { outputSchema: unknown }).outputSchema)).toMatch(/connect_nodes/u);
  });

  it("gives up after its attempts with a coded error, not a raw SyntaxError", async () => {
    const { gateway, seen } = gatewayReplying([DSML_REPLY]);
    const failure = await extractWith(gateway).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProjectOSError);
    expect((failure as ProjectOSError).code).toBe("model_output_invalid");
    expect(seen).toHaveLength(3);
  });

  it("asks for the intent card in the language the person wrote the request in", async () => {
    // Observed live: a Chinese request produced an English goal, assumptions and acceptance list.
    const { gateway, systemPrompts } = gatewayReplying([FINAL_REPLY]);
    await extractWith(gateway);
    expect(systemPrompts[0]).toMatch(/in the language of the user's request/u);
    expect(systemPrompts[0]).toMatch(/node ids, file paths and code identifiers exactly/u);
  });

  it("offers each discovery action as a tool, and takes a tool call as the answer", async () => {
    // The provider shapes the arguments; the server still validates them.
    const finalArgs = JSON.parse(FINAL_REPLY).intent;
    const { gateway, toolsOffered, seen } = gatewayReplying([{ tool: "final", args: { intent: finalArgs } }]);
    const intent = await extractWith(gateway);
    expect(toolsOffered[0]).toEqual(["inspect_node", "list_children", "read_source", "consult_node", "final"]);
    expect(intent.goal).toBe("Let fetchPosts take an optional limit");
    expect(seen).toHaveLength(1);
  });

  it("takes the intent's own fields as the final call's arguments too, instead of asking again", async () => {
    // Which of the two shapes a model uses depends on what else it has seen; both mean the same thing.
    const flat = JSON.parse(FINAL_REPLY).intent;
    const { gateway, seen } = gatewayReplying([{ tool: "final", args: flat }]);
    const intent = await extractWith(gateway);
    expect(intent.goal).toBe("Let fetchPosts take an optional limit");
    expect(seen).toHaveLength(1);
  });

  it("turns a gathering tool call into the same action the text format used, and keeps looping", async () => {
    const finalArgs = JSON.parse(FINAL_REPLY).intent;
    const inspected: string[] = [];
    const { gateway, seen } = gatewayReplying([
      { tool: "inspect_node", args: { nodeId: "feat_database", reason: "find the owner of lib/data.ts" } },
      { tool: "final", args: finalArgs },
    ]);
    const intent = await new RequestIntentExtractionService(gateway).extract({
      request: { projectId: graph.projectId, rawRequest: "x", nodeId: "feat_database", executorSelection: { kind: "model", modelProfileId: "model_1" } },
      graph,
      globalContext: { projectName: "Sample", conciseDescription: "d", immediateNodes: [], immediateRelations: [], topLevelNodes: [] } as never,
      execution: { profile: { id: "model_1", name: "n", provider: "custom", model: "m", apiKeyRef: "k" }, thinkingDepth: "medium" } as never,
      inspectNode: async (nodeId: string) => {
        inspected.push(nodeId);
        return { neighborhood: { selected: { id: nodeId }, children: [], upstream: [], downstream: [] }, fileManifest: [] } as never;
      },
    });
    expect(inspected).toEqual(["feat_database"]);
    expect(seen).toHaveLength(2);
    expect(intent.touches[0]!.nodeId).toBe("feat_database");
  });

  it("sends a tool call whose arguments do not fit back with the exact field, then accepts the fix", async () => {
    const finalArgs = JSON.parse(FINAL_REPLY).intent;
    const bad = { ...finalArgs, structuralProposals: [{ kind: "add_relation" }] };
    const { gateway, seen } = gatewayReplying([{ tool: "final", args: { intent: bad } }, { tool: "final", args: { intent: finalArgs } }]);
    await extractWith(gateway);
    expect((seen[1] as { repair: { problem: string } }).repair.problem).toMatch(/intent\.structuralProposals\.0\.kind/u);
  });

  it("reports every model attempt to the caller", async () => {
    const outcomes: string[] = [];
    const { gateway } = gatewayReplying([DSML_REPLY, FINAL_REPLY]);
    await new RequestIntentExtractionService(gateway).extract({
      request: { projectId: graph.projectId, rawRequest: "x", nodeId: "feat_database", filePath: "lib/data.ts", executorSelection: { kind: "model", modelProfileId: "model_1" } },
      graph,
      globalContext: { projectName: "Sample", conciseDescription: "d", immediateNodes: [], immediateRelations: [], topLevelNodes: [] } as never,
      execution: { profile: { id: "model_1", name: "n", provider: "custom", model: "m", apiKeyRef: "k" }, thinkingDepth: "medium" } as never,
      onModelAttempt: (attempt) => outcomes.push(attempt.outcome),
    });
    expect(outcomes).toEqual(["not_json", "accepted"]);
  });

  it("states its own output budget instead of the gateway's 2048-token default", async () => {
    const { gateway, caps } = gatewayReplying([FINAL_REPLY]);
    await extractWith(gateway);
    expect(caps).toEqual([8192]);
  });

  it("asks again with a larger budget when a reply is cut off, without scolding the model about its format", async () => {
    // Observed live: DeepSeek spent its whole 2048 budget reasoning and returned nothing, then cut the
    // final intent off mid-string on the retry. The person saw a failure after the model had read the code.
    const cutOffFinal = { output: FINAL_REPLY.slice(0, 120), finishReason: "length" as const };
    const { gateway, seen, caps } = gatewayReplying([cutOffFinal, FINAL_REPLY]);
    const intent = await extractWith(gateway);
    expect(intent.goal).toBe("Let fetchPosts take an optional limit");
    expect(caps).toEqual([8192, 16_384]);
    expect((seen[1] as { correction?: unknown }).correction).toBeUndefined();
  });

  it("reports a reply that is cut off even after the larger budget as exactly that", async () => {
    const empty = { output: "", finishReason: "length" as const };
    const { gateway, caps } = gatewayReplying([empty]);
    const failure = await extractWith(gateway).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProjectOSError);
    expect((failure as ProjectOSError).code).toBe("model_output_invalid");
    expect((failure as ProjectOSError).message).toMatch(/cut off/);
    expect(caps).toEqual([8192, 16_384, 16_384]);
  });

  it("keeps the files the model says it will edit, and derives the other owners of a shared one", async () => {
    const reply = JSON.parse(FINAL_REPLY) as { intent: { touches: Array<Record<string, unknown>> } };
    reply.intent.touches[0]!.files = ["lib/db.ts"];
    const { gateway } = gatewayReplying([JSON.stringify(reply)]);
    const intent = await extractWith(gateway);
    expect(intent.touches.find((touch) => !touch.derived)!.files).toEqual(["lib/db.ts"]);
    expect(intent.touches.filter((touch) => touch.derived).length).toBeGreaterThan(1);
  });

  it("drops keys the model adds to its answer instead of failing the whole intent", async () => {
    // The same stray-key habit that failed the delegation plan twice live.
    const reply = JSON.parse(FINAL_REPLY) as { intent: Record<string, unknown> & { touches: Array<Record<string, unknown>> } };
    reply.intent.confidence = "high";
    reply.intent.touches[0]!.note = "ignored";
    const { gateway, seen } = gatewayReplying([JSON.stringify({ ...reply, thinking: "..." })]);
    const intent = await extractWith(gateway);
    expect(seen).toHaveLength(1);
    expect(JSON.stringify(intent)).not.toMatch(/"confidence"|"note"|"thinking"/u);
  });

  it("covers every owner of the requested file in the approved capabilities", async () => {
    const { gateway } = gatewayReplying([FINAL_REPLY]);
    const intent = await extractWith(gateway);
    // lib/data.ts is also owned by feat_blog; the model only named feat_database.
    expect(intent.touches.map((touch) => touch.nodeId).sort()).toEqual(["feat_blog", "feat_database"]);
    expect(intent.requestedFile).toEqual({ nodeId: "feat_database", path: "lib/data.ts" });
    // Routing stays on the node the model planned for; the co-owner is disclosed, not delegated to.
    expect(intent.entryNodeId).toBe("feat_database");
  });

  it("ignores a model that marks its own touches as server-derived", async () => {
    const forged = JSON.parse(FINAL_REPLY) as { intent: { touches: Array<Record<string, unknown>> } };
    forged.intent.touches[0]!.derived = true;
    const { gateway } = gatewayReplying([JSON.stringify(forged)]);
    const intent = await extractWith(gateway);
    expect(intent.touches.find((touch) => touch.nodeId === "feat_database")!.derived).toBeUndefined();
    expect(intent.entryNodeId).toBe("feat_database");
  });
});
