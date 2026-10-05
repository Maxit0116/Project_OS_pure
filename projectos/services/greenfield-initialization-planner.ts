import {
  GreenfieldInitializationPlanSchema,
  GreenfieldProductGraphProposalSchema,
  ProjectGraphSchema,
  type GreenfieldInitializationPlan,
  type GreenfieldProductGraphProposal,
  type ProjectGraph,
} from "../contracts/index.js";
import { ProjectOSError } from "../errors.js";
import { computeProjectGraphHash } from "./graph-change-set-engine.js";

export const GREENFIELD_TRANCHE_MAX_NODES = 8;
export const GREENFIELD_TRANCHE_MAX_FILES = 8;

export interface GreenfieldInitializationIdFactory {
  planId(): string;
  nodeId(tempRef: string): string;
  edgeId(tempRef: string): string;
  fileTaskId(nodeTempRef: string, filePath: string): string;
  trancheId(order: number): string;
}

export interface CreateGreenfieldInitializationPlanInput {
  graph: ProjectGraph;
  contextHash: string;
  proposal: unknown;
  idFactory?: GreenfieldInitializationIdFactory;
}

export async function createGreenfieldInitializationPlan(
  input: CreateGreenfieldInitializationPlanInput,
): Promise<GreenfieldInitializationPlan> {
  const graphResult = ProjectGraphSchema.safeParse(input.graph);
  const proposalResult = GreenfieldProductGraphProposalSchema.safeParse(input.proposal);
  if (!graphResult.success || !proposalResult.success) {
    throw invalidPlan("Greenfield initialization requires a valid graph and typed product proposal");
  }
  const graph = graphResult.data;
  const proposal = proposalResult.data;
  if (
    graph.nodes.length > 0 ||
    graph.edges.length > 0 ||
    graph.fileIndex.length > 0 ||
    (graph.fileRelations?.length ?? 0) > 0
  ) {
    throw invalidPlan("Greenfield initialization is available only for an empty project graph");
  }

  const orderedNodes = validateAndOrderProposal(proposal);
  const factory = input.idFactory ?? cryptoIdFactory();
  const nodeIdByTempRef = new Map(orderedNodes.map((entry) => [
    entry.tempRef,
    factory.nodeId(entry.tempRef),
  ]));
  const edgeIdByTempRef = new Map(proposal.wiring.map((edge) => [
    edge.tempRef,
    factory.edgeId(edge.tempRef),
  ]));
  assertServerIds([...nodeIdByTempRef.values()], graph.nodes.map((node) => node.id), "node");
  assertServerIds([...edgeIdByTempRef.values()], graph.edges.map((edge) => edge.id), "edge");

  const nodes: GreenfieldInitializationPlan["nodes"] = orderedNodes.map((entry) => ({
    tempRef: entry.tempRef,
    nodeId: nodeIdByTempRef.get(entry.tempRef)!,
    parentNodeId: entry.parentTempRef ? nodeIdByTempRef.get(entry.parentTempRef)! : null,
    node: entry.node,
    files: entry.files.map((file) => ({
      ...file,
      taskId: factory.fileTaskId(entry.tempRef, file.filePath),
    })),
  }));
  const wiring: GreenfieldInitializationPlan["wiring"] = proposal.wiring
    .slice()
    .sort((left, right) => left.tempRef.localeCompare(right.tempRef))
    .map((edge) => ({
      tempRef: edge.tempRef,
      edgeId: edgeIdByTempRef.get(edge.tempRef)!,
      sourceNodeId: nodeIdByTempRef.get(edge.sourceTempRef)!,
      targetNodeId: nodeIdByTempRef.get(edge.targetTempRef)!,
      relation: edge.relation,
      label: edge.label,
      ...(edge.purpose ? { purpose: edge.purpose } : {}),
    }));
  const tranches = deriveTranches(nodes, wiring, factory);

  const candidate = {
    version: "0.1.0" as const,
    planId: factory.planId(),
    projectId: graph.projectId,
    contextHash: input.contextHash,
    initialBaseGraphHash: await computeProjectGraphHash(graph),
    objective: proposal.objective,
    nodes,
    wiring,
    tranches,
    rationale: proposal.rationale,
  };
  const result = GreenfieldInitializationPlanSchema.safeParse(candidate);
  if (!result.success) {
    throw invalidPlan("Server-derived greenfield plan failed its retained-plan invariants");
  }
  return result.data;
}

function validateAndOrderProposal(
  proposal: GreenfieldProductGraphProposal,
): GreenfieldProductGraphProposal["nodes"] {
  const nodesByRef = new Map<string, GreenfieldProductGraphProposal["nodes"][number]>();
  const filePaths = new Set<string>();
  for (const entry of proposal.nodes) {
    if (nodesByRef.has(entry.tempRef)) throw invalidPlan("Greenfield node temporary references must be unique");
    nodesByRef.set(entry.tempRef, entry);
    if (entry.node.level !== "component" && entry.files.length > 0) {
      throw invalidPlan("Only component nodes may own greenfield scaffold files");
    }
    if (entry.node.level === "component" && entry.files.length === 0) {
      throw invalidPlan("Every greenfield component requires at least one scaffold responsibility");
    }
    for (const file of entry.files) {
      if (filePaths.has(file.filePath)) throw invalidPlan("Greenfield scaffold paths must be unique");
      filePaths.add(file.filePath);
    }
  }
  if (filePaths.size > 32) throw invalidPlan("Greenfield initialization exceeds the 32-leaf cap");

  const childrenByRef = new Map<string, string[]>();
  const legalParentLevel = { context: null, container: "context", component: "container" } as const;
  for (const entry of proposal.nodes) {
    const expectedParentLevel = legalParentLevel[entry.node.level];
    if (expectedParentLevel === null) {
      if (entry.parentTempRef !== null) throw invalidPlan("Context nodes must be greenfield roots");
    } else {
      if (!entry.parentTempRef) throw invalidPlan(`${entry.node.level} nodes require a parent`);
      const parent = nodesByRef.get(entry.parentTempRef);
      if (!parent || parent.node.level !== expectedParentLevel) {
        throw invalidPlan(`Illegal greenfield ${entry.node.level} parent`);
      }
      const children = childrenByRef.get(entry.parentTempRef) ?? [];
      children.push(entry.tempRef);
      childrenByRef.set(entry.parentTempRef, children);
    }
  }
  for (const entry of proposal.nodes) {
    const children = childrenByRef.get(entry.tempRef) ?? [];
    if (entry.node.level !== "component" && children.length === 0) {
      throw invalidPlan("Every greenfield context and container must lead to a component");
    }
    if (entry.node.level === "component" && children.length > 0) {
      throw invalidPlan("Greenfield components must be hierarchy leaves");
    }
  }

  const edgeKeys = new Set<string>();
  const edgeRefs = new Set<string>();
  for (const edge of proposal.wiring) {
    if (edgeRefs.has(edge.tempRef)) throw invalidPlan("Greenfield edge temporary references must be unique");
    edgeRefs.add(edge.tempRef);
    if (!nodesByRef.has(edge.sourceTempRef) || !nodesByRef.has(edge.targetTempRef)) {
      throw invalidPlan("Greenfield wiring contains an unknown node reference");
    }
    if (edge.sourceTempRef === edge.targetTempRef) throw invalidPlan("Greenfield wiring cannot self-reference");
    const key = `${edge.sourceTempRef}\0${edge.targetTempRef}\0${edge.relation}`;
    if (edgeKeys.has(key)) throw invalidPlan("Greenfield wiring contains a duplicate functional edge");
    edgeKeys.add(key);
  }

  const ordered: GreenfieldProductGraphProposal["nodes"] = [];
  const visit = (entry: GreenfieldProductGraphProposal["nodes"][number]): void => {
    ordered.push(entry);
    for (const childRef of (childrenByRef.get(entry.tempRef) ?? []).slice().sort()) {
      visit(nodesByRef.get(childRef)!);
    }
  };
  for (const root of proposal.nodes.filter((entry) => entry.parentTempRef === null).sort((a, b) => a.tempRef.localeCompare(b.tempRef))) {
    visit(root);
  }
  if (ordered.length !== proposal.nodes.length) throw invalidPlan("Greenfield hierarchy is disconnected or cyclic");
  return ordered;
}

function deriveTranches(
  nodes: GreenfieldInitializationPlan["nodes"],
  wiring: GreenfieldInitializationPlan["wiring"],
  factory: GreenfieldInitializationIdFactory,
): GreenfieldInitializationPlan["tranches"] {
  const groups: Array<{ nodeIds: string[]; edgeIds: string[]; fileTaskIds: string[] }> = [];
  for (const node of nodes) {
    const fileTaskIds = node.files.map((file) => file.taskId);
    let group = groups.at(-1);
    if (!group || group.nodeIds.length >= GREENFIELD_TRANCHE_MAX_NODES || group.fileTaskIds.length + fileTaskIds.length > GREENFIELD_TRANCHE_MAX_FILES) {
      group = { nodeIds: [], edgeIds: [], fileTaskIds: [] };
      groups.push(group);
    }
    group.nodeIds.push(node.nodeId);
    group.fileTaskIds.push(...fileTaskIds);
  }
  const groupIndexByNodeId = new Map(groups.flatMap((group, index) =>
    group.nodeIds.map((nodeId) => [nodeId, index] as const)));
  for (const edge of wiring) {
    const groupIndex = Math.max(
      groupIndexByNodeId.get(edge.sourceNodeId)!,
      groupIndexByNodeId.get(edge.targetNodeId)!,
    );
    groups[groupIndex]!.edgeIds.push(edge.edgeId);
  }
  const trancheIds = groups.map((_, index) => factory.trancheId(index + 1));
  assertServerIds(trancheIds, [], "tranche");
  return groups.map((group, index) => ({
    trancheId: trancheIds[index]!,
    order: index + 1,
    dependsOnTrancheId: index === 0 ? null : trancheIds[index - 1]!,
    ...group,
  }));
}

function assertServerIds(ids: string[], occupied: string[], kind: string): void {
  const occupiedIds = new Set(occupied);
  if (ids.some((id) => !id || occupiedIds.has(id)) || new Set(ids).size !== ids.length) {
    throw invalidPlan(`Server-generated ${kind} IDs must be non-empty, unique, and unoccupied`);
  }
}

function cryptoIdFactory(): GreenfieldInitializationIdFactory {
  return {
    planId: () => `greenfield_${globalThis.crypto.randomUUID()}`,
    nodeId: () => `node_${globalThis.crypto.randomUUID()}`,
    edgeId: () => `edge_${globalThis.crypto.randomUUID()}`,
    fileTaskId: () => `file_${globalThis.crypto.randomUUID()}`,
    trancheId: (order) => `tranche_${order}_${globalThis.crypto.randomUUID()}`,
  };
}

function invalidPlan(message: string): ProjectOSError {
  return new ProjectOSError("proposal_validation_failed", message);
}
