import { z } from "zod";

export const SemanticTreeVersionSchema = z.literal("0.1.0");

export const SemanticTreeNodeKindSchema = z.enum([
  "feature",
  "folder",
  "file",
  "route",
  "api",
  "config",
  "test",
  "error_group",
]);

export const SemanticTreeNodeStatusSchema = z.enum([
  "normal",
  "active",
  "in_progress",
  "error",
  "suggested",
]);

type SemanticTreeNodeShape = {
  id: string;
  label: string;
  kind: z.infer<typeof SemanticTreeNodeKindSchema>;
  path?: string | undefined;
  sourceNodeId?: string | undefined;
  status: z.infer<typeof SemanticTreeNodeStatusSchema>;
  children: SemanticTreeNodeShape[];
  badges?: string[] | undefined;
};

type SemanticTreeShape = {
  version: "0.1.0";
  projectId: string;
  generatedAt: string;
  roots: SemanticTreeNodeShape[];
};

export const SEMANTIC_TREE_LIMITS = {
  depth: 64,
  nodes: 65_536,
  roots: 4_096,
  childrenPerNode: 4_096,
} as const;

type PendingSemanticTreeNode = {
  value: unknown;
  depth: number;
  path: Array<string | number>;
};

function preflightSemanticTreeNodes(
  roots: unknown,
  rootPath: Array<string | number>,
  ctx: z.RefinementCtx,
): void {
  if (!Array.isArray(roots)) return;
  if (roots.length > SEMANTIC_TREE_LIMITS.roots) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_big,
      type: "array",
      maximum: SEMANTIC_TREE_LIMITS.roots,
      inclusive: true,
      exact: false,
      fatal: true,
      path: rootPath,
      message: `Semantic tree may contain at most ${SEMANTIC_TREE_LIMITS.roots} roots`,
    });
    return;
  }

  const pending: PendingSemanticTreeNode[] = roots.map((value, index) => ({
    value,
    depth: 1,
    path: [...rootPath, index],
  }));
  const ids = new Set<string>();
  let nodeCount = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    nodeCount += 1;
    if (nodeCount > SEMANTIC_TREE_LIMITS.nodes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        fatal: true,
        path: rootPath,
        message: `Semantic tree may contain at most ${SEMANTIC_TREE_LIMITS.nodes} nodes`,
      });
      return;
    }
    if (current.depth > SEMANTIC_TREE_LIMITS.depth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        fatal: true,
        path: current.path,
        message: `Semantic tree depth may not exceed ${SEMANTIC_TREE_LIMITS.depth}`,
      });
      return;
    }
    if (!current.value || typeof current.value !== "object") continue;
    const node = current.value as { id?: unknown; children?: unknown };
    if (typeof node.id === "string") {
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...current.path, "id"],
          message: `Semantic tree node ID '${node.id}' is duplicated`,
        });
      }
      ids.add(node.id);
    }
    if (!Array.isArray(node.children)) continue;
    if (node.children.length > SEMANTIC_TREE_LIMITS.childrenPerNode) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        type: "array",
        maximum: SEMANTIC_TREE_LIMITS.childrenPerNode,
        inclusive: true,
        exact: false,
        fatal: true,
        path: [...current.path, "children"],
        message: `Semantic tree nodes may contain at most ${SEMANTIC_TREE_LIMITS.childrenPerNode} children`,
      });
      return;
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push({
        value: node.children[index],
        depth: current.depth + 1,
        path: [...current.path, "children", index],
      });
    }
  }
}

let SemanticTreeNodeShapeSchema: z.ZodType<SemanticTreeNodeShape>;
SemanticTreeNodeShapeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string(),
    kind: SemanticTreeNodeKindSchema,
    path: z.string().optional(),
    sourceNodeId: z.string().optional(),
    status: SemanticTreeNodeStatusSchema,
    children: z
      .array(z.lazy(() => SemanticTreeNodeShapeSchema))
      .max(SEMANTIC_TREE_LIMITS.childrenPerNode),
    badges: z.array(z.string()).optional(),
  })
  .strict();

const SemanticTreeNodePreflightSchema = z.unknown().superRefine((value, ctx) => {
  preflightSemanticTreeNodes([value], [], ctx);
});

export const SemanticTreeNodeSchema = SemanticTreeNodePreflightSchema.pipe(
  SemanticTreeNodeShapeSchema,
) as z.ZodType<SemanticTreeNodeShape>;

const SemanticTreeShapeSchema: z.ZodType<SemanticTreeShape> = z
  .object({
    version: SemanticTreeVersionSchema,
    projectId: z.string(),
    generatedAt: z.string(),
    roots: z.array(SemanticTreeNodeShapeSchema).max(SEMANTIC_TREE_LIMITS.roots),
  })
  .strict();

const SemanticTreePreflightSchema = z.unknown().superRefine((value, ctx) => {
  if (!value || typeof value !== "object") return;
  preflightSemanticTreeNodes(
    (value as { roots?: unknown }).roots,
    ["roots"],
    ctx,
  );
});

export const SemanticTreeSchema = SemanticTreePreflightSchema.pipe(
  SemanticTreeShapeSchema,
) as z.ZodType<SemanticTreeShape>;

export type SemanticTreeVersion = z.infer<typeof SemanticTreeVersionSchema>;
export type SemanticTreeNodeKind = z.infer<typeof SemanticTreeNodeKindSchema>;
export type SemanticTreeNodeStatus = z.infer<
  typeof SemanticTreeNodeStatusSchema
>;
export type SemanticTreeNode = z.infer<typeof SemanticTreeNodeSchema>;
export type SemanticTree = z.infer<typeof SemanticTreeSchema>;
