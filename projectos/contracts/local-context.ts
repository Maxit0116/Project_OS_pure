import { z } from "zod";

import {
  GraphAnalysisStatusSchema,
  FunctionalNodeStatusSchema,
  LinkedFileRoleSchema,
} from "./graph.js";
import { ProjectFrameworkSchema } from "./project.js";

export const LocalContextBundleVersionSchema = z.literal("0.2.0");

export const LocalContextNodeSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    summary: z.string(),
    responsibility: z.string().optional(),
    status: FunctionalNodeStatusSchema,
  })
  .strict();

export const LocalContextFileDispositionSchema = z.enum([
  "exact",
  "truncated",
  "omitted",
]);

export const LocalContextFileOmissionReasonSchema = z.enum([
  "ignored",
  "protected_path",
  "sensitive_path",
  "secret_risk",
  "missing",
  "not_regular",
  "symlink",
  "binary",
  "invalid_utf8",
  "selected_file_too_large",
  "connected_file_too_large",
  "connected_file_limit",
  "budget_exhausted",
  "read_failed",
]);

export const LocalContextFileSchema = z
  .object({
    path: z.string(),
    relationship: z.enum(["selected", "connected"]),
    linkedRole: LinkedFileRoleSchema,
    disposition: LocalContextFileDispositionSchema,
    byteLength: z.number().int().nonnegative().optional(),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u).optional(),
    includedByteLength: z.number().int().nonnegative(),
    content: z.string().optional(),
    truncation: z
      .object({
        strategy: z.literal("utf8_prefix"),
        omittedByteLength: z.number().int().positive(),
      })
      .strict()
      .optional(),
    omissionReason: LocalContextFileOmissionReasonSchema.optional(),
  })
  .strict()
  .superRefine((file, ctx) => {
    const contentByteLength =
      file.content === undefined
        ? undefined
        : new TextEncoder().encode(file.content).byteLength;

    if (file.disposition === "omitted") {
      if (!file.omissionReason) {
        addIssue(ctx, ["omissionReason"], "Omitted files require an omission reason");
      }
      if (file.content !== undefined) {
        addIssue(ctx, ["content"], "Omitted files must not include content");
      }
      if (file.includedByteLength !== 0) {
        addIssue(
          ctx,
          ["includedByteLength"],
          "Omitted files must have zero included bytes",
        );
      }
      if (file.truncation !== undefined) {
        addIssue(ctx, ["truncation"], "Omitted files must not include truncation metadata");
      }
      return;
    }

    if (file.content === undefined) {
      addIssue(ctx, ["content"], "Included files require content");
    }
    if (file.sha256 === undefined) {
      addIssue(ctx, ["sha256"], "Included files require a complete-content hash");
    }
    if (file.byteLength === undefined) {
      addIssue(ctx, ["byteLength"], "Included files require a complete byte length");
    }
    if (
      contentByteLength !== undefined &&
      file.includedByteLength !== contentByteLength
    ) {
      addIssue(
        ctx,
        ["includedByteLength"],
        "Included byte length must match the UTF-8 content",
      );
    }
    if (file.omissionReason !== undefined) {
      addIssue(ctx, ["omissionReason"], "Included files must not have an omission reason");
    }

    if (file.disposition === "exact") {
      if (file.truncation !== undefined) {
        addIssue(ctx, ["truncation"], "Exact files must not include truncation metadata");
      }
      if (
        file.byteLength !== undefined &&
        file.byteLength !== file.includedByteLength
      ) {
        addIssue(
          ctx,
          ["includedByteLength"],
          "Exact files must include every source byte",
        );
      }
      return;
    }

    if (!file.truncation) {
      addIssue(ctx, ["truncation"], "Truncated files require truncation metadata");
    }
    if (
      file.byteLength !== undefined &&
      file.byteLength <= file.includedByteLength
    ) {
      addIssue(
        ctx,
        ["byteLength"],
        "Truncated files must be larger than their included content",
      );
    }
    if (
      file.byteLength !== undefined &&
      file.truncation !== undefined &&
      file.truncation.omittedByteLength !==
        file.byteLength - file.includedByteLength
    ) {
      addIssue(
        ctx,
        ["truncation", "omittedByteLength"],
        "Truncation metadata must account for every omitted byte",
      );
    }
  });

export const LocalContextBudgetSchema = z
  .object({
    estimator: z.literal("unicode_chars_div_4_v1"),
    descriptionEstimatedTokens: z.number().int().nonnegative().max(500),
    selectedEstimatedTokens: z.number().int().nonnegative(),
    connectedTokenLimit: z.number().int().positive(),
    connectedEstimatedTokensIncluded: z.number().int().nonnegative(),
    connectedFileLimit: z.number().int().positive(),
  })
  .strict();

const LocalContextProjectSchema = z
  .object({
    displayName: z.string(),
    framework: ProjectFrameworkSchema,
    description: z
      .object({
        content: z.string().min(1),
        source: z.enum(["user", "derived"]),
        estimatedTokens: z.number().int().nonnegative().max(500),
      })
      .strict(),
    synopsis: z.string(),
    synopsisSource: z.literal("derived_project_graph"),
    graphAnalyzedAt: z.string(),
    graphAnalysisStatus: GraphAnalysisStatusSchema,
    synopsisOmittedNodeCount: z.number().int().nonnegative(),
  })
  .strict();

const LocalContextNeighborhoodSchema = z
  .object({
    selected: LocalContextNodeSummarySchema,
    parent: LocalContextNodeSummarySchema.nullable(),
    children: z.array(LocalContextNodeSummarySchema),
    childrenCoverage: z
      .object({
        totalCount: z.number().int().nonnegative(),
        includedCount: z.number().int().nonnegative(),
        omittedCount: z.number().int().nonnegative(),
        estimatedTokensIncluded: z.number().int().nonnegative(),
      })
      .strict(),
    upstream: z.array(LocalContextNodeSummarySchema),
    downstream: z.array(LocalContextNodeSummarySchema),
    unresolvedNodeIds: z.array(z.string()),
  })
  .strict()
  .superRefine((neighborhood, ctx) => {
    if (neighborhood.parent?.id === neighborhood.selected.id) {
      addIssue(ctx, ["parent"], "The selected node cannot be its own parent");
    }
    const childIds = neighborhood.children.map((child) => child.id);
    if (childIds.includes(neighborhood.selected.id)) {
      addIssue(ctx, ["children"], "The selected node cannot be its own child");
    }
    if (new Set(childIds).size !== childIds.length) {
      addIssue(ctx, ["children"], "Child node summaries must be unique");
    }
    if (neighborhood.childrenCoverage.includedCount !== childIds.length) {
      addIssue(
        ctx,
        ["childrenCoverage", "includedCount"],
        "Included child count must match the child summaries",
      );
    }
    if (
      neighborhood.childrenCoverage.includedCount +
        neighborhood.childrenCoverage.omittedCount !==
      neighborhood.childrenCoverage.totalCount
    ) {
      addIssue(
        ctx,
        ["childrenCoverage"],
        "Included and omitted child counts must equal the total child count",
      );
    }
  });

const LocalContextBundleBaseSchema = z
  .object({
    version: LocalContextBundleVersionSchema,
    projectId: z.string(),
    assembledAt: z.string(),
    scope: z
      .object({
        nodeId: z.string(),
        selectedFilePath: z.string(),
      })
      .strict(),
    responseLanguage: z.string(),
    project: LocalContextProjectSchema,
    neighborhood: LocalContextNeighborhoodSchema,
    fileManifest: z.array(LocalContextFileSchema),
    allowedReadPaths: z.array(z.string()),
    allowedWritePaths: z.array(z.string()).length(1),
    budget: LocalContextBudgetSchema,
    bundleHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  })
  .strict();

export const LocalContextBundleSchema = LocalContextBundleBaseSchema.superRefine(
  (bundle, ctx) => {
    validateDescriptionBudget(bundle, ctx);
    const selectedFiles = bundle.fileManifest.filter(
      (file) => file.relationship === "selected",
    );
    if (selectedFiles.length !== 1) {
      addIssue(
        ctx,
        ["fileManifest"],
        "Local context requires exactly one selected file entry",
      );
      return;
    }

    const selected = selectedFiles[0]!;
    if (selected.disposition !== "exact") {
      addIssue(
        ctx,
        ["fileManifest"],
        "The selected file must be included exactly",
      );
    }
    if (selected.path !== bundle.scope.selectedFilePath) {
      addIssue(
        ctx,
        ["scope", "selectedFilePath"],
        "Selected file manifest path must match the bundle scope",
      );
    }
    if (bundle.allowedWritePaths[0] !== selected.path) {
      addIssue(
        ctx,
        ["allowedWritePaths"],
        "The selected file must be the only allowed write path",
      );
    }

    const expectedReadPaths = bundle.fileManifest
      .filter((file) => file.disposition !== "omitted")
      .map((file) => file.path);
    if (!sameStringArray(bundle.allowedReadPaths, expectedReadPaths)) {
      addIssue(
        ctx,
        ["allowedReadPaths"],
        "Allowed read paths must match exact and truncated manifest entries",
      );
    }
    if (new Set(bundle.allowedReadPaths).size !== bundle.allowedReadPaths.length) {
      addIssue(ctx, ["allowedReadPaths"], "Allowed read paths must be unique");
    }
    const manifestPaths = bundle.fileManifest.map((file) => file.path);
    if (new Set(manifestPaths).size !== manifestPaths.length) {
      addIssue(ctx, ["fileManifest"], "File manifest paths must be unique");
    }
  },
);

const NodeContextBundleBaseSchema = z
  .object({
    version: LocalContextBundleVersionSchema,
    projectId: z.string(),
    assembledAt: z.string(),
    scope: z
      .object({
        kind: z.literal("node"),
        nodeId: z.string(),
      })
      .strict(),
    responseLanguage: z.string(),
    project: LocalContextProjectSchema,
    neighborhood: LocalContextNeighborhoodSchema,
    fileManifest: z.array(LocalContextFileSchema),
    allowedReadPaths: z.array(z.string()),
    allowedWritePaths: z.array(z.string()).length(0),
    budget: LocalContextBudgetSchema,
    bundleHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  })
  .strict();

export const NodeContextBundleSchema = NodeContextBundleBaseSchema.superRefine(
  (bundle, ctx) => {
    validateDescriptionBudget(bundle, ctx);
    if (bundle.fileManifest.some((file) => file.relationship === "selected")) {
      addIssue(
        ctx,
        ["fileManifest"],
        "Node context must not grant selected-file semantics",
      );
    }
    if (bundle.budget.selectedEstimatedTokens !== 0) {
      addIssue(
        ctx,
        ["budget", "selectedEstimatedTokens"],
        "Node context must not reserve selected-file tokens",
      );
    }
    validateManifestReadPaths(bundle.fileManifest, bundle.allowedReadPaths, ctx);
  },
);

export const GlobalContextBundleSchema = z
  .object({
    version: z.literal("0.1.0"),
    projectId: z.string().min(1),
    assembledAt: z.string().min(1),
    scope: z.object({ kind: z.literal("global") }).strict(),
    responseLanguage: z.string(),
    projectName: z.string().min(1),
    conciseDescription: z.string().min(1),
    descriptionSource: z.enum(["user", "derived"]),
    analyzedAt: z.string().min(1),
    topLevelNodes: z.array(z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      summary: z.string(),
      responsibility: z.string().optional(),
      level: z.literal("context"),
      childCount: z.number().int().nonnegative(),
    }).strict()),
    contextHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    bundleHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    allowedReadPaths: z.array(z.string()).length(0),
    allowedWritePaths: z.array(z.string()).length(0),
  })
  .strict()
  .superRefine((bundle, ctx) => {
    if (bundle.contextHash !== bundle.bundleHash) {
      addIssue(ctx, ["bundleHash"], "Global context hashes must match");
    }
  });

export const AgentContextBundleSchema = z.union([
  LocalContextBundleSchema,
  NodeContextBundleSchema,
  GlobalContextBundleSchema,
]);

export type LocalContextNodeSummary = z.infer<
  typeof LocalContextNodeSummarySchema
>;
export type LocalContextFileDisposition = z.infer<
  typeof LocalContextFileDispositionSchema
>;
export type LocalContextFileOmissionReason = z.infer<
  typeof LocalContextFileOmissionReasonSchema
>;
export type LocalContextFile = z.infer<typeof LocalContextFileSchema>;
export type LocalContextBudget = z.infer<typeof LocalContextBudgetSchema>;
export type LocalContextBundle = z.infer<typeof LocalContextBundleSchema>;
export type LocalContextBundleHashInput = Omit<LocalContextBundle, "bundleHash">;
export type NodeContextBundle = z.infer<typeof NodeContextBundleSchema>;
export type NodeContextBundleHashInput = Omit<NodeContextBundle, "bundleHash">;
export type GlobalContextBundle = z.infer<typeof GlobalContextBundleSchema>;
export type AgentContextBundle = z.infer<typeof AgentContextBundleSchema>;
export type AgentContextBundleHashInput =
  | LocalContextBundleHashInput
  | NodeContextBundleHashInput
  | Omit<GlobalContextBundle, "bundleHash">;

export function canonicalizeLocalContextBundle(
  bundle: AgentContextBundle | AgentContextBundleHashInput,
): string {
  const hashable = "bundleHash" in bundle
    ? Object.fromEntries(
        Object.entries(bundle).filter(([key]) => key !== "bundleHash"),
      )
    : bundle;
  return JSON.stringify(sortCanonicalValue(hashable));
}

function validateManifestReadPaths(
  fileManifest: LocalContextFile[],
  allowedReadPaths: string[],
  ctx: z.RefinementCtx,
): void {
  const expectedReadPaths = fileManifest
    .filter((file) => file.disposition !== "omitted")
    .map((file) => file.path);
  if (!sameStringArray(allowedReadPaths, expectedReadPaths)) {
    addIssue(
      ctx,
      ["allowedReadPaths"],
      "Allowed read paths must match exact and truncated manifest entries",
    );
  }
  if (new Set(allowedReadPaths).size !== allowedReadPaths.length) {
    addIssue(ctx, ["allowedReadPaths"], "Allowed read paths must be unique");
  }
  const manifestPaths = fileManifest.map((file) => file.path);
  if (new Set(manifestPaths).size !== manifestPaths.length) {
    addIssue(ctx, ["fileManifest"], "File manifest paths must be unique");
  }
}

function validateDescriptionBudget(
  bundle: {
    project: { description: { content: string; estimatedTokens: number } };
    budget: { descriptionEstimatedTokens: number };
  },
  ctx: z.RefinementCtx,
): void {
  const estimatedTokens = Math.ceil([...bundle.project.description.content].length / 4);
  if (bundle.project.description.estimatedTokens !== estimatedTokens) {
    addIssue(
      ctx,
      ["project", "description", "estimatedTokens"],
      "Description token estimate must match its Unicode content",
    );
  }
  if (bundle.budget.descriptionEstimatedTokens !== estimatedTokens) {
    addIssue(
      ctx,
      ["budget", "descriptionEstimatedTokens"],
      "Budget must report the project description token estimate",
    );
  }
}

function sortCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortCanonicalValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, child]) => [key, sortCanonicalValue(child)]),
    );
  }
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameStringArray(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function addIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  });
}
