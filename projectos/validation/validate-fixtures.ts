import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import {
  AgentRunKindSchema,
  AgentRunSchema,
} from "../contracts/agent-run.js";
import {
  ContextPayloadSchema,
  CurrentWorkStateSchema,
} from "../contracts/context.js";
import {
  ApplyResultSchema,
  GeneratedDiffSchema,
} from "../contracts/diff.js";
import { AgentRunEventSchema } from "../contracts/events.js";
import type { AgentRunEvent } from "../contracts/events.js";
import { ProjectGraphSchema } from "../contracts/graph.js";
import { GraphProductOverlaySchema } from "../contracts/graph-provenance.js";
import { parseMapContentDocument, type MapContentDocument } from "../contracts/map-content.js";
import type {
  FileEntry,
  FunctionalEdge,
  LinkedFile,
  ProjectGraph,
} from "../contracts/graph.js";
import { HarnessRecordSchema } from "../contracts/harness.js";
import type { HarnessRecord } from "../contracts/harness.js";
import {
  PromptRefineRequestSchema,
  PromptRefinementSchema,
} from "../contracts/prompt-refinement.js";
import { ProjectOSProjectSchema } from "../contracts/project.js";
import { ProjectOSSettingsSchema } from "../contracts/settings.js";
import { SemanticTreeSchema } from "../contracts/semantic-tree.js";
import type { SemanticTreeNode } from "../contracts/semantic-tree.js";
import { composeProjectGraph } from "../services/graph-provenance.js";
import { resolveContainedPath } from "../utils/path-containment.js";

export const DemoScenarioSchema = z
  .object({
    version: z.literal("0.1.0"),
    scenarioId: z.string(),
    projectId: z.string(),
    title: z.string(),
    description: z.string(),
    kind: AgentRunKindSchema,
    nodeIds: z.array(z.string()),
    files: z.array(z.string()),
    prompt: PromptRefineRequestSchema.optional(),
    refinement: PromptRefinementSchema.optional(),
    run: AgentRunSchema.optional(),
    events: z.array(AgentRunEventSchema).optional(),
    diff: GeneratedDiffSchema.optional(),
    applyResult: ApplyResultSchema.optional(),
    context: ContextPayloadSchema.optional(),
    harnessErrorId: z.string().optional(),
    harnessRecord: HarnessRecordSchema.optional(),
  })
  .strict();

export const DemoResetSchema = z
  .object({
    version: z.literal("0.1.0"),
    projectId: z.string(),
    resetId: z.string(),
    description: z.string(),
    projectOSFiles: z.array(z.string()),
    scenarioIds: z.array(z.string()),
    harnessErrorIds: z.array(z.string()),
    workspaceFiles: z.array(z.string()),
    cleanState: CurrentWorkStateSchema,
  })
  .strict();

export type DemoScenario = z.infer<typeof DemoScenarioSchema>;
export type DemoReset = z.infer<typeof DemoResetSchema>;

export type FixtureValidationErrorCode =
  | "missing_artifact"
  | "json_parse_error"
  | "schema_invalid"
  | "edge_missing_node"
  | "edge_duplicate_id"
  | "edge_self_loop"
  | "referenced_file_missing"
  | "fixture_reference_missing"
  | "semantic_tree_missing_node"
  | "node_reference_missing"
  | "agent_event_schema_invalid"
  | "agent_event_order_invalid";

export interface FixtureValidationError {
  code: FixtureValidationErrorCode;
  artifact: string;
  path: string;
  message: string;
}

export interface FixtureValidationResult {
  ok: boolean;
  workspaceRoot: string;
  errors: FixtureValidationError[];
}

export interface WorkspaceFixtureData {
  project?: unknown;
  settings?: unknown;
  graph?: unknown;
  graphProductOverlay?: unknown;
  semanticTree?: unknown;
  currentWork?: unknown;
  demoReset?: unknown;
  harnessRecords?: Record<string, unknown>;
  demoScenarios?: Record<string, unknown>;
  agentRuns?: Record<string, unknown>;
  mapContent?: unknown;
}

export interface WorkspaceFixtureValidationOptions {
  workspaceRoot?: string;
  fileExists?: (path: string) => boolean;
}

interface LoadedWorkspaceFixtureData {
  data: WorkspaceFixtureData;
  errors: FixtureValidationError[];
}

const AgentRunEventsSchema = z.array(AgentRunEventSchema);

export function validateAgentRunEventSequence(
  events: AgentRunEvent[],
  artifact = "agent-run-events",
): FixtureValidationError[] {
  const errors: FixtureValidationError[] = [];
  validateAgentRunEventOrder(events, artifact, errors);
  return errors;
}

export function validateWorkspaceFixtures(
  workspaceRoot: string,
): FixtureValidationResult {
  const loaded = loadWorkspaceFixtureData(workspaceRoot);
  const result = validateWorkspaceFixtureData(loaded.data, {
    workspaceRoot,
    fileExists: createWorkspaceFileExists(workspaceRoot),
  });

  const errors = [...loaded.errors, ...result.errors];

  return {
    ok: errors.length === 0,
    workspaceRoot,
    errors,
  };
}

export function validateWorkspaceFixtureData(
  data: WorkspaceFixtureData,
  options: WorkspaceFixtureValidationOptions = {},
): FixtureValidationResult {
  const workspaceRoot = options.workspaceRoot ?? "<memory>";
  const fileExists = options.fileExists ?? (() => true);
  const errors: FixtureValidationError[] = [];

  const analyzerGraph = parseArtifact(
    ProjectGraphSchema,
    data.graph,
    "graph.json",
    errors,
    true,
  );
  const graphOverlay = parseArtifact(
    GraphProductOverlaySchema,
    data.graphProductOverlay,
    "graph-product-overlay.json",
    errors,
  );
  let graph = analyzerGraph;
  if (analyzerGraph && graphOverlay) {
    try {
      graph = composeProjectGraph(analyzerGraph, graphOverlay);
    } catch (error) {
      errors.push({
        code: "schema_invalid",
        artifact: "graph-product-overlay.json",
        path: "",
        message: error instanceof Error ? error.message : "Invalid graph product overlay",
      });
      graph = undefined;
    }
  }
  const tombstonedFilePaths = new Set(graphOverlay?.removedFilePaths ?? []);
  const historicalFileExists = (path: string): boolean =>
    tombstonedFilePaths.has(path) || fileExists(path);
  const nodeIds = new Set(graph?.nodes.map((node) => node.id) ?? []);

  const project = parseArtifact(ProjectOSProjectSchema, data.project, "project.json", errors);
  parseArtifact(
    ProjectOSSettingsSchema,
    data.settings,
    "settings.json",
    errors,
  );
  const semanticTree = parseArtifact(
    SemanticTreeSchema,
    data.semanticTree,
    "semantic-tree.json",
    errors,
  );
  const currentWork = parseArtifact(
    CurrentWorkStateSchema,
    data.currentWork,
    "current-work.json",
    errors,
  );
  const demoReset = parseArtifact(
    DemoResetSchema,
    data.demoReset,
    "demo-reset.json",
    errors,
  );
  const mapContent = parseMapContentArtifact(
    data.mapContent,
    "map-content.json",
    errors,
  );

  if (graph) {
    validateGraphReferences(graph, fileExists, errors);
  }

  if (semanticTree) {
    for (const root of semanticTree.roots) {
      validateSemanticTreeNode(root, nodeIds, "semantic-tree.json", fileExists, errors);
    }
  }

  if (currentWork?.focusedNodeId) {
    validateNodeReference(
      currentWork.focusedNodeId,
      nodeIds,
      "current-work.json",
      "focusedNodeId",
      errors,
    );
  }

  const harnessRecordIds = new Set<string>();
  for (const [artifact, value] of Object.entries(data.harnessRecords ?? {})) {
    const record = parseArtifact(
      HarnessRecordSchema,
      value,
      `harness/${artifact}`,
      errors,
    );
    if (record) {
      harnessRecordIds.add(record.errorId);
      validateHarnessRecord(
        record,
        nodeIds,
        historicalFileExists,
        `harness/${artifact}`,
        errors,
      );
    }
  }

  const demoScenarioIds = new Set<string>();
  for (const [artifact, value] of Object.entries(data.demoScenarios ?? {})) {
    const scenario = parseArtifact(
      DemoScenarioSchema,
      value,
      `demo-scenarios/${artifact}`,
      errors,
    );
    if (scenario) {
      demoScenarioIds.add(scenario.scenarioId);
      validateDemoScenario(
        scenario,
        nodeIds,
        historicalFileExists,
        `demo-scenarios/${artifact}`,
        errors,
      );
      if (
        scenario.harnessErrorId &&
        !harnessRecordIds.has(scenario.harnessErrorId)
      ) {
        addFixtureReferenceError(
          errors,
          `demo-scenarios/${artifact}`,
          "harnessErrorId",
          `Scenario harness error '${scenario.harnessErrorId}' does not match a loaded harness record`,
        );
      }
    }
  }

  for (const [artifact, value] of Object.entries(data.agentRuns ?? {})) {
    const events = parseAgentRunEvents(value, `agent-runs/${artifact}`, errors);
    if (events) {
      validateAgentRunEventOrder(events, `agent-runs/${artifact}`, errors);
      validateAgentRunEventReferences(
        events,
        nodeIds,
        historicalFileExists,
        `agent-runs/${artifact}`,
        errors,
      );
    }
  }

  if (demoReset) {
    validateDemoReset(
      demoReset,
      demoScenarioIds,
      harnessRecordIds,
      nodeIds,
      fileExists,
      historicalFileExists,
      errors,
    );
  }

  if (mapContent) {
    for (const artifact of mapContent.artifacts) {
      if (artifact.scope === "node" && artifact.nodeId) {
        validateNodeReference(
          artifact.nodeId,
          nodeIds,
          "map-content.json",
          `artifacts.${artifact.id}.nodeId`,
          errors,
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    workspaceRoot,
    errors,
  };
}

function loadWorkspaceFixtureData(workspaceRoot: string): LoadedWorkspaceFixtureData {
  const errors: FixtureValidationError[] = [];
  const projectOSRoot = join(workspaceRoot, ".projectos");

  return {
    data: {
      project: readJsonArtifact(projectOSRoot, "project.json", errors),
      settings: readJsonArtifact(projectOSRoot, "settings.json", errors),
      graph: readJsonArtifact(projectOSRoot, "graph.json", errors),
      graphProductOverlay: readJsonArtifact(
        projectOSRoot,
        "graph-product-overlay.json",
        errors,
      ),
      semanticTree: readJsonArtifact(projectOSRoot, "semantic-tree.json", errors),
      currentWork: readJsonArtifact(projectOSRoot, "current-work.json", errors),
      demoReset: readJsonArtifact(projectOSRoot, "demo-reset.json", errors),
      harnessRecords: readJsonArtifactsInDirectory(projectOSRoot, "harness", errors),
      demoScenarios: readJsonArtifactsInDirectory(
        projectOSRoot,
        "demo-scenarios",
        errors,
      ),
      agentRuns: readJsonLinesArtifactsInDirectory(
        projectOSRoot,
        "agent-runs",
        errors,
      ),
      mapContent: readJsonArtifact(projectOSRoot, "map-content.json", errors),
    },
    errors,
  };
}

function readJsonArtifact(
  projectOSRoot: string,
  relativePath: string,
  errors: FixtureValidationError[],
): unknown {
  const path = join(projectOSRoot, relativePath);
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    errors.push({
      code: "json_parse_error",
      artifact: relativePath,
      path: "",
      message: error instanceof Error ? error.message : "Invalid JSON artifact",
    });
    return undefined;
  }
}

function readJsonArtifactsInDirectory(
  projectOSRoot: string,
  relativeDirectory: string,
  errors: FixtureValidationError[],
): Record<string, unknown> {
  const directory = join(projectOSRoot, relativeDirectory);
  const artifacts: Record<string, unknown> = {};

  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return artifacts;
  }

  for (const fileName of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
    artifacts[fileName] = readJsonArtifact(
      projectOSRoot,
      join(relativeDirectory, fileName),
      errors,
    );
  }

  return artifacts;
}

function readJsonLinesArtifactsInDirectory(
  projectOSRoot: string,
  relativeDirectory: string,
  errors: FixtureValidationError[],
): Record<string, unknown> {
  const directory = join(projectOSRoot, relativeDirectory);
  const artifacts: Record<string, unknown> = {};

  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return artifacts;
  }

  for (const fileName of readdirSync(directory)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()) {
    const artifact = join(relativeDirectory, fileName);
    let source: string;
    try {
      source = readFileSync(join(projectOSRoot, artifact), "utf8");
    } catch (error) {
      errors.push({
        code: "json_parse_error",
        artifact,
        path: "",
        message: error instanceof Error ? error.message : "Unable to read JSONL artifact",
      });
      continue;
    }

    const events: unknown[] = [];
    let valid = true;
    source.split(/\r?\n/u).forEach((line, lineIndex) => {
      if (!line.trim()) return;
      try {
        events.push(JSON.parse(line) as unknown);
      } catch (error) {
        valid = false;
        errors.push({
          code: "json_parse_error",
          artifact,
          path: `line.${lineIndex + 1}`,
          message: error instanceof Error ? error.message : "Invalid JSONL event",
        });
      }
    });
    if (valid) artifacts[fileName] = events;
  }

  return artifacts;
}

function parseMapContentArtifact(
  value: unknown,
  artifact: string,
  errors: FixtureValidationError[],
): MapContentDocument | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    return parseMapContentDocument(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      for (const issue of error.issues) {
        errors.push({
          code: "schema_invalid",
          artifact,
          path: issue.path.join("."),
          message: issue.message,
        });
      }
      return undefined;
    }
    errors.push({
      code: "schema_invalid",
      artifact,
      path: "",
      message: error instanceof Error ? error.message : "Invalid map content",
    });
    return undefined;
  }
}

function parseArtifact<T>(
  schema: z.ZodType<T>,
  value: unknown,
  artifact: string,
  errors: FixtureValidationError[],
  required = false,
): T | undefined {
  if (value === undefined) {
    if (required) {
      errors.push({
        code: "missing_artifact",
        artifact,
        path: "",
        message: `${artifact} is required`,
      });
    }
    return undefined;
  }

  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  for (const issue of result.error.issues) {
    errors.push({
      code: "schema_invalid",
      artifact,
      path: formatIssuePath(issue.path),
      message: issue.message,
    });
  }

  return undefined;
}

function parseAgentRunEvents(
  value: unknown,
  artifact: string,
  errors: FixtureValidationError[],
): AgentRunEvent[] | undefined {
  const result = AgentRunEventsSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  for (const issue of result.error.issues) {
    errors.push({
      code: "agent_event_schema_invalid",
      artifact,
      path: formatIssuePath(issue.path),
      message: issue.message,
    });
  }

  return undefined;
}

export function validateGraphReferences(
  graph: ProjectGraph,
  fileExists: (path: string) => boolean,
  errors: FixtureValidationError[],
): void {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  graph.nodes.forEach((node, nodeIndex) => {
    node.linkedFiles.forEach((linkedFile, fileIndex) => {
      validateLinkedFileReference(
        linkedFile,
        fileExists,
        "graph.json",
        `nodes.${nodeIndex}.linkedFiles.${fileIndex}.path`,
        errors,
      );
    });
    validateNodeReferences(
      node.upstream,
      nodeIds,
      "graph.json",
      `nodes.${nodeIndex}.upstream`,
      errors,
    );
    validateNodeReferences(
      node.downstream,
      nodeIds,
      "graph.json",
      `nodes.${nodeIndex}.downstream`,
      errors,
    );
    validateNodeReferences(
      node.refs ?? [],
      nodeIds,
      "graph.json",
      `nodes.${nodeIndex}.refs`,
      errors,
    );

    if (node.parentId) {
      const parent = nodesById.get(node.parentId);
      if (!parent) {
        validateNodeReference(
          node.parentId,
          nodeIds,
          "graph.json",
          `nodes.${nodeIndex}.parentId`,
          errors,
        );
      } else if (!(parent.children ?? []).includes(node.id)) {
        errors.push({
          code: "node_reference_missing",
          artifact: "graph.json",
          path: `nodes.${nodeIndex}.parentId`,
          message: `Parent node '${node.parentId}' does not include '${node.id}' in children`,
        });
      }
    }

    (node.children ?? []).forEach((childId, childIndex) => {
      const child = nodesById.get(childId);
      if (!child) {
        validateNodeReference(
          childId,
          nodeIds,
          "graph.json",
          `nodes.${nodeIndex}.children.${childIndex}`,
          errors,
        );
      } else if (child.parentId !== node.id) {
        errors.push({
          code: "node_reference_missing",
          artifact: "graph.json",
          path: `nodes.${nodeIndex}.children.${childIndex}`,
          message: `Child node '${childId}' does not reference '${node.id}' as parentId`,
        });
      }
    });
  });

  const edgeIds = new Set<string>();
  graph.edges.forEach((edge, index) => {
    if (edgeIds.has(edge.id)) {
      errors.push({
        code: "edge_duplicate_id",
        artifact: "graph.json",
        path: `edges.${index}.id`,
        message: `Duplicate edge id '${edge.id}'`,
      });
    }
    edgeIds.add(edge.id);
    if (edge.source === edge.target) {
      errors.push({
        code: "edge_self_loop",
        artifact: "graph.json",
        path: `edges.${index}`,
        message: `Edge '${edge.id}' must not connect node '${edge.source}' to itself`,
      });
    }
    validateEdgeReference(edge, nodeIds, index, errors);
  });

  graph.fileIndex.forEach((entry, index) => {
    validateFileEntryReference(entry, nodeIds, fileExists, index, errors);
  });
}

function validateLinkedFileReference(
  linkedFile: LinkedFile,
  fileExists: (path: string) => boolean,
  artifact: string,
  path: string,
  errors: FixtureValidationError[],
): void {
  validateFileReference(linkedFile.path, fileExists, artifact, path, errors);
}

function validateFileEntryReference(
  entry: FileEntry,
  nodeIds: Set<string>,
  fileExists: (path: string) => boolean,
  index: number,
  errors: FixtureValidationError[],
): void {
  validateFileReference(entry.path, fileExists, "graph.json", `fileIndex.${index}.path`, errors);
  validateNodeReferences(entry.nodeIds, nodeIds, "graph.json", `fileIndex.${index}.nodeIds`, errors);
}

function validateEdgeReference(
  edge: FunctionalEdge,
  nodeIds: Set<string>,
  index: number,
  errors: FixtureValidationError[],
): void {
  if (!nodeIds.has(edge.source)) {
    errors.push({
      code: "edge_missing_node",
      artifact: "graph.json",
      path: `edges.${index}.source`,
      message: `Edge ${edge.id} source '${edge.source}' does not match an existing node id`,
    });
  }
  if (!nodeIds.has(edge.target)) {
    errors.push({
      code: "edge_missing_node",
      artifact: "graph.json",
      path: `edges.${index}.target`,
      message: `Edge ${edge.id} target '${edge.target}' does not match an existing node id`,
    });
  }
}

function validateSemanticTreeNode(
  node: SemanticTreeNode,
  nodeIds: Set<string>,
  artifact: string,
  fileExists: (path: string) => boolean,
  errors: FixtureValidationError[],
): void {
  if (node.sourceNodeId && !nodeIds.has(node.sourceNodeId)) {
    errors.push({
      code: "semantic_tree_missing_node",
      artifact,
      path: `${node.id}.sourceNodeId`,
      message: `Semantic tree node '${node.id}' references missing source node '${node.sourceNodeId}'`,
    });
  }
  if (node.path) {
    validateFileReference(node.path, fileExists, artifact, `${node.id}.path`, errors);
  }

  node.children.forEach((child) => {
    validateSemanticTreeNode(child, nodeIds, artifact, fileExists, errors);
  });
}

function validateHarnessRecord(
  record: HarnessRecord,
  nodeIds: Set<string>,
  fileExists: (path: string) => boolean,
  artifact: string,
  errors: FixtureValidationError[],
): void {
  if (record.businessNodeId) {
    validateNodeReference(record.businessNodeId, nodeIds, artifact, "businessNodeId", errors);
  }
  record.technicalFiles.forEach((path, index) => {
    validateFileReference(path, fileExists, artifact, `technicalFiles.${index}`, errors);
  });
  record.proposedFix.touchedFiles.forEach((path, index) => {
    validateFileReference(path, fileExists, artifact, `proposedFix.touchedFiles.${index}`, errors);
  });
  if (!record.hypotheses.some((hypothesis) => hypothesis.id === record.chosenRootCauseId)) {
    errors.push({
      code: "node_reference_missing",
      artifact,
      path: "chosenRootCauseId",
      message: `Chosen root cause '${record.chosenRootCauseId}' does not match a hypothesis id`,
    });
  }
}

function validateDemoReset(
  reset: DemoReset,
  scenarioIds: Set<string>,
  harnessErrorIds: Set<string>,
  nodeIds: Set<string>,
  projectOSFileExists: (path: string) => boolean,
  workspaceFileExists: (path: string) => boolean,
  errors: FixtureValidationError[],
): void {
  reset.scenarioIds.forEach((scenarioId, index) => {
    if (!scenarioIds.has(scenarioId)) {
      addFixtureReferenceError(
        errors,
        "demo-reset.json",
        `scenarioIds.${index}`,
        `Reset scenario '${scenarioId}' does not match a loaded demo scenario`,
      );
    }
  });
  reset.harnessErrorIds.forEach((errorId, index) => {
    if (!harnessErrorIds.has(errorId)) {
      addFixtureReferenceError(
        errors,
        "demo-reset.json",
        `harnessErrorIds.${index}`,
        `Reset harness error '${errorId}' does not match a loaded harness record`,
      );
    }
  });
  reset.projectOSFiles.forEach((path, index) => {
    validateFileReference(
      path,
      projectOSFileExists,
      "demo-reset.json",
      `projectOSFiles.${index}`,
      errors,
    );
  });
  reset.workspaceFiles.forEach((path, index) => {
    validateFileReference(
      path,
      workspaceFileExists,
      "demo-reset.json",
      `workspaceFiles.${index}`,
      errors,
    );
  });
  if (reset.cleanState.focusedNodeId) {
    validateNodeReference(
      reset.cleanState.focusedNodeId,
      nodeIds,
      "demo-reset.json",
      "cleanState.focusedNodeId",
      errors,
    );
  }
}

function validateDemoScenario(
  scenario: DemoScenario,
  nodeIds: Set<string>,
  fileExists: (path: string) => boolean,
  artifact: string,
  errors: FixtureValidationError[],
): void {
  validateNodeReferences(scenario.nodeIds, nodeIds, artifact, "nodeIds", errors);
  scenario.files.forEach((path, index) => {
    validateFileReference(path, fileExists, artifact, `files.${index}`, errors);
  });

  if (scenario.prompt?.nodeId) {
    validateNodeReference(scenario.prompt.nodeId, nodeIds, artifact, "prompt.nodeId", errors);
  }
  if (scenario.prompt?.filePath) {
    validateFileReference(scenario.prompt.filePath, fileExists, artifact, "prompt.filePath", errors);
  }
  if (scenario.refinement) {
    validateNodeReferences(
      scenario.refinement.affectedNodeIds,
      nodeIds,
      artifact,
      "refinement.affectedNodeIds",
      errors,
    );
    scenario.refinement.affectedFiles.forEach((path, index) => {
      validateFileReference(
        path,
        fileExists,
        artifact,
        `refinement.affectedFiles.${index}`,
        errors,
      );
    });
  }
  if (scenario.run) {
    validateNodeReferences(scenario.run.relatedNodeIds, nodeIds, artifact, "run.relatedNodeIds", errors);
    scenario.run.relatedFiles.forEach((path, index) => {
      validateFileReference(path, fileExists, artifact, `run.relatedFiles.${index}`, errors);
    });
  }
  if (scenario.events) {
    validateAgentRunEventOrder(scenario.events, artifact, errors);
    validateAgentRunEventReferences(scenario.events, nodeIds, fileExists, artifact, errors);
  }
  if (scenario.diff) {
    scenario.diff.files.forEach((file, index) => {
      validateFileReference(pathForDiffFile(file.path), fileExists, artifact, `diff.files.${index}.path`, errors);
    });
  }
  if (scenario.applyResult) {
    scenario.applyResult.filesChanged.forEach((path, index) => {
      validateFileReference(path, fileExists, artifact, `applyResult.filesChanged.${index}`, errors);
    });
  }
  if (scenario.context) {
    scenario.context.linkedFiles.forEach((linkedFile, index) => {
      validateLinkedFileReference(
        linkedFile,
        fileExists,
        artifact,
        `context.linkedFiles.${index}.path`,
        errors,
      );
    });
  }
  if (scenario.harnessRecord) {
    validateHarnessRecord(scenario.harnessRecord, nodeIds, fileExists, artifact, errors);
  }
}

function validateAgentRunEventReferences(
  events: AgentRunEvent[],
  nodeIds: Set<string>,
  fileExists: (path: string) => boolean,
  artifact: string,
  errors: FixtureValidationError[],
): void {
  events.forEach((event, eventIndex) => {
    if (!event.step) {
      return;
    }
    validateNodeReferences(
      event.step.relatedNodeIds,
      nodeIds,
      artifact,
      `events.${eventIndex}.step.relatedNodeIds`,
      errors,
    );
    event.step.relatedFiles.forEach((path, fileIndex) => {
      validateFileReference(
        path,
        fileExists,
        artifact,
        `events.${eventIndex}.step.relatedFiles.${fileIndex}`,
        errors,
      );
    });
  });
}

const POST_RUN_COMPLETION_EVENT_TYPES = new Set([
  "apply_result",
  "verification_result",
  "child_run_outcome",
  "plan_partially_completed",
  "plan_completed",
  "child_run_completed",
]);

function isAllowedAfterRunCompleted(event: AgentRunEvent): boolean {
  if (POST_RUN_COMPLETION_EVENT_TYPES.has(event.type)) {
    return true;
  }
  if (
    event.type === "run_completed" &&
    typeof event.payload === "object" &&
    event.payload !== null &&
    "parentRunId" in event.payload
  ) {
    return true;
  }
  return false;
}

function validateAgentRunEventOrder(
  events: AgentRunEvent[],
  artifact: string,
  errors: FixtureValidationError[],
): void {
  if (events.length === 0) {
    return;
  }

  const eventIds = new Set<string>();
  const startedStepIndexes = new Map<string, number>();
  const terminatedSteps = new Set<string>();
  let runId: string | undefined;
  let lastTimestampMs: number | undefined;
  let sawRunStarted = false;
  let sawRunCompleted = false;

  events.forEach((event, index) => {
    if (eventIds.has(event.eventId)) {
      addEventOrderError(errors, artifact, index, `Duplicate eventId '${event.eventId}'`);
    }
    eventIds.add(event.eventId);

    if (runId === undefined) {
      runId = event.runId;
    } else if (event.runId !== runId) {
      addEventOrderError(
        errors,
        artifact,
        index,
        `Event runId '${event.runId}' does not match stream runId '${runId}'`,
      );
    }

    const timestampMs = Date.parse(event.timestamp);
    if (!Number.isFinite(timestampMs)) {
      addEventOrderError(
        errors,
        artifact,
        index,
        `Event timestamp '${event.timestamp}' is invalid`,
      );
    } else {
      if (lastTimestampMs !== undefined && timestampMs < lastTimestampMs) {
        addEventOrderError(
          errors,
          artifact,
          index,
          "Event timestamps must be nondecreasing",
        );
      }
      lastTimestampMs = timestampMs;
    }

    if (sawRunCompleted && !isAllowedAfterRunCompleted(event)) {
      addEventOrderError(errors, artifact, index, "No events may appear after run_completed");
    }

    if (index === 0 && event.type !== "run_started") {
      addEventOrderError(errors, artifact, index, "First event must be run_started");
    }

    if (event.type === "run_started") {
      if (sawRunStarted) {
        addEventOrderError(errors, artifact, index, "run_started may only appear once");
      }
      sawRunStarted = true;
      return;
    }

    if (!sawRunStarted) {
      addEventOrderError(errors, artifact, index, `${event.type} appeared before run_started`);
    }

    if (
      event.type === "step_started" ||
      event.type === "step_completed" ||
      event.type === "step_failed"
    ) {
      if (!event.step) {
        if (event.type !== "step_failed") {
          addEventOrderError(errors, artifact, index, `${event.type} requires a step`);
        }
        return;
      }

      if (event.type === "step_started") {
        if (terminatedSteps.has(event.step.id)) {
          addEventOrderError(
            errors,
            artifact,
            index,
            `Step '${event.step.id}' was already completed or failed`,
          );
        }
        if (!startedStepIndexes.has(event.step.id)) {
          startedStepIndexes.set(event.step.id, index);
        }
      } else if (!startedStepIndexes.has(event.step.id)) {
        addEventOrderError(
          errors,
          artifact,
          index,
          `Step '${event.step.id}' completed before step_started`,
        );
      } else {
        terminatedSteps.add(event.step.id);
      }
    }

    if (event.type === "run_completed") {
      sawRunCompleted = true;
    }
  });

  for (const [stepId, startIndex] of startedStepIndexes) {
    if (!terminatedSteps.has(stepId)) {
      addEventOrderError(
        errors,
        artifact,
        startIndex,
        `Step '${stepId}' started but never completed or failed`,
      );
    }
  }
}

function validateNodeReference(
  nodeId: string,
  nodeIds: Set<string>,
  artifact: string,
  path: string,
  errors: FixtureValidationError[],
): void {
  if (!nodeIds.has(nodeId)) {
    errors.push({
      code: "node_reference_missing",
      artifact,
      path,
      message: `Node id '${nodeId}' does not match an existing graph node`,
    });
  }
}

function validateNodeReferences(
  values: string[],
  nodeIds: Set<string>,
  artifact: string,
  path: string,
  errors: FixtureValidationError[],
): void {
  values.forEach((nodeId, index) => {
    validateNodeReference(nodeId, nodeIds, artifact, `${path}.${index}`, errors);
  });
}

function validateFileReference(
  path: string,
  fileExists: (path: string) => boolean,
  artifact: string,
  issuePath: string,
  errors: FixtureValidationError[],
): void {
  if (!fileExists(path)) {
    errors.push({
      code: "referenced_file_missing",
      artifact,
      path: issuePath,
      message: `Referenced file '${path}' does not exist under the workspace`,
    });
  }
}

function addEventOrderError(
  errors: FixtureValidationError[],
  artifact: string,
  index: number,
  message: string,
): void {
  errors.push({
    code: "agent_event_order_invalid",
    artifact,
    path: `events.${index}`,
    message,
  });
}

function addFixtureReferenceError(
  errors: FixtureValidationError[],
  artifact: string,
  path: string,
  message: string,
): void {
  errors.push({
    code: "fixture_reference_missing",
    artifact,
    path,
    message,
  });
}

function createWorkspaceFileExists(workspaceRoot: string): (path: string) => boolean {
  const resolvedWorkspace = resolveContainedPath(workspaceRoot, ".");

  return (path: string): boolean => {
    try {
      return statSync(resolveContainedPath(resolvedWorkspace, path)).isFile();
    } catch {
      return false;
    }
  };
}

function formatIssuePath(path: Array<string | number>): string {
  return path.length > 0 ? path.join(".") : "";
}

function pathForDiffFile(path: string): string {
  return path;
}
