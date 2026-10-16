/**
 * Architecture graph lint (c4studio / Structurizr inspection style).
 * Findings are warnings for model quality — separate from Zod parse errors.
 */

import type {
  FunctionalEdge,
  FunctionalNode,
  ProjectGraph,
} from "../contracts/graph.js";

export type StructureGraphLintCode =
  | "orphan-node"
  | "missing-description"
  | "missing-technology"
  | "duplicate-relationship"
  | "parent-children-asymmetry"
  | "unlabeled-architecture-edge"
  | "component-without-files";

export interface StructureGraphLintFinding {
  code: StructureGraphLintCode;
  severity: "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
  path?: Array<string | number>;
}

export interface StructureGraphLintResult {
  findings: StructureGraphLintFinding[];
  ok: boolean;
}

function isArchitectureNode(node: FunctionalNode): boolean {
  return Boolean(node.level || node.elementType);
}

export function lintStructureGraph(graph: ProjectGraph): StructureGraphLintResult {
  const findings: StructureGraphLintFinding[] = [];
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const referenced = new Set<string>();

  for (const edge of graph.edges) {
    referenced.add(edge.source);
    referenced.add(edge.target);
  }
  for (const node of graph.nodes) {
    if (node.parentId) referenced.add(node.parentId);
    for (const childId of node.children ?? []) referenced.add(childId);
  }

  for (const node of graph.nodes) {
    if (!isArchitectureNode(node)) continue;

    const hasNeighbor =
      referenced.has(node.id) ||
      Boolean(node.parentId) ||
      (node.children?.length ?? 0) > 0 ||
      node.upstream.length > 0 ||
      node.downstream.length > 0;
    if (!hasNeighbor && graph.nodes.length > 1) {
      findings.push({
        code: "orphan-node",
        severity: "warning",
        message: `Orphaned architecture node '${node.id}' has no relationships`,
        nodeId: node.id,
        path: ["nodes", node.id],
      });
    }

    if (!node.description?.trim() && !node.summary?.trim()) {
      findings.push({
        code: "missing-description",
        severity: "warning",
        message: `Node '${node.id}' is missing a description`,
        nodeId: node.id,
        path: ["nodes", node.id, "description"],
      });
    }

    if (
      (node.level === "container" || node.level === "component") &&
      !node.technology?.trim()
    ) {
      findings.push({
        code: "missing-technology",
        severity: "warning",
        message: `Node '${node.id}' is missing technology`,
        nodeId: node.id,
        path: ["nodes", node.id, "technology"],
      });
    }

    if (node.parentId) {
      const parent = nodesById.get(node.parentId);
      if (parent && !(parent.children ?? []).includes(node.id)) {
        findings.push({
          code: "parent-children-asymmetry",
          severity: "warning",
          message: `Parent '${node.parentId}' does not list child '${node.id}'`,
          nodeId: node.id,
          path: ["nodes", node.id, "parentId"],
        });
      }
    }
    for (const childId of node.children ?? []) {
      const child = nodesById.get(childId);
      if (child && child.parentId !== node.id) {
        findings.push({
          code: "parent-children-asymmetry",
          severity: "warning",
          message: `Child '${childId}' does not reference parent '${node.id}'`,
          nodeId: node.id,
          path: ["nodes", node.id, "children"],
        });
      }
    }

    if (
      node.level === "component" &&
      node.linkedFiles.length === 0 &&
      !graph.fileIndex.some((file) => file.nodeIds.includes(node.id))
    ) {
      findings.push({
        code: "component-without-files",
        severity: "warning",
        message: `Component '${node.id}' has no linked files`,
        nodeId: node.id,
        path: ["nodes", node.id, "linkedFiles"],
      });
    }
  }

  const relationKeys = new Map<string, FunctionalEdge>();
  for (const edge of graph.edges) {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    const touchesArchitecture =
      (sourceNode ? isArchitectureNode(sourceNode) : false) ||
      (targetNode ? isArchitectureNode(targetNode) : false);
    if (touchesArchitecture && !edge.label?.trim()) {
      findings.push({
        code: "unlabeled-architecture-edge",
        severity: "warning",
        message: `Architecture edge '${edge.id}' is missing a label`,
        edgeId: edge.id,
        path: ["edges", edge.id, "label"],
      });
    }
    const key = `${edge.source}\u0000${edge.target}\u0000${edge.relation}\u0000${edge.label ?? ""}`;
    const prior = relationKeys.get(key);
    if (prior) {
      findings.push({
        code: "duplicate-relationship",
        severity: "warning",
        message: `Duplicate relationship '${edge.id}' matches '${prior.id}'`,
        edgeId: edge.id,
        path: ["edges", edge.id],
      });
    } else {
      relationKeys.set(key, edge);
    }
  }

  return { findings, ok: findings.length === 0 };
}
