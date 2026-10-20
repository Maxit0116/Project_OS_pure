import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

import { cloneJson } from "../utils/json.js";

import {
  CurrentWorkStateSchema,
  type CurrentWorkState,
} from "../contracts/context.js";
import {
  ProjectGraphSchema,
  type ProjectGraph,
} from "../contracts/graph.js";
import {
  GraphProductOverlaySchema,
  type GraphProductOverlay,
} from "../contracts/graph-provenance.js";
import {
  HarnessRecordSchema,
  type HarnessRecord,
} from "../contracts/harness.js";
import {
  ProjectOSProjectSchema,
  type ProjectOSProject,
} from "../contracts/project.js";
import {
  PROJECT_DESCRIPTION_MAX_CHARACTERS,
  ProjectDescriptionSchema,
  type ProjectDescription,
} from "../contracts/project-description.js";
import {
  ProjectOSSettingsSchema,
  createDefaultSettings,
  migrateLegacyMcpExternalAgents,
  type ProjectOSSettings,
} from "../contracts/settings.js";
import {
  SemanticTreeSchema,
  type SemanticTree,
} from "../contracts/semantic-tree.js";
import {
  MapContentDocumentSchema,
  createEmptyMapContent,
  parseMapContentDocument,
  type MapContentDocument,
} from "../contracts/map-content.js";
import { SettingsStore } from "./settings-store.js";
import {
  createDurableFilePersistencePrimitives,
  writeDurableTextReplacing,
  type DurableFilePersistencePrimitives,
} from "./durable-file.js";
import { ProjectOSError } from "../errors.js";
import { composeProjectGraph } from "../services/graph-provenance.js";
import { withProjectWriteTransactionLock } from "../services/project-write-transaction-lock.js";
import { resolveContainedPath } from "../utils/path-containment.js";
import {
  DemoResetSchema,
  DemoScenarioSchema,
  blockingWorkspaceOpenErrors,
  isEdgeTopologyFixtureError,
  type DemoReset,
  type DemoScenario,
  type FixtureValidationError,
  validateWorkspaceFixtures,
} from "../validation/index.js";

export interface LoadedProjectOSWorkspace {
  workspaceRoot: string;
  projectOSRoot: string;
  project: ProjectOSProject;
  projectDescription: ProjectDescription;
  settings: ProjectOSSettings;
  graph: ProjectGraph;
  /** Analyzer-owned source graph. Product reads should use the composed `graph`. */
  graphBase?: ProjectGraph;
  /** Product-authored structural overlay; absent for legacy/unmodified workspaces. */
  graphOverlay?: GraphProductOverlay;
  semanticTree: SemanticTree;
  currentWork: CurrentWorkState;
  demoReset: DemoReset | undefined;
  demoScenarios: Map<string, DemoScenario>;
  harnessRecords: Map<string, HarnessRecord>;
  mapContent: MapContentDocument;
  openingMapContent: MapContentDocument;
  /** In-memory image payloads keyed by assetPath (e.g. map-assets/art_xxx.png). */
  mapAssets: Map<string, string>;
}

export interface PreparedInternalWorkspaceDocument {
  resource: "graph_product_overlay" | "semantic_tree" | "current_work";
  relativePath: string;
  targetPath: string;
  beforeBytes?: Uint8Array;
  afterBytes: Uint8Array;
}

export type WorkspacePersistencePrimitives = DurableFilePersistencePrimitives;

export class ProjectOSWorkspaceStore {
  private readonly settingsStore = new SettingsStore();
  private readonly persistencePrimitives: WorkspacePersistencePrimitives;

  constructor(primitives: Partial<WorkspacePersistencePrimitives> = {}) {
    this.persistencePrimitives = createDurableFilePersistencePrimitives(primitives);
  }

  loadWorkspace(workspaceRoot: string): LoadedProjectOSWorkspace {
    const resolvedWorkspaceRoot = validateWorkspacePath(workspaceRoot);
    let validation = validateWorkspaceFixtures(resolvedWorkspaceRoot);
    if (!validation.ok) {
      const repaired = tryRepairDanglingGraphEdges(
        resolvedWorkspaceRoot,
        validation.errors,
        this.persistencePrimitives,
      );
      if (repaired) {
        validation = validateWorkspaceFixtures(resolvedWorkspaceRoot);
      }
    }
    const blockingErrors = blockingWorkspaceOpenErrors(validation.errors);
    if (blockingErrors.length > 0) {
      throw new ProjectOSError(
        "invalid_workspace_fixtures",
        `Project OS fixtures are invalid for workspace '${resolvedWorkspaceRoot}'`,
        { validationErrors: blockingErrors },
      );
    }

    const projectOSRoot = join(resolvedWorkspaceRoot, ".projectos");
    const project = readJsonContract(
      ProjectOSProjectSchema,
      projectOSRoot,
      "project.json",
    );
    const settings = ProjectOSSettingsSchema.parse(
      migrateLegacyMcpExternalAgents(
        readOptionalJsonContract(
          ProjectOSSettingsSchema,
          projectOSRoot,
          "settings.json",
        ) ?? createDefaultSettings(project.projectId, project.presentationMode),
      ),
    );
    const graphBase = readJsonContract(ProjectGraphSchema, projectOSRoot, "graph.json");
    const graphOverlay = readOptionalJsonContract(
      GraphProductOverlaySchema,
      projectOSRoot,
      "graph-product-overlay.json",
    );
    const graph = composeProjectGraph(graphBase, graphOverlay);
    const storedProjectDescription = readOptionalJsonContract(
      ProjectDescriptionSchema,
      projectOSRoot,
      "project-description.json",
    );
    if (
      storedProjectDescription &&
      storedProjectDescription.projectId !== project.projectId
    ) {
      throw new ProjectOSError(
        "invalid_workspace_fixtures",
        "Project description belongs to a different project",
      );
    }
    const projectDescription = storedProjectDescription ?? deriveProjectDescription(project, graph);
    const semanticTree = readJsonContract(
      SemanticTreeSchema,
      projectOSRoot,
      "semantic-tree.json",
    );
    const currentWork = readJsonContract(
      CurrentWorkStateSchema,
      projectOSRoot,
      "current-work.json",
    );
    const demoReset = readOptionalJsonContract(
      DemoResetSchema,
      projectOSRoot,
      "demo-reset.json",
    );
    const mapContent = readOptionalMapContent(projectOSRoot) ?? createEmptyMapContent(project.projectId);

    return {
      workspaceRoot: resolvedWorkspaceRoot,
      projectOSRoot,
      project,
      projectDescription,
      settings,
      graph,
      graphBase,
      ...(graphOverlay ? { graphOverlay } : {}),
      semanticTree,
      currentWork,
      demoReset,
      demoScenarios: readJsonContractsInDirectory(
        DemoScenarioSchema,
        projectOSRoot,
        "demo-scenarios",
      ),
      harnessRecords: readJsonContractsInDirectory(
        HarnessRecordSchema,
        projectOSRoot,
        "harness",
      ),
      mapContent,
      openingMapContent: cloneJson(mapContent),
      mapAssets: new Map(),
    };
  }

  async writeMapContent(
    workspaceRoot: string,
    mapContent: MapContentDocument,
  ): Promise<MapContentDocument> {
    const resolvedWorkspaceRoot = validateWorkspacePath(workspaceRoot);
    const canonicalWorkspaceRoot = resolveContainedPath(resolvedWorkspaceRoot, ".");
    const parsed = MapContentDocumentSchema.parse(mapContent);
    const targetPath = join(
      canonicalWorkspaceRoot,
      ".projectos",
      "map-content.json",
    );

    try {
      await withProjectWriteTransactionLock(canonicalWorkspaceRoot, async () => {
        writeDurableJsonReplacing(targetPath, parsed, this.persistencePrimitives);
      });
    } catch (error) {
      throw new ProjectOSError(
        "persistence_write_failed",
        `Failed to write map content for '${canonicalWorkspaceRoot}'`,
        { cause: error },
      );
    }

    return parsed;
  }

  prepareGraphOverlayPersistence(
    workspaceRoot: string,
    graphOverlay: GraphProductOverlay,
  ): PreparedInternalWorkspaceDocument {
    const parsed = GraphProductOverlaySchema.parse(graphOverlay);
    const prepared = prepareInternalDocument(
      workspaceRoot,
      "graph_product_overlay",
      "graph-product-overlay.json",
      parsed,
    );
    assertInternalDocumentProject(prepared, parsed.projectId);
    return prepared;
  }

  prepareSemanticTreePersistence(
    workspaceRoot: string,
    semanticTree: SemanticTree,
  ): PreparedInternalWorkspaceDocument {
    const parsed = SemanticTreeSchema.parse(semanticTree);
    const prepared = prepareInternalDocument(
      workspaceRoot,
      "semantic_tree",
      "semantic-tree.json",
      parsed,
    );
    assertInternalDocumentProject(prepared, parsed.projectId);
    return prepared;
  }

  prepareCurrentWorkPersistence(
    workspaceRoot: string,
    currentWork: CurrentWorkState,
  ): PreparedInternalWorkspaceDocument {
    const parsed = CurrentWorkStateSchema.parse(currentWork);
    const prepared = prepareInternalDocument(
      workspaceRoot,
      "current_work",
      "current-work.json",
      parsed,
    );
    assertInternalDocumentProject(prepared, parsed.projectId);
    return prepared;
  }

  async writeCurrentWork(
    workspaceRoot: string,
    currentWork: CurrentWorkState,
  ): Promise<CurrentWorkState> {
    const resolvedWorkspaceRoot = validateWorkspacePath(workspaceRoot);
    const canonicalWorkspaceRoot = resolveContainedPath(resolvedWorkspaceRoot, ".");
    const parsed = CurrentWorkStateSchema.parse(currentWork);
    const targetPath = join(
      canonicalWorkspaceRoot,
      ".projectos",
      "current-work.json",
    );

    try {
      await withProjectWriteTransactionLock(canonicalWorkspaceRoot, async () => {
        writeDurableJsonReplacing(targetPath, parsed, this.persistencePrimitives);
      });
    } catch (error) {
      throw new ProjectOSError(
        "persistence_write_failed",
        `Failed to write current work state for '${canonicalWorkspaceRoot}'`,
        { cause: error },
      );
    }

    return parsed;
  }

  writeSettings(
    workspaceRoot: string,
    settings: ProjectOSSettings,
  ): ProjectOSSettings {
    const resolvedWorkspaceRoot = validateWorkspacePath(workspaceRoot);
    const projectOSRoot = join(resolvedWorkspaceRoot, ".projectos");
    return this.settingsStore.writeSettings(projectOSRoot, settings);
  }

  async writeGraph(
    workspaceRoot: string,
    graph: ProjectGraph,
  ): Promise<ProjectGraph> {
    const resolvedWorkspaceRoot = validateWorkspacePath(workspaceRoot);
    const canonicalWorkspaceRoot = resolveContainedPath(resolvedWorkspaceRoot, ".");
    const parsed = ProjectGraphSchema.parse(graph);
    const targetPath = join(
      canonicalWorkspaceRoot,
      ".projectos",
      "graph.json",
    );

    try {
      await withProjectWriteTransactionLock(canonicalWorkspaceRoot, async () => {
        writeDurableJsonReplacing(targetPath, parsed, this.persistencePrimitives);
      });
    } catch (error) {
      throw new ProjectOSError(
        "persistence_write_failed",
        `Failed to write graph for '${canonicalWorkspaceRoot}'`,
        { cause: error },
      );
    }

    return parsed;
  }

  async writeSemanticTree(
    workspaceRoot: string,
    semanticTree: SemanticTree,
  ): Promise<SemanticTree> {
    const resolvedWorkspaceRoot = validateWorkspacePath(workspaceRoot);
    const canonicalWorkspaceRoot = resolveContainedPath(resolvedWorkspaceRoot, ".");
    const parsed = SemanticTreeSchema.parse(semanticTree);
    const targetPath = join(
      canonicalWorkspaceRoot,
      ".projectos",
      "semantic-tree.json",
    );

    try {
      await withProjectWriteTransactionLock(canonicalWorkspaceRoot, async () => {
        writeDurableJsonReplacing(targetPath, parsed, this.persistencePrimitives);
      });
    } catch (error) {
      throw new ProjectOSError(
        "persistence_write_failed",
        `Failed to write semantic tree for '${canonicalWorkspaceRoot}'`,
        { cause: error },
      );
    }

    return parsed;
  }

  async writeProjectDescription(
    workspaceRoot: string,
    projectDescription: ProjectDescription,
  ): Promise<ProjectDescription> {
    const resolvedWorkspaceRoot = validateWorkspacePath(workspaceRoot);
    const canonicalWorkspaceRoot = resolveContainedPath(resolvedWorkspaceRoot, ".");
    const parsed = ProjectDescriptionSchema.parse(projectDescription);
    const projectOSRoot = join(canonicalWorkspaceRoot, ".projectos");
    const project = readJsonContract(
      ProjectOSProjectSchema,
      projectOSRoot,
      "project.json",
    );
    if (parsed.projectId !== project.projectId) {
      throw new ProjectOSError(
        "invalid_project_description",
        "Project description belongs to a different project",
      );
    }
    const targetPath = join(
      projectOSRoot,
      "project-description.json",
    );

    try {
      await withProjectWriteTransactionLock(canonicalWorkspaceRoot, async () => {
        writeDurableJsonReplacing(targetPath, parsed, this.persistencePrimitives);
      });
    } catch (error) {
      throw new ProjectOSError(
        "persistence_write_failed",
        `Failed to write project description for '${canonicalWorkspaceRoot}'`,
        { cause: error },
      );
    }

    return parsed;
  }
}

function writeDurableJsonReplacing(
  targetPath: string,
  value: unknown,
  primitives: WorkspacePersistencePrimitives,
): void {
  writeDurableTextReplacing(
    targetPath,
    `${JSON.stringify(value, null, 2)}\n`,
    primitives,
  );
}

/**
 * Best-effort open repair: drop empty / dangling / self-loop edges from raw
 * graph.json so a previously corrupted regenerate cannot brick the workspace.
 */
function tryRepairDanglingGraphEdges(
  workspaceRoot: string,
  errors: FixtureValidationError[],
  primitives: WorkspacePersistencePrimitives,
): boolean {
  const edgeRelated = errors.some(isEdgeTopologyFixtureError);
  if (!edgeRelated) return false;

  const graphPath = join(workspaceRoot, ".projectos", "graph.json");
  if (!existsSync(graphPath)) return false;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(graphPath, "utf8")) as unknown;
  } catch {
    return false;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const root = raw as Record<string, unknown>;
  if (!Array.isArray(root.nodes) || !Array.isArray(root.edges)) return false;

  const nodeIds = new Set(
    root.nodes
      .filter(
        (node): node is Record<string, unknown> =>
          !!node && typeof node === "object" && !Array.isArray(node),
      )
      .map((node) => (typeof node.id === "string" ? node.id : ""))
      .filter((id) => id.length > 0),
  );

  const before = root.edges.length;
  const seenIds = new Set<string>();
  root.edges = root.edges.filter((edge) => {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) return false;
    const record = edge as Record<string, unknown>;
    const source = typeof record.source === "string" ? record.source.trim() : "";
    const target = typeof record.target === "string" ? record.target.trim() : "";
    if (
      source.length === 0 ||
      target.length === 0 ||
      source === target ||
      !nodeIds.has(source) ||
      !nodeIds.has(target)
    ) {
      return false;
    }
    const id = typeof record.id === "string" ? record.id : "";
    if (id.length > 0) {
      if (seenIds.has(id)) return false;
      seenIds.add(id);
    }
    return true;
  });

  if (root.edges.length === before) return false;

  try {
    writeDurableJsonReplacing(graphPath, root, primitives);
    return true;
  } catch {
    return false;
  }
}

function deriveProjectDescription(
  project: ProjectOSProject,
  graph: ProjectGraph,
): ProjectDescription {
  const topLevelNodes = graph.nodes.filter((node) => !node.parentId).slice(0, 8);
  const capabilities = topLevelNodes.map((node) => {
    const summary = truncateUnicode(node.summary, 180);
    return `${node.nameEn ?? node.name}: ${summary}`;
  });
  const content = truncateUnicode(
    [
      `${project.displayName} is a ${project.framework} project.`,
      capabilities.length > 0
        ? `Its primary capabilities are ${capabilities.join("; ")}.`
        : "No top-level functional capabilities have been identified yet.",
    ].join(" "),
    PROJECT_DESCRIPTION_MAX_CHARACTERS,
  );
  return ProjectDescriptionSchema.parse({
    version: "0.1.0",
    projectId: project.projectId,
    conciseDescription: content,
    source: "derived",
    updatedAt: graph.analyzedAt,
  });
}

function truncateUnicode(value: string, maxCharacters: number): string {
  const characters = [...value];
  return characters.length <= maxCharacters
    ? value
    : `${characters.slice(0, Math.max(0, maxCharacters - 1)).join("")}…`;
}

function prepareInternalDocument(
  workspaceRoot: string,
  resource: PreparedInternalWorkspaceDocument["resource"],
  fileName: string,
  value: unknown,
): PreparedInternalWorkspaceDocument {
  const resolvedWorkspaceRoot = validateWorkspacePath(workspaceRoot);
  const relativePath = `.projectos/${fileName}`;
  const targetPath = join(resolvedWorkspaceRoot, relativePath);
  return {
    resource,
    relativePath,
    targetPath,
    ...(existsSync(targetPath)
      ? { beforeBytes: readFileSync(targetPath, { encoding: null }) }
      : {}),
    afterBytes: new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`),
  };
}

function assertInternalDocumentProject(
  prepared: PreparedInternalWorkspaceDocument,
  projectId: string,
): void {
  const projectOSRoot = dirname(prepared.targetPath);
  const project = readJsonContract(ProjectOSProjectSchema, projectOSRoot, "project.json");
  if (project.projectId !== projectId) {
    throw new ProjectOSError(
      "invalid_workspace_fixtures",
      `Internal ${prepared.resource} document belongs to a different project`,
    );
  }
}

function validateWorkspacePath(workspaceRoot: string): string {
  if (workspaceRoot.trim().length === 0) {
    throw new ProjectOSError(
      "invalid_workspace_path",
      "Workspace path must not be empty",
    );
  }

  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  if (!existsSync(resolvedWorkspaceRoot)) {
    throw new ProjectOSError(
      "invalid_workspace_path",
      `Workspace path does not exist: ${resolvedWorkspaceRoot}`,
    );
  }

  if (!statSync(resolvedWorkspaceRoot).isDirectory()) {
    throw new ProjectOSError(
      "invalid_workspace_path",
      `Workspace path is not a directory: ${resolvedWorkspaceRoot}`,
    );
  }

  const projectOSRoot = join(resolvedWorkspaceRoot, ".projectos");
  if (!existsSync(projectOSRoot) || !statSync(projectOSRoot).isDirectory()) {
    throw new ProjectOSError(
      "invalid_workspace_path",
      `Workspace does not contain a .projectos directory: ${resolvedWorkspaceRoot}`,
    );
  }

  return resolvedWorkspaceRoot;
}

function readOptionalMapContent(projectOSRoot: string): MapContentDocument | undefined {
  const fullPath = join(projectOSRoot, "map-content.json");
  if (!existsSync(fullPath)) {
    return undefined;
  }

  try {
    return parseMapContentDocument(JSON.parse(readFileSync(fullPath, "utf8")) as unknown);
  } catch (error) {
    throw new ProjectOSError(
      "invalid_workspace_fixtures",
      "Invalid Project OS artifact: map-content.json",
      { cause: error },
    );
  }
}


function readJsonContract<T>(
  schema: z.ZodType<T>,
  projectOSRoot: string,
  relativePath: string,
): T {
  const fullPath = join(projectOSRoot, relativePath);
  if (!existsSync(fullPath)) {
    throw new ProjectOSError(
      "invalid_workspace_fixtures",
      `Missing Project OS artifact: ${relativePath}`,
    );
  }

  try {
    return schema.parse(JSON.parse(readFileSync(fullPath, "utf8")) as unknown);
  } catch (error) {
    throw new ProjectOSError(
      "invalid_workspace_fixtures",
      `Invalid Project OS artifact: ${relativePath}`,
      { cause: error },
    );
  }
}

function readOptionalJsonContract<T>(
  schema: z.ZodType<T>,
  projectOSRoot: string,
  relativePath: string,
): T | undefined {
  const fullPath = join(projectOSRoot, relativePath);
  if (!existsSync(fullPath)) {
    return undefined;
  }
  return readJsonContract(schema, projectOSRoot, relativePath);
}

function readJsonContractsInDirectory<T>(
  schema: z.ZodType<T>,
  projectOSRoot: string,
  relativeDirectory: string,
): Map<string, T> {
  const directory = join(projectOSRoot, relativeDirectory);
  const contracts = new Map<string, T>();

  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return contracts;
  }

  for (const fileName of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
    contracts.set(
      fileName,
      readJsonContract(schema, projectOSRoot, join(relativeDirectory, fileName)),
    );
  }

  return contracts;
}
