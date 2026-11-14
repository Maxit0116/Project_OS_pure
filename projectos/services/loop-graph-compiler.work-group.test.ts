import { describe, expect, it } from "vitest";

import type { IntentGraph } from "../contracts/loop-graph.js";
import { compileIntentGraphHeuristic } from "./loop-graph-compiler.js";

function specialist(
  id: string,
  title: string,
  x: number,
): IntentGraph["nodes"][number] {
  return {
    id,
    title,
    prompt: `${title} does the work`,
    type: "agent",
    agentRole: "coder",
    agentDefinitionId: `agent_${id}`,
    workGroupId: "wg1",
    position: { x, y: 40 },
  };
}

describe("compileIntentGraphHeuristic · work groups", () => {
  it("expands coordinator internal edges and rewrites boundary ports", () => {
    const draft: IntentGraph = {
      revision: 2,
      graphPrompt: "Ship feature with a squad",
      workGroupSeq: 1,
      workGroups: [
        {
          id: "wg1",
          title: "Delivery",
          memberNodeIds: ["coord", "a", "b"],
          collaborationMode: "coordinator",
          coordinatorNodeId: "coord",
          createdAt: "2026-11-13T00:00:00.000Z",
          updatedAt: "2026-11-13T00:00:00.000Z",
        },
      ],
      nodes: [
        {
          id: "up",
          title: "Intake",
          prompt: "Collect goal",
          type: "human",
          humanMode: "input",
          position: { x: 0, y: 40 },
        },
        specialist("coord", "Coordinator", 200),
        specialist("a", "Coder A", 200),
        specialist("b", "Coder B", 200),
        {
          id: "down",
          title: "Approve",
          prompt: "Approve result",
          type: "human",
          humanMode: "approval",
          position: { x: 500, y: 40 },
        },
      ],
      edges: [
        {
          id: "e_in",
          source: "up",
          target: "wg1",
          kind: "depends",
          prompt: "Hand off to squad",
          workGroupPort: "in",
        },
        {
          id: "e_out",
          source: "wg1",
          target: "down",
          kind: "depends",
          prompt: "Squad delivers",
          workGroupPort: "out",
        },
      ],
    };

    const result = compileIntentGraphHeuristic(draft, {
      now: "2026-11-13T01:00:00.000Z",
    });
    const edges = result.specDraft.edges;
    expect(result.specDraft.workGroups?.[0]?.id).toBe("wg1");
    expect(
      edges.some((edge) => edge.from === "up" && edge.to === "coord"),
    ).toBe(true);
    expect(
      edges.some((edge) => edge.from === "coord" && edge.to === "a"),
    ).toBe(true);
    expect(
      edges.some((edge) => edge.from === "coord" && edge.to === "b"),
    ).toBe(true);
    expect(
      edges.some((edge) => edge.from === "a" && edge.to === "down"),
    ).toBe(true);
    expect(
      edges.some((edge) => edge.from === "b" && edge.to === "down"),
    ).toBe(true);
    expect(
      result.specDraft.nodes.find((node) => node.id === "a")?.workGroupId,
    ).toBe("wg1");
  });

  it("expands serial internal chain", () => {
    const draft: IntentGraph = {
      revision: 1,
      graphPrompt: "Serial squad",
      workGroups: [
        {
          id: "wg1",
          title: "Serial",
          memberNodeIds: ["a", "b", "c"],
          collaborationMode: "serial",
          createdAt: "2026-11-13T00:00:00.000Z",
          updatedAt: "2026-11-13T00:00:00.000Z",
        },
      ],
      nodes: [
        specialist("a", "A", 0),
        specialist("b", "B", 120),
        specialist("c", "C", 240),
      ],
      edges: [],
    };
    const edges = compileIntentGraphHeuristic(draft).specDraft.edges;
    expect(edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual([
      "a->b",
      "b->c",
    ]);
  });
});
