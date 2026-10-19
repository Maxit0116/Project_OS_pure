import { z } from "zod";

export const AgentRunKindSchema = z.enum([
  "feature_change",
  "debug_fix",
  "demo",
  "custom",
]);

export const AgentRunStatusSchema = z.enum([
  "queued",
  "running",
  "awaiting_review",
  "complete",
  "error",
  "cancelled",
]);

export const AgentRunScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("global"),
  }).strict(),
  z.object({
    kind: z.literal("context"),
    nodeId: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal("container"),
    nodeId: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal("component"),
    nodeId: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal("node-plan"),
    nodeId: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal("leaf-file"),
    nodeId: z.string().min(1),
    filePath: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal("leaf-create"),
    nodeId: z.string().min(1),
    filePath: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal("leaf-delete"),
    nodeId: z.string().min(1),
    filePath: z.string().min(1),
  }).strict(),
]);

export const AgentRunRoleSchema = z.enum([
  "global",
  "context_planner",
  "container_planner",
  "node_planner",
  "leaf_file_editor",
  "leaf_file_creator",
  "leaf_file_deleter",
]);

export const AgentRunSchema = z
  .object({
    runId: z.string(),
    projectId: z.string(),
    kind: AgentRunKindSchema,
    status: AgentRunStatusSchema,
    relatedNodeIds: z.array(z.string()),
    relatedFiles: z.array(z.string()),
    scope: AgentRunScopeSchema,
    parentRunId: z.string().min(1).optional(),
    rootRunId: z.string().min(1).optional(),
    role: AgentRunRoleSchema.optional(),
    startedAt: z.string(),
    completedAt: z.string().optional(),
  })
  .strict()
  .superRefine((run, ctx) => {
    if (run.parentRunId && !run.rootRunId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rootRunId"],
        message: "Child runs require a root run id",
      });
    }
    const plannerRoles = {
      global: "global",
      context: "context_planner",
      container: "container_planner",
      component: "node_planner",
      "node-plan": "node_planner",
    } as const;
    if (
      run.scope.kind !== "leaf-file" &&
      run.scope.kind !== "leaf-create" &&
      run.scope.kind !== "leaf-delete"
    ) {
      if (run.role !== plannerRoles[run.scope.kind]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["role"],
          message: "Planning scope requires its matching planner role",
        });
      }
      if (run.relatedFiles.length !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["relatedFiles"],
          message: "Planning runs cannot claim file write scope",
        });
      }
      if (run.scope.kind === "global" && run.relatedNodeIds.length !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["relatedNodeIds"],
          message: "The global planner is above the graph and cannot claim a node scope",
        });
      }
    }
    if (
      run.scope.kind === "leaf-file" &&
      (
        run.role !== "leaf_file_editor" ||
        run.relatedFiles.length !== 1 ||
        run.relatedFiles[0] !== run.scope.filePath
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: "Leaf runs must identify exactly their single authorized file",
      });
    }
    if (
      run.scope.kind === "leaf-create" &&
      (
        run.role !== "leaf_file_creator" ||
        run.relatedFiles.length !== 1 ||
        run.relatedFiles[0] !== run.scope.filePath
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: "Create leaves must identify exactly their single authorized new file",
      });
    }
    if (
      run.scope.kind === "leaf-delete" &&
      (
        run.role !== "leaf_file_deleter" ||
        run.relatedFiles.length !== 1 ||
        run.relatedFiles[0] !== run.scope.filePath
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: "Delete leaves must identify exactly their single authorized existing file",
      });
    }
  });

export type AgentRunKind = z.infer<typeof AgentRunKindSchema>;
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentRunScope = z.infer<typeof AgentRunScopeSchema>;
export type AgentRunRole = z.infer<typeof AgentRunRoleSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
