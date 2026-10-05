import {
  SemanticTreeSchema,
  type SemanticTree,
  type SemanticTreeNode,
  type SemanticTreeNodeKind,
} from "../contracts/index.js";
import { ProjectOSError } from "../errors.js";

export interface AppendOwnedFileToSemanticTreeInput {
  projectId: string;
  ownerNodeId: string;
  path: string;
  entryId: string;
  generatedAt: string;
  kind: SemanticTreeNodeKind;
}

export interface RemoveOwnedFileFromSemanticTreeInput {
  projectId: string;
  ownerNodeIds: string[];
  path: string;
  generatedAt: string;
}

export interface AppendProductNodeToSemanticTreeInput {
  projectId: string;
  nodeId: string;
  label: string;
  entryId: string;
  generatedAt: string;
  files: Array<{
    path: string;
    entryId: string;
    kind: SemanticTreeNodeKind;
  }>;
}

export interface RemoveProductNodesFromSemanticTreeInput {
  projectId: string;
  nodeIds: string[];
  ownedFilePaths: string[];
  generatedAt: string;
}

export function appendProductNodeToSemanticTree(
  current: SemanticTree,
  input: AppendProductNodeToSemanticTreeInput,
): SemanticTree {
  const tree = structuredClone(SemanticTreeSchema.parse(current));
  if (tree.projectId !== input.projectId) {
    throw new ProjectOSError("diff_scope_violation", "Semantic tree belongs to another project");
  }
  const nodes = flattenTree(tree.roots);
  const newIds = [input.entryId, ...input.files.map((file) => file.entryId)];
  const newPaths = input.files.map((file) => file.path);
  if (
    new Set(newIds).size !== newIds.length ||
    new Set(newPaths).size !== newPaths.length ||
    nodes.some((node) => newIds.includes(node.id)) ||
    nodes.some((node) => node.sourceNodeId === input.nodeId) ||
    nodes.some((node) => node.path && newPaths.includes(node.path))
  ) {
    throw new ProjectOSError(
      "diff_scope_violation",
      "Product node semantic-tree identities or file paths already exist",
    );
  }
  tree.roots.push({
    id: input.entryId,
    label: input.label,
    kind: "feature",
    sourceNodeId: input.nodeId,
    status: "active",
    children: input.files.map((file) => ({
      id: file.entryId,
      label: file.path,
      kind: file.kind,
      path: file.path,
      sourceNodeId: input.nodeId,
      status: "normal",
      children: [],
    })),
  });
  tree.generatedAt = input.generatedAt;
  return SemanticTreeSchema.parse(tree);
}

export function appendOwnedFileToSemanticTree(
  current: SemanticTree,
  input: AppendOwnedFileToSemanticTreeInput,
): SemanticTree {
  const tree = structuredClone(SemanticTreeSchema.parse(current));
  if (tree.projectId !== input.projectId) {
    throw new ProjectOSError("diff_scope_violation", "Semantic tree belongs to another project");
  }
  const nodes = flattenTree(tree.roots);
  if (nodes.some((node) => node.id === input.entryId)) {
    throw new ProjectOSError("diff_scope_violation", "Semantic-tree entry id already exists");
  }
  if (nodes.some((node) => node.path === input.path)) {
    throw new ProjectOSError("diff_scope_violation", "Semantic-tree file path already exists");
  }
  const owners = nodes.filter(
    (node) =>
      node.kind === "feature" &&
      !node.path &&
      node.sourceNodeId === input.ownerNodeId,
  );
  if (owners.length !== 1) {
    throw new ProjectOSError(
      "diff_scope_violation",
      `Semantic tree must contain exactly one component owner for '${input.ownerNodeId}'`,
    );
  }
  owners[0]!.children.push({
    id: input.entryId,
    label: input.path,
    kind: input.kind,
    path: input.path,
    sourceNodeId: input.ownerNodeId,
    status: "normal",
    children: [],
  });
  tree.generatedAt = input.generatedAt;
  return SemanticTreeSchema.parse(tree);
}

export function removeOwnedFileFromSemanticTree(
  current: SemanticTree,
  input: RemoveOwnedFileFromSemanticTreeInput,
): SemanticTree {
  const tree = structuredClone(SemanticTreeSchema.parse(current));
  if (tree.projectId !== input.projectId) {
    throw new ProjectOSError("diff_scope_violation", "Semantic tree belongs to another project");
  }
  if (input.ownerNodeIds.length === 0 ||
      new Set(input.ownerNodeIds).size !== input.ownerNodeIds.length) {
    throw new ProjectOSError(
      "diff_scope_violation",
      "Semantic-tree removal requires unique declared owners",
    );
  }
  const ownerIds = new Set(input.ownerNodeIds);
  const matches = flattenTree(tree.roots).filter((node) => node.path === input.path);
  if (matches.length === 0) {
    throw new ProjectOSError("diff_scope_violation", "Semantic-tree file path does not exist");
  }
  if (matches.some((node) => !node.sourceNodeId || !ownerIds.has(node.sourceNodeId))) {
    throw new ProjectOSError(
      "diff_scope_violation",
      "Semantic-tree file ownership does not match the declared owners",
    );
  }
  const remove = (nodes: SemanticTreeNode[]): SemanticTreeNode[] => nodes
    .filter((node) => node.path !== input.path)
    .map((node) => ({ ...node, children: remove(node.children) }));
  tree.roots = remove(tree.roots);
  tree.generatedAt = input.generatedAt;
  return SemanticTreeSchema.parse(tree);
}

export function removeProductNodesFromSemanticTree(
  current: SemanticTree,
  input: RemoveProductNodesFromSemanticTreeInput,
): SemanticTree {
  const tree = structuredClone(SemanticTreeSchema.parse(current));
  if (tree.projectId !== input.projectId) {
    throw new ProjectOSError("diff_scope_violation", "Semantic tree belongs to another project");
  }
  if (
    input.nodeIds.length === 0 ||
    new Set(input.nodeIds).size !== input.nodeIds.length ||
    new Set(input.ownedFilePaths).size !== input.ownedFilePaths.length
  ) {
    throw new ProjectOSError(
      "diff_scope_violation",
      "Semantic-tree node deletion requires unique server-derived membership",
    );
  }
  const nodeIds = new Set(input.nodeIds);
  const ownedPaths = new Set(input.ownedFilePaths);
  const existing = flattenTree(tree.roots);
  const referencedPaths = new Set(existing
    .filter((node) => node.sourceNodeId && nodeIds.has(node.sourceNodeId) && node.path)
    .map((node) => node.path!));
  if (
    [...ownedPaths].some((path) => !referencedPaths.has(path)) ||
    [...referencedPaths].some((path) => !ownedPaths.has(path)) ||
    [...ownedPaths].some((path) =>
      existing.some((node) => node.path === path && (!node.sourceNodeId || !nodeIds.has(node.sourceNodeId))))
  ) {
    throw new ProjectOSError(
      "diff_scope_violation",
      "Semantic-tree node/file membership changed before deletion",
    );
  }
  const remove = (nodes: SemanticTreeNode[]): SemanticTreeNode[] => nodes.flatMap((node) => {
    const survivingChildren = remove(node.children);
    if (node.sourceNodeId && nodeIds.has(node.sourceNodeId)) {
      return survivingChildren;
    }
    return [{ ...node, children: survivingChildren }];
  });
  tree.roots = remove(tree.roots);
  if (flattenTree(tree.roots).some((node) =>
    node.sourceNodeId && nodeIds.has(node.sourceNodeId) || node.path && ownedPaths.has(node.path))) {
    throw new ProjectOSError("diff_scope_violation", "Semantic-tree deletion left dangling membership");
  }
  tree.generatedAt = input.generatedAt;
  return SemanticTreeSchema.parse(tree);
}

function flattenTree(roots: SemanticTreeNode[]): SemanticTreeNode[] {
  const result: SemanticTreeNode[] = [];
  const visit = (node: SemanticTreeNode) => {
    result.push(node);
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return result;
}
