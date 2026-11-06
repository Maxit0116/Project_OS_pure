/**
 * Story-map features.json schema.
 *
 * Validates the on-disk Function Map Story document used by sample fixtures and
 * first-principles planned-feature writes. This is not the structure-graph
 * `_schema.md` and is not a substitute for missing features_scan/sync tools.
 */
import { z } from "zod";

const FeatureRefSchema = z.object({
  file: z.string().min(1),
  lines: z.tuple([z.number().int(), z.number().int()]).optional(),
}).strict();

const FeatureStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // Curated sample uses a broader role vocabulary than the UI stub type.
  role: z.string().min(1),
  refs: z.array(FeatureRefSchema).optional(),
  note: z.string().min(1).optional(),
}).strict();

const FeatureFlowEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.string().min(1),
  condition: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
}).strict();

const FeatureTriggerSchema = z.object({
  kind: z.string().min(1),
  detail: z.string().min(1).optional(),
}).strict();

export const FeatureEpicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  order: z.number().int().optional(),
  importance: z.enum(["core", "normal", "optional", "auxiliary"]).optional(),
}).strict();

export const FeatureEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1).optional(),
  epicId: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  workUnitId: z.string().min(1).optional(),
  /** first-principles planned writes use status; curated sample may omit it. */
  status: z.enum(["planned", "implemented", "deprecated"]).optional(),
  locked: z.boolean().optional(),
  thesisId: z.string().min(1).optional(),
  triggers: z.array(FeatureTriggerSchema).optional(),
  steps: z.array(FeatureStepSchema).default([]),
  flow: z.array(FeatureFlowEdgeSchema).optional(),
  confidence: z.number().min(0).max(1).optional(),
  provenance: z.string().min(1).optional(),
  updated_at: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
}).strict();

const EpicFlowEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.string().min(1),
  note: z.string().min(1).optional(),
}).strict();

const CrossFeatureEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.string().min(1),
  mode: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
}).strict();

const TourSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1).optional(),
  // Guided-tour steps carry quiz / focus payloads; keep passthrough.
  steps: z.array(z.record(z.unknown())).default([]),
}).passthrough();

export const FeaturesFileSchema = z.object({
  version: z.string().min(1),
  manifest: z.object({
    repo: z.string().min(1).optional(),
    generated_at: z.string().min(1).optional(),
    generator: z.string().min(1).optional(),
    lang: z.string().min(1).optional(),
  }).passthrough(),
  epics: z.array(FeatureEpicSchema),
  features: z.array(FeatureEntrySchema),
  epic_flow: z.array(EpicFlowEdgeSchema).optional(),
  cross_feature: z.array(CrossFeatureEdgeSchema).optional(),
  tours: z.array(TourSchema).optional(),
}).strict();

export type FeaturesFile = z.infer<typeof FeaturesFileSchema>;
export type FeatureEntry = z.infer<typeof FeatureEntrySchema>;

export type FeaturesCheckIssue = {
  path: string;
  message: string;
};

/** Structural + referential checks beyond Zod shape. */
export function collectFeaturesIntegrityIssues(
  features: FeaturesFile,
): FeaturesCheckIssue[] {
  const issues: FeaturesCheckIssue[] = [];
  const epicIds = new Set<string>();
  for (const epic of features.epics) {
    if (epicIds.has(epic.id)) {
      issues.push({ path: `epics.${epic.id}`, message: `Duplicate epic id '${epic.id}'` });
    }
    epicIds.add(epic.id);
  }
  const featureIds = new Set<string>();
  for (const feature of features.features) {
    if (featureIds.has(feature.id)) {
      issues.push({
        path: `features.${feature.id}`,
        message: `Duplicate feature id '${feature.id}'`,
      });
    }
    featureIds.add(feature.id);
    if (!epicIds.has(feature.epicId)) {
      issues.push({
        path: `features.${feature.id}.epicId`,
        message: `Unknown epicId '${feature.epicId}'`,
      });
    }
    const stepIds = new Set(feature.steps.map((step) => step.id));
    for (const edge of feature.flow ?? []) {
      if (!stepIds.has(edge.from) || !stepIds.has(edge.to)) {
        issues.push({
          path: `features.${feature.id}.flow`,
          message: `Flow edge '${edge.from}' → '${edge.to}' references unknown step ids`,
        });
      }
    }
  }
  for (const [index, edge] of (features.epic_flow ?? []).entries()) {
    if (!epicIds.has(edge.from) || !epicIds.has(edge.to)) {
      issues.push({
        path: `epic_flow[${index}]`,
        message: `Epic flow edge '${edge.from}' → '${edge.to}' references unknown epic ids`,
      });
    }
  }
  for (const [index, edge] of (features.cross_feature ?? []).entries()) {
    if (!featureIds.has(edge.from) || !featureIds.has(edge.to)) {
      issues.push({
        path: `cross_feature[${index}]`,
        message: `Cross-feature edge '${edge.from}' → '${edge.to}' references unknown feature ids`,
      });
    }
  }
  return issues;
}

export function parseFeaturesFile(input: unknown): FeaturesFile {
  const parsed = FeaturesFileSchema.parse(input);
  const issues = collectFeaturesIntegrityIssues(parsed);
  if (issues.length > 0) {
    throw new Error(
      `features.json integrity failed: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`,
    );
  }
  return parsed;
}
