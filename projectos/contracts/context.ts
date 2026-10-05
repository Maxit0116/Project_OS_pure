import { z } from "zod";

import { LinkedFileSchema } from "./graph.js";
import {
  AnalyzerEvidenceFreshnessSchema,
  GraphStructuralRevisionSchema,
} from "./graph-provenance.js";

export const CurrentWorkVersionSchema = z.literal("0.1.0");

export const RecentChangeActionSchema = z.enum([
  "created",
  "modified",
  "deleted",
  "reverted",
]);

export const GraphFreshnessSchema = z
  .object({
    stale: z.boolean(),
    lastAnalyzedAt: z.string().optional(),
    staleSince: z.string().optional(),
    structuralRevision: GraphStructuralRevisionSchema.optional(),
    analyzerEvidence: AnalyzerEvidenceFreshnessSchema.optional(),
  })
  .strict()
  .superRefine((freshness, ctx) => {
    if (freshness.analyzerEvidence && freshness.stale !== freshness.analyzerEvidence.stale) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["analyzerEvidence", "stale"],
        message: "Legacy stale flag must mirror analyzer evidence freshness",
      });
    }
    if (
      freshness.analyzerEvidence &&
      freshness.lastAnalyzedAt &&
      freshness.lastAnalyzedAt !== freshness.analyzerEvidence.lastAnalyzedAt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["analyzerEvidence", "lastAnalyzedAt"],
        message: "Legacy analysis timestamp must mirror analyzer evidence freshness",
      });
    }
  });

export const RecentChangeSchema = z
  .object({
    path: z.string(),
    action: RecentChangeActionSchema,
    runId: z.string().optional(),
    timestamp: z.string(),
  })
  .strict();

export const CurrentWorkStateSchema = z
  .object({
    version: CurrentWorkVersionSchema,
    projectId: z.string(),
    focusedNodeId: z.string().optional(),
    focusedFilePath: z.string().optional(),
    activeRunId: z.string().optional(),
    activeErrorId: z.string().optional(),
    recentChanges: z.array(RecentChangeSchema),
    unresolvedErrors: z.array(z.string()),
    graphFreshness: GraphFreshnessSchema.optional(),
  })
  .strict();

export const ContextScopeSchema = z.enum([
  "project",
  "feature",
  "file",
  "debug",
  "flow_step",
]);

export const ContextPayloadSchema = z
  .object({
    scope: ContextScopeSchema,
    projectId: z.string(),
    nodeId: z.string().optional(),
    filePath: z.string().optional(),
    title: z.string(),
    summary: z.string(),
    linkedFiles: z.array(LinkedFileSchema),
    upstream: z.array(z.string()),
    downstream: z.array(z.string()),
    recentChanges: z.array(RecentChangeSchema),
    rawContextMarkdown: z.string(),
  })
  .strict();

export type CurrentWorkVersion = z.infer<typeof CurrentWorkVersionSchema>;
export type RecentChangeAction = z.infer<typeof RecentChangeActionSchema>;
export type RecentChange = z.infer<typeof RecentChangeSchema>;
export type CurrentWorkState = z.infer<typeof CurrentWorkStateSchema>;
export type GraphFreshness = z.infer<typeof GraphFreshnessSchema>;
export type ContextScope = z.infer<typeof ContextScopeSchema>;
export type ContextPayload = z.infer<typeof ContextPayloadSchema>;
