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

function gatewayReplying(outputs: string[]) {
  const seen: unknown[] = [];
  const gateway = {
    complete: async (_profile: unknown, request: { input: unknown }) => {
      seen.push(request.input);
      const output = outputs[Math.min(seen.length - 1, outputs.length - 1)]!;
      return { output, usage: { inputTokens: 1, outputTokens: 1 }, requestId: "r", provider: "custom", model: "m", durationMs: 1 };
    },
  } as unknown as ModelGateway;
  return { gateway, seen };
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
    const retryInput = seen[1] as { correction?: { problem: string; previousReplyStartedWith: string } };
    expect(retryInput.correction?.problem).toBe("the reply was not valid JSON");
    expect(retryInput.correction?.previousReplyStartedWith).toContain("DSML");
    expect((seen[0] as { correction?: unknown }).correction).toBeUndefined();
  });

  it("also retries JSON that does not match the action schema", async () => {
    const { gateway, seen } = gatewayReplying([JSON.stringify({ action: "dance" }), FINAL_REPLY]);
    await extractWith(gateway);
    expect(seen).toHaveLength(2);
    expect((seen[1] as { correction: { problem: string } }).correction.problem).toBe(
      "the JSON did not match the action schema",
    );
  });

  it("gives up after one retry with a coded error, not a raw SyntaxError", async () => {
    const { gateway, seen } = gatewayReplying([DSML_REPLY]);
    const failure = await extractWith(gateway).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProjectOSError);
    expect((failure as ProjectOSError).code).toBe("model_output_invalid");
    expect(seen).toHaveLength(2);
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
