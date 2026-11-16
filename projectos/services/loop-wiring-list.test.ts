import { describe, expect, it } from "vitest";

import { IntentGraphSchema } from "../contracts/loop-graph.js";
import { LOOP_WIRING_LIST_THRESHOLD } from "../contracts/loop-node-architecture.js";
import { resolveAgentWiring } from "./loop-agent-wiring.js";
import {
  connectedWiringAssetIds,
  estimateWiringListCardSize,
  LOOP_WIRING_LIST_CARD_MAX_VISIBLE_ROWS,
  normalizeWiringLists,
  removeWiringListMember,
  wiringListMembersOf,
} from "./loop-wiring-list.js";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

function agentDraft(skillCount: number) {
  seq = 0;
  const nodes = [
    {
      id: "agent_1",
      title: "Coder",
      prompt: "Ship",
      type: "agent" as const,
      position: { x: 100, y: 80 },
    },
  ];
  const edges = [];
  for (let i = 0; i < skillCount; i += 1) {
    const id = `sat_skill_${i}`;
    nodes.push({
      id,
      title: `Skill · s${i}`,
      prompt: "",
      type: "config" as const,
      satelliteKind: "skill" as const,
      configRef: { skillId: `skill_${i}` },
      position: { x: 120 + i * 40, y: 220 },
    });
    edges.push({
      id: `e_skill_${i}`,
      source: id,
      target: "agent_1",
      kind: "provides" as const,
      configPort: "skill" as const,
    });
  }
  return IntentGraphSchema.parse({
    revision: 1,
    graphPrompt: "",
    nodes,
    edges,
  });
}

describe("loop-wiring-list", () => {
  it("sizes list cards from member count with a visible-row cap", () => {
    const four = estimateWiringListCardSize(4);
    const ten = estimateWiringListCardSize(10);
    expect(four.width).toBeGreaterThanOrEqual(140);
    expect(four.height).toBeGreaterThan(40);
    expect(ten.height).toBeGreaterThan(four.height);
    // Cap visible rows — 10 and 6+extra-more-line stay bounded.
    const capped = estimateWiringListCardSize(
      LOOP_WIRING_LIST_CARD_MAX_VISIBLE_ROWS + 20,
    );
    expect(capped.height).toBe(ten.height);
  });

  it("reports connected skill asset ids from individuals and lists", () => {
    const draft = agentDraft(2);
    expect(connectedWiringAssetIds("agent_1", "skill", draft)).toEqual([
      "skill_0",
      "skill_1",
    ]);
    const collapsed = normalizeWiringLists(
      agentDraft(LOOP_WIRING_LIST_THRESHOLD + 1),
      nextId,
    ).draft;
    const ids = connectedWiringAssetIds("agent_1", "skill", collapsed);
    expect(ids).toHaveLength(LOOP_WIRING_LIST_THRESHOLD + 1);
    expect(ids[0]).toBe("skill_0");
  });

  it("keeps individuals at the threshold", () => {
    const draft = agentDraft(LOOP_WIRING_LIST_THRESHOLD);
    const result = normalizeWiringLists(draft, nextId);
    expect(result.changed).toBe(false);
    expect(
      result.draft.nodes.filter((node) => node.satelliteKind === "skill"),
    ).toHaveLength(LOOP_WIRING_LIST_THRESHOLD);
    expect(
      result.draft.nodes.some((node) => node.satelliteKind === "skill_list"),
    ).toBe(false);
  });

  it("collapses past the threshold into one skill_list", () => {
    const draft = agentDraft(LOOP_WIRING_LIST_THRESHOLD + 1);
    const result = normalizeWiringLists(draft, nextId);
    expect(result.changed).toBe(true);
    const lists = result.draft.nodes.filter(
      (node) => node.satelliteKind === "skill_list",
    );
    expect(lists).toHaveLength(1);
    expect(wiringListMembersOf(lists[0]!)).toHaveLength(
      LOOP_WIRING_LIST_THRESHOLD + 1,
    );
    expect(
      result.draft.nodes.filter((node) => node.satelliteKind === "skill"),
    ).toHaveLength(0);
    const agent = result.draft.nodes.find((node) => node.id === "agent_1")!;
    const resolved = resolveAgentWiring(agent, result.draft);
    expect(resolved.skillIds).toHaveLength(LOOP_WIRING_LIST_THRESHOLD + 1);
  });

  it("expands back when members drop to the threshold", () => {
    const collapsed = normalizeWiringLists(
      agentDraft(LOOP_WIRING_LIST_THRESHOLD + 1),
      nextId,
    ).draft;
    const list = collapsed.nodes.find(
      (node) => node.satelliteKind === "skill_list",
    )!;
    const memberId = wiringListMembersOf(list)[0]!.id;
    const removed = removeWiringListMember(collapsed, list.id, memberId)!;
    const expanded = normalizeWiringLists(removed, nextId);
    expect(expanded.changed).toBe(true);
    expect(
      expanded.draft.nodes.some((node) => node.satelliteKind === "skill_list"),
    ).toBe(false);
    expect(
      expanded.draft.nodes.filter((node) => node.satelliteKind === "skill"),
    ).toHaveLength(LOOP_WIRING_LIST_THRESHOLD);
  });

  it("deletes an empty list instead of leaving a placeholder", () => {
    const collapsed = normalizeWiringLists(agentDraft(4), nextId).draft;
    const list = collapsed.nodes.find(
      (node) => node.satelliteKind === "skill_list",
    )!;
    const emptied = {
      ...collapsed,
      revision: collapsed.revision + 1,
      nodes: collapsed.nodes.map((node) =>
        node.id === list.id
          ? {
              ...node,
              title: "Skills ×0",
              configRef: { wiringListMembers: [] },
            }
          : node,
      ),
    };
    const result = normalizeWiringLists(emptied, nextId);
    expect(
      result.draft.nodes.some(
        (node) =>
          node.satelliteKind === "skill" || node.satelliteKind === "skill_list",
      ),
    ).toBe(false);
  });

  it("collapses MCP independently of Skills", () => {
    seq = 0;
    const draft = IntentGraphSchema.parse({
      revision: 1,
      graphPrompt: "",
      nodes: [
        {
          id: "agent_1",
          title: "Coder",
          prompt: "Ship",
          type: "agent",
          position: { x: 0, y: 0 },
        },
        ...[0, 1, 2, 3].map((i) => ({
          id: `mcp_${i}`,
          title: `MCP · m${i}`,
          prompt: "",
          type: "config" as const,
          satelliteKind: "mcp" as const,
          configRef: { mcpServerId: `mcp_${i}` },
          position: { x: i * 40, y: 120 },
        })),
        ...[0, 1].map((i) => ({
          id: `skill_${i}`,
          title: `Skill · s${i}`,
          prompt: "",
          type: "config" as const,
          satelliteKind: "skill" as const,
          configRef: { skillId: `skill_${i}` },
          position: { x: 200 + i * 40, y: 120 },
        })),
      ],
      edges: [
        ...[0, 1, 2, 3].map((i) => ({
          id: `e_mcp_${i}`,
          source: `mcp_${i}`,
          target: "agent_1",
          kind: "provides" as const,
          configPort: "mcp" as const,
        })),
        ...[0, 1].map((i) => ({
          id: `e_skill_${i}`,
          source: `skill_${i}`,
          target: "agent_1",
          kind: "provides" as const,
          configPort: "skill" as const,
        })),
      ],
    });
    const result = normalizeWiringLists(draft, nextId);
    expect(
      result.draft.nodes.some((node) => node.satelliteKind === "mcp_list"),
    ).toBe(true);
    expect(
      result.draft.nodes.filter((node) => node.satelliteKind === "skill"),
    ).toHaveLength(2);
    expect(
      result.draft.nodes.some((node) => node.satelliteKind === "skill_list"),
    ).toBe(false);
  });
});
