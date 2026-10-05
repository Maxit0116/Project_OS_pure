import { describe, expect, it } from "vitest";

import type { GreenfieldProductGraphProposal, ProjectGraph } from "../contracts/index.js";
import {
  GREENFIELD_TRANCHE_MAX_FILES,
  GREENFIELD_TRANCHE_MAX_NODES,
  createGreenfieldInitializationPlan,
  type GreenfieldInitializationIdFactory,
} from "./greenfield-initialization-planner.js";

const contextHash = `sha256:${"a".repeat(64)}`;
const ids: GreenfieldInitializationIdFactory = {
  planId: () => "server_plan",
  nodeId: (ref) => `server_node_${ref}`,
  edgeId: (ref) => `server_edge_${ref}`,
  fileTaskId: (ref) => `server_file_${ref}`,
  trancheId: (order) => `server_tranche_${order}`,
};

describe("greenfield initialization planner", () => {
  it("assigns durable IDs and derives deterministic bounded checkpoint tranches", async () => {
    const proposal = makeProposal();
    const plan = await createGreenfieldInitializationPlan({
      graph: makeEmptyGraph(), contextHash, proposal, idFactory: ids,
    });

    expect(plan.planId).toBe("server_plan");
    expect(plan.nodes).toHaveLength(13);
    expect(plan.nodes.every((node) => node.nodeId === `server_node_${node.tempRef}`)).toBe(true);
    expect(plan.wiring[0]).toMatchObject({
      edgeId: "server_edge_cross_feature_flow",
      sourceNodeId: "server_node_component_1_1",
      targetNodeId: "server_node_component_3_3",
    });
    expect(plan.tranches.length).toBeGreaterThan(1);
    expect(plan.tranches.every((tranche) => tranche.nodeIds.length <= GREENFIELD_TRANCHE_MAX_NODES)).toBe(true);
    expect(plan.tranches.every((tranche) => tranche.fileTaskIds.length <= GREENFIELD_TRANCHE_MAX_FILES)).toBe(true);
    expect(plan.tranches.map((tranche) => tranche.dependsOnTrancheId)).toEqual([
      null,
      ...plan.tranches.slice(0, -1).map((tranche) => tranche.trancheId),
    ]);
    expect(plan.tranches.flatMap((tranche) => tranche.nodeIds)).toEqual(
      plan.nodes.map((node) => node.nodeId),
    );
    expect(plan.tranches.at(-1)?.edgeIds).toEqual(["server_edge_cross_feature_flow"]);
  });

  it("derives the same schedule regardless of model array order", async () => {
    const proposal = makeProposal();
    const reordered = {
      ...proposal,
      nodes: proposal.nodes.slice().reverse(),
      wiring: proposal.wiring.slice().reverse(),
    };
    const [first, second] = await Promise.all([
      createGreenfieldInitializationPlan({ graph: makeEmptyGraph(), contextHash, proposal, idFactory: ids }),
      createGreenfieldInitializationPlan({ graph: makeEmptyGraph(), contextHash, proposal: reordered, idFactory: ids }),
    ]);
    expect(second.nodes).toEqual(first.nodes);
    expect(second.wiring).toEqual(first.wiring);
    expect(second.tranches).toEqual(first.tranches);
  });

  it("fails closed for non-empty graphs, illegal hierarchy, unsafe paths, and technical evidence", async () => {
    const nonEmpty = makeEmptyGraph();
    nonEmpty.fileIndex.push({ path: "existing.ts", type: "lib", nodeIds: [], imports: [], exports: [] });
    await expect(createGreenfieldInitializationPlan({
      graph: nonEmpty, contextHash, proposal: makeProposal(), idFactory: ids,
    })).rejects.toMatchObject({ code: "proposal_validation_failed" });

    const illegal = makeProposal();
    illegal.nodes.find((node) => node.tempRef === "container_1")!.parentTempRef = "component_1_1";
    await expect(createGreenfieldInitializationPlan({
      graph: makeEmptyGraph(), contextHash, proposal: illegal, idFactory: ids,
    })).rejects.toMatchObject({ code: "proposal_validation_failed" });

    const unsafe = makeProposal();
    unsafe.nodes.find((node) => node.node.level === "component")!.files[0]!.filePath = ".projectos/escape.ts";
    await expect(createGreenfieldInitializationPlan({
      graph: makeEmptyGraph(), contextHash, proposal: unsafe, idFactory: ids,
    })).rejects.toMatchObject({ code: "proposal_validation_failed" });

    const withEvidence = {
      ...makeProposal(),
      wiring: [{ ...makeProposal().wiring[0], evidence: "model assertion" }],
    };
    await expect(createGreenfieldInitializationPlan({
      graph: makeEmptyGraph(), contextHash, proposal: withEvidence, idFactory: ids,
    })).rejects.toMatchObject({ code: "proposal_validation_failed" });

    await expect(createGreenfieldInitializationPlan({
      graph: makeEmptyGraph(), contextHash, proposal: makeProposal(11), idFactory: ids,
    })).rejects.toMatchObject({ code: "proposal_validation_failed" });
  });

  it("rejects colliding server IDs instead of accepting model-shaped authority", async () => {
    await expect(createGreenfieldInitializationPlan({
      graph: makeEmptyGraph(),
      contextHash,
      proposal: makeProposal(),
      idFactory: { ...ids, nodeId: () => "collision" },
    })).rejects.toMatchObject({ code: "proposal_validation_failed" });
  });
});

function makeProposal(containerCount = 3): GreenfieldProductGraphProposal {
  const nodes: GreenfieldProductGraphProposal["nodes"] = [{
    tempRef: "context_product",
    parentTempRef: null,
    node: {
      name: "Product",
      summary: "The product boundary",
      responsibility: "Own the complete product experience",
      level: "context",
      tags: ["product"],
    },
    files: [],
  }];
  for (let container = 1; container <= containerCount; container += 1) {
    nodes.push({
      tempRef: `container_${container}`,
      parentTempRef: "context_product",
      node: {
        name: `Container ${container}`,
        summary: `Product container ${container}`,
        responsibility: `Own product area ${container}`,
        level: "container",
        tags: [],
      },
      files: [],
    });
    for (let component = 1; component <= 3; component += 1) {
      const ref = `component_${container}_${component}`;
      nodes.push({
        tempRef: ref,
        parentTempRef: `container_${container}`,
        node: {
          name: `Component ${container}.${component}`,
          summary: `Product component ${container}.${component}`,
          responsibility: `Implement capability ${container}.${component}`,
          level: "component",
          tags: [],
        },
        files: [{
          filePath: `src/area-${container}/feature-${component}.ts`,
          responsibility: `Implement feature ${container}.${component}`,
          objective: `Create feature ${container}.${component}`,
          acceptanceCriteria: ["The feature exposes its product responsibility"],
        }],
      });
    }
  }
  return {
    version: "0.1.0",
    objective: "Initialize the product",
    nodes,
    wiring: [{
      tempRef: "cross_feature_flow",
      sourceTempRef: "component_1_1",
      targetTempRef: `component_${containerCount}_3`,
      relation: "data_flows_to",
      label: "Product flow",
      purpose: "Connect the entry capability to the final capability",
    }],
    rationale: "The product requires three bounded areas.",
  };
}

function makeEmptyGraph(): ProjectGraph {
  return {
    version: "0.3.0",
    projectId: "greenfield-project",
    projectName: "Greenfield",
    projectType: "nextjs-app",
    analyzedAt: "2026-07-19T00:00:00.000Z",
    analysisStatus: "complete",
    architecture: {
      notation: "c4",
      defaultLevel: "component",
      layers: [
        { id: "context", label: "Context", order: 0, description: "Product context" },
        { id: "container", label: "Container", order: 1, description: "Product containers" },
        { id: "component", label: "Component", order: 2, description: "Product components" },
      ],
    },
    nodes: [],
    edges: [],
    fileRelations: [],
    fileIndex: [],
    topology: { rootIds: [], maxDepth: 0, totalNodes: 0 },
  };
}
