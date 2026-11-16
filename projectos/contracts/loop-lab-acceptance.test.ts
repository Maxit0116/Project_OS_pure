import { describe, expect, it } from "vitest";

import { collectUpstreamAgentAcceptance } from "./loop-lab-acceptance.js";
import type { LoopSpec } from "./loop-graph.js";

function spec(partial: Partial<LoopSpec> & Pick<LoopSpec, "nodes" | "edges">): LoopSpec {
  return {
    version: "1",
    graphRevision: 1,
    goal: "test",
    acceptance: [],
    retryPolicy: { onFailure: "pause_hitl", maxAutoRetries: 1 },
    stopPolicy: { maxRounds: 10 },
    permissions: [],
    openQuestions: [],
    assumptions: [],
    cycleGates: [],
    ...partial,
  };
}

describe("collectUpstreamAgentAcceptance", () => {
  it("merges agent acceptance until human/lab barrier", () => {
    const graph = spec({
      nodes: [
        {
          id: "a1",
          role: "implement",
          type: "agent",
          goal: "Build A",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [
            { id: "acc_a", description: "Feature A works", kind: "machine" },
          ],
        },
        {
          id: "h1",
          role: "decide",
          type: "human",
          humanMode: "approval",
          goal: "Approve",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "a2",
          role: "implement",
          type: "agent",
          goal: "Build B",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [
            { id: "acc_b", description: "Feature B works", kind: "machine" },
          ],
        },
        {
          id: "lab",
          role: "verify",
          type: "action",
          actionIntegration: "lab",
          actionOperation: "verify",
          goal: "Verify",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [
        { id: "e1", from: "a1", to: "h1", kind: "depends" },
        { id: "e2", from: "h1", to: "a2", kind: "depends" },
        { id: "e3", from: "a2", to: "lab", kind: "depends" },
      ],
    });

    const items = collectUpstreamAgentAcceptance(graph, "lab");
    expect(items.map((item) => item.id)).toEqual(["acc_b"]);
    expect(items[0]?.sourceNodeId).toBe("a2");
  });

  it("collects multiple agents before the barrier", () => {
    const graph = spec({
      nodes: [
        {
          id: "a1",
          role: "implement",
          type: "agent",
          goal: "Plan",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [
            { id: "acc_1", description: "Plan ready", kind: "human" },
          ],
        },
        {
          id: "a2",
          role: "implement",
          type: "agent",
          goal: "Code",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [
            { id: "acc_2", description: "Code ready", kind: "machine" },
          ],
        },
        {
          id: "lab",
          role: "verify",
          type: "action",
          actionIntegration: "lab",
          actionOperation: "verify",
          goal: "Verify",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [
        { id: "e1", from: "a1", to: "a2", kind: "depends" },
        { id: "e2", from: "a2", to: "lab", kind: "depends" },
      ],
    });

    const items = collectUpstreamAgentAcceptance(graph, "lab");
    expect(items.map((item) => item.id).sort()).toEqual(["acc_1", "acc_2"]);
  });
});
