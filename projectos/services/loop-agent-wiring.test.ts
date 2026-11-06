import { describe, expect, it } from "vitest";

import { IntentGraphSchema } from "../contracts/loop-graph.js";
import {
  collectOrphanConfigNodeIds,
  expandWiringFromDefinition,
  resolveAgentWiring,
  validateAgentWiringGraph,
} from "./loop-agent-wiring.js";

function draftWithWiring() {
  return IntentGraphSchema.parse({
    revision: 1,
    graphPrompt: "Ship feature",
    nodes: [
      {
        id: "agent_1",
        title: "Coder",
        prompt: "Implement the feature",
        type: "agent",
        agentRole: "coder",
        position: { x: 200, y: 100 },
      },
      {
        id: "sat_model",
        title: "Model · sonnet",
        prompt: "",
        type: "config",
        satelliteKind: "model",
        configRef: { modelProfileId: "model_sonnet" },
        position: { x: 100, y: 220 },
      },
      {
        id: "sat_skill",
        title: "Skill · review",
        prompt: "",
        type: "config",
        satelliteKind: "skill",
        configRef: { skillId: "skill_review" },
        position: { x: 220, y: 220 },
      },
      {
        id: "sat_mcp",
        title: "MCP · github",
        prompt: "",
        type: "config",
        satelliteKind: "mcp",
        configRef: { mcpServerId: "mcp_github" },
        position: { x: 340, y: 220 },
      },
    ],
    edges: [
      {
        id: "p1",
        source: "sat_model",
        target: "agent_1",
        kind: "provides",
        configPort: "model",
      },
      {
        id: "p2",
        source: "sat_skill",
        target: "agent_1",
        kind: "provides",
        configPort: "capability",
      },
      {
        id: "p3",
        source: "sat_mcp",
        target: "agent_1",
        kind: "provides",
        configPort: "capability",
      },
    ],
  });
}

describe("loop-agent-wiring", () => {
  it("validates a well-formed provides graph", () => {
    expect(validateAgentWiringGraph(draftWithWiring())).toEqual([]);
  });

  it("rejects provides into a non-agent target", () => {
    const draft = draftWithWiring();
    draft.nodes.push({
      id: "action_1",
      title: "Test",
      prompt: "Run tests",
      type: "action",
      actionIntegration: "test",
      position: { x: 400, y: 100 },
    });
    draft.edges.push({
      id: "bad",
      source: "sat_skill",
      target: "action_1",
      kind: "provides",
      configPort: "capability",
    });
    const issues = validateAgentWiringGraph(draft);
    expect(issues.some((issue) => issue.path === "edges.bad")).toBe(true);
  });

  it("rejects a second Model* provides edge", () => {
    const draft = draftWithWiring();
    draft.nodes.push({
      id: "sat_model_2",
      title: "Model · other",
      prompt: "",
      type: "config",
      satelliteKind: "model",
      configRef: { modelProfileId: "model_other" },
      position: { x: 40, y: 220 },
    });
    draft.edges.push({
      id: "p_dup",
      source: "sat_model_2",
      target: "agent_1",
      kind: "provides",
      configPort: "model",
    });
    const issues = validateAgentWiringGraph(draft);
    expect(
      issues.some((issue) => issue.path === "nodes.agent_1.ports.model"),
    ).toBe(true);
  });

  it("folds edges and applies override priority", () => {
    const draft = draftWithWiring();
    const agent = draft.nodes.find((node) => node.id === "agent_1")!;
    const fromEdges = resolveAgentWiring(agent, draft, {
      modelProfileId: "model_base",
      skillIds: ["skill_base"],
      mcpServerIds: [],
    });
    expect(fromEdges.modelProfileId).toBe("model_sonnet");
    expect(fromEdges.skillIds).toEqual(
      expect.arrayContaining(["skill_base", "skill_review"]),
    );
    expect(fromEdges.mcpServerIds).toEqual(["mcp_github"]);
    expect(fromEdges.sources.model).toBe("edge");

    const overridden = resolveAgentWiring(
      {
        ...agent,
        agentWiringOverride: {
          modelProfileId: "model_override",
          skillIds: ["skill_only"],
        },
      },
      draft,
      { modelProfileId: "model_base", skillIds: ["skill_base"] },
    );
    expect(overridden.modelProfileId).toBe("model_override");
    expect(overridden.skillIds).toEqual(["skill_only"]);
    expect(overridden.sources.model).toBe("override");
  });

  it("expands definition into satellites and provides edges", () => {
    let n = 0;
    const existing = IntentGraphSchema.parse({
      revision: 0,
      graphPrompt: "",
      nodes: [
        {
          id: "agent_1",
          title: "Coder",
          prompt: "Implement",
          type: "agent",
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    const expanded = expandWiringFromDefinition({
      agentNodeId: "agent_1",
      agentPosition: { x: 0, y: 0 },
      base: {
        modelProfileId: "model_a",
        skillIds: ["skill_a"],
        mcpServerIds: ["mcp_a"],
        memoryMode: "project",
      },
      existing,
      newId: () => `gen_${n++}`,
    });
    expect(expanded.nodes).toHaveLength(4);
    expect(expanded.edges.every((edge) => edge.kind === "provides")).toBe(true);
  });

  it("collects orphan satellites when an agent is removed", () => {
    const draft = draftWithWiring();
    const orphans = collectOrphanConfigNodeIds(draft, "agent_1");
    expect(orphans.sort()).toEqual(["sat_mcp", "sat_model", "sat_skill"]);
  });
});
