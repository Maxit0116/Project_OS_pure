/**
 * Bootstrap a workspace `.projectos/` when opening a repo that has none
 * (or is missing required fixtures), and produce a stable heuristic C4 graph.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import type { CurrentWorkState } from "../contracts/context.js";
import type { ProjectGraph, FileEntry, FunctionalEdge, FunctionalNode } from "../contracts/graph.js";
import { ProjectGraphSchema } from "../contracts/graph.js";
import type { ProjectFramework, ProjectOSProject } from "../contracts/project.js";
import {
  createDefaultSettings,
  ProjectOSSettingsSchema,
  type ProjectOSSettings,
} from "../contracts/settings.js";
import type { SemanticTree, SemanticTreeNode } from "../contracts/semantic-tree.js";
import { ProjectOSError } from "../errors.js";
import { installStructureGraphScaffolding } from "./structure-graph-install.js";
import { collectWorkspaceTechSignals } from "./structure-graph-l2.js";
import { validateWorkspaceFixtures } from "../validation/validate-fixtures.js";

const SKIP_DIR_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".projectos",
  ".codesee",
  ".cursor",
  ".vscode",
  ".idea",
  ".agents",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "target",
  "vendor",
  "Pods",
  "DerivedData",
]);

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".html",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".md",
  ".sql",
]);

const PRIMARY_CONTAINER_DIRS = [
  "frontend",
  "backend",
  "src",
  "app",
  "apps",
  "packages",
  "server",
  "client",
  "web",
  "api",
  "lib",
  "services",
  "desktop",
  "mobile",
];

const MAX_INDEXED_FILES = 800;


export interface WorkspaceBootstrapResult {
  bootstrapped: boolean;
  workspaceRoot: string;
  projectOSRoot: string;
  projectId: string;
  created: string[];
  graphNodeCount: number;
  graphFileCount: number;
}

function writeJsonIfMissing(path: string, value: unknown, created: string[]): void {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  created.push(path);
}

function writeJson(path: string, value: unknown, created: string[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  created.push(path);
}


function detectFramework(workspaceRoot: string): ProjectFramework {
  const packageJsonPath = join(workspaceRoot, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) {
        return existsSync(join(workspaceRoot, "app")) ||
          existsSync(join(workspaceRoot, "src", "app"))
          ? "nextjs-app"
          : "nextjs-pages";
      }
      return "node";
    } catch {
      return "node";
    }
  }
  if (
    existsSync(join(workspaceRoot, "requirements.txt")) ||
    existsSync(join(workspaceRoot, "pyproject.toml")) ||
    existsSync(join(workspaceRoot, "main.py"))
  ) {
    return "unknown";
  }
  return "unknown";
}

function classifyFileType(relativePath: string): FileEntry["type"] {
  const lower = relativePath.toLowerCase();
  const ext = extname(lower);
  if (/(^|\/)(test|tests|__tests__|spec)(\/|$)/.test(lower) || /\.(test|spec)\./.test(lower)) {
    return "test";
  }
  if (ext === ".css" || ext === ".scss") return "style";
  if (
    lower.endsWith("package.json") ||
    lower.endsWith("tsconfig.json") ||
    lower.includes("config") ||
    ext === ".yml" ||
    ext === ".yaml" ||
    ext === ".toml"
  ) {
    return "config";
  }
  if (/(^|\/)(api|routes|routers)(\/|$)/.test(lower) || lower.includes("router")) return "api";
  if (/(^|\/)(pages|page)(\/|$)/.test(lower) || lower.endsWith("index.html")) return "page";
  if (/(^|\/)(components?|ui)(\/|$)/.test(lower)) return "component";
  if (/(^|\/)(lib|utils|helpers|services)(\/|$)/.test(lower)) return "lib";
  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"].includes(ext)) return "asset";
  return "other";
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.length > 0 ? slug : "module";
}

function listTopLevelContainers(workspaceRoot: string): string[] {
  const entries = readdirSync(workspaceRoot, { withFileTypes: true });
  const preferred = PRIMARY_CONTAINER_DIRS.filter((name) =>
    entries.some((entry) => entry.isDirectory() && entry.name === name),
  );

  if (preferred.includes("packages")) {
    const packagesRoot = join(workspaceRoot, "packages");
    try {
      const nested = readdirSync(packagesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => `packages/${entry.name}`);
      return [...preferred.filter((name) => name !== "packages"), ...nested];
    } catch {
      /* fall through */
    }
  }

  if (preferred.length > 0) return preferred;

  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        !SKIP_DIR_NAMES.has(entry.name) &&
        !entry.name.endsWith(".app"),
    )
    .map((entry) => entry.name)
    .slice(0, 12);
}

function collectSourceFiles(
  workspaceRoot: string,
  containerRelativeRoots: string[],
): Array<{ path: string; size: number }> {
  const files: Array<{ path: string; size: number }> = [];
  const roots =
    containerRelativeRoots.length > 0
      ? containerRelativeRoots.map((path) => join(workspaceRoot, path))
      : [workspaceRoot];

  const walk = (absoluteDir: string): void => {
    if (files.length >= MAX_INDEXED_FILES) return;
    let entries;
    try {
      entries = readdirSync(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_INDEXED_FILES) return;
      if (entry.name.startsWith(".") || SKIP_DIR_NAMES.has(entry.name)) continue;
      if (entry.name.endsWith(".app")) continue;
      const absolutePath = join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!CODE_EXTENSIONS.has(ext)) continue;
      const rel = relative(workspaceRoot, absolutePath).split(sep).join("/");
      if (rel.startsWith(".projectos/") || rel.startsWith(".codesee/")) continue;
      let size = 0;
      try {
        size = statSync(absolutePath).size;
      } catch {
        size = 0;
      }
      files.push({ path: rel, size });
    }
  };

  for (const root of roots) {
    if (existsSync(root)) walk(root);
  }
  return files;
}

function layerForContainer(relativeRoot: string): "experience" | "application" | "infrastructure" {
  const name = relativeRoot.toLowerCase();
  if (
    name.includes("frontend") ||
    name.includes("web") ||
    name.includes("client") ||
    name.includes("ui") ||
    name.includes("mobile") ||
    name.includes("desktop")
  ) {
    return "experience";
  }
  if (
    name.includes("infra") ||
    name.includes("ops") ||
    name.includes("deploy") ||
    name.includes("data")
  ) {
    return "infrastructure";
  }
  return "application";
}

function technologyForContainer(
  relativeRoot: string,
  workspaceRoot: string,
  preferred?: string[],
): string {
  if (preferred?.[0]) return preferred[0];
  const absolute = join(workspaceRoot, relativeRoot);
  if (existsSync(join(absolute, "package.json"))) return "JavaScript/TypeScript";
  if (existsSync(join(absolute, "go.mod"))) return "Go";
  if (
    existsSync(join(absolute, "requirements.txt")) ||
    existsSync(join(absolute, "pyproject.toml")) ||
    readdirSync(absolute, { withFileTypes: true }).some(
      (entry) => entry.isFile() && entry.name.endsWith(".py"),
    )
  ) {
    return "Python";
  }
  if (existsSync(join(absolute, "Dockerfile")) || existsSync(join(absolute, "dockerfile"))) {
    return "Container";
  }
  return "Mixed";
}

function listManifestContainerRoots(workspaceRoot: string): string[] {
  const roots = new Set<string>();
  const candidates = [
    "",
    ...PRIMARY_CONTAINER_DIRS,
    "services",
    "apps",
  ];
  for (const rel of candidates) {
    const absolute = rel ? join(workspaceRoot, rel) : workspaceRoot;
    if (!existsSync(absolute)) continue;
    const hasManifest =
      existsSync(join(absolute, "package.json")) ||
      existsSync(join(absolute, "go.mod")) ||
      existsSync(join(absolute, "pyproject.toml")) ||
      existsSync(join(absolute, "requirements.txt")) ||
      existsSync(join(absolute, "Dockerfile")) ||
      existsSync(join(absolute, "dockerfile"));
    if (!hasManifest) continue;
    if (rel) roots.add(rel);
  }
  return [...roots];
}

export function buildHeuristicProjectGraph(input: {
  projectId: string;
  projectName: string;
  projectType: ProjectFramework;
  workspaceRoot: string;
}): ProjectGraph {
  const analyzedAt = new Date().toISOString();
  const signals = collectWorkspaceTechSignals(input.workspaceRoot);
  const dirContainers = listTopLevelContainers(input.workspaceRoot);
  const manifestRoots = listManifestContainerRoots(input.workspaceRoot);
  const containers = [
    ...new Set([
      ...dirContainers,
      ...manifestRoots.filter((root) => !dirContainers.includes(root)),
    ]),
  ].slice(0, 12);
  const systemId = "system_root";
  const nodes: FunctionalNode[] = [];
  const edges: FunctionalEdge[] = [];
  const fileIndex: FileEntry[] = [];

  const containerIds: string[] = [];
  const componentIdsByContainer = new Map<string, string>();

  nodes.push({
    id: systemId,
    type: "capability",
    name: input.projectName,
    status: "active",
    description: `${input.projectName} software system`,
    summary: `Heuristic architecture for ${input.projectName}.`,
    responsibility: "Owns the product boundary for this workspace.",
    elementType: "software_system",
    level: "context",
    layer: "application",
    technology:
      signals.webTechnologies[0] ??
      signals.serverTechnologies[0] ??
      input.projectType,
    linkedFiles: [],
    upstream: [],
    downstream: [],
    confidence: 0.55,
    tags: ["heuristic", "bootstrap"],
    children: [],
    notes: "Bootstrap heuristic graph; run AI structure scan to refine.",
    openQuestions: ["Confirm primary system boundary and actor set."],
  });

  nodes.push({
    id: "person_user",
    type: "capability",
    name: "User",
    status: "active",
    description: "Primary human actor using the system",
    summary: "End user of the product.",
    responsibility: "Uses the software system.",
    elementType: "person",
    level: "context",
    layer: "experience",
    linkedFiles: [],
    upstream: [],
    downstream: [systemId],
    confidence: 0.5,
    tags: ["heuristic", "bootstrap"],
    children: [],
  });
  edges.push({
    id: "edge_person_user_uses_system",
    source: "person_user",
    target: systemId,
    relation: "uses",
    label: "Uses",
    purpose: "Primary user interaction",
    technology: "UI",
    confidence: 0.5,
    evidence: "Default person actor for C4 context",
  });

  for (const externalName of signals.externalSystemNames.slice(0, 4)) {
    const id = `external_${slugify(externalName)}`;
    nodes.push({
      id,
      type: "capability",
      name: externalName,
      status: "active",
      description: `External system ${externalName}`,
      summary: `Third-party dependency detected from package manifests.`,
      responsibility: `Provides ${externalName} capabilities to the system.`,
      elementType: "external_system",
      level: "context",
      layer: "infrastructure",
      technology: externalName,
      linkedFiles: [],
      upstream: [],
      downstream: [],
      confidence: 0.55,
      tags: ["heuristic", "bootstrap", "External"],
      children: [],
      notes: `Detected via dependency on ${externalName}.`,
    });
    edges.push({
      id: `edge_${systemId}_uses_${id}`,
      source: systemId,
      target: id,
      relation: "uses",
      label: "Uses",
      purpose: "External SaaS / cloud dependency",
      technology: "HTTPS",
      confidence: 0.5,
      evidence: `Dependency signal for ${externalName}`,
    });
  }

  for (const containerPath of containers) {
    const id = `container_${slugify(containerPath)}`;
    const componentId = `component_${slugify(containerPath)}`;
    const layer = layerForContainer(containerPath);
    const preferredTech =
      layer === "experience"
        ? signals.webTechnologies
        : layer === "infrastructure"
          ? signals.serverTechnologies
          : [...signals.serverTechnologies, ...signals.webTechnologies];
    const technology = technologyForContainer(
      containerPath,
      input.workspaceRoot,
      preferredTech,
    );
    containerIds.push(id);
    componentIdsByContainer.set(containerPath, componentId);

    nodes.push({
      id,
      type: "capability",
      name: containerPath,
      status: "active",
      description: `Container for ${containerPath}`,
      summary: `Filesystem container rooted at ${containerPath}/.`,
      responsibility: `Owns source under ${containerPath}/.`,
      elementType: "container",
      level: "container",
      layer,
      technology,
      linkedFiles: [],
      upstream: [],
      downstream: [],
      confidence: 0.6,
      tags: ["heuristic", "bootstrap"],
      parentId: systemId,
      children: [componentId],
      openQuestions: [`Is ${containerPath} a deployable container boundary?`],
    });

    nodes.push({
      id: componentId,
      type: "capability",
      name: `${basename(containerPath)} module`,
      status: "active",
      description: `Primary component for ${containerPath}`,
      summary: `Groups files under ${containerPath}/.`,
      responsibility: `Implements responsibilities in ${containerPath}/.`,
      elementType: "component",
      level: "component",
      layer,
      technology,
      linkedFiles: [],
      upstream: [],
      downstream: [],
      confidence: 0.55,
      tags: ["heuristic", "bootstrap"],
      parentId: id,
      children: [],
    });
  }

  for (const tech of signals.dataStoreTechnologies.slice(0, 3)) {
    const id = `datastore_${slugify(tech)}`;
    if (nodes.some((node) => node.id === id)) continue;
    containerIds.push(id);
    nodes.push({
      id,
      type: "capability",
      name: tech,
      status: "active",
      description: `${tech} data store`,
      summary: `Data store inferred from repository manifests.`,
      responsibility: `Persists application data via ${tech}.`,
      elementType: "data_store",
      level: "container",
      layer: "infrastructure",
      technology: tech,
      linkedFiles: [],
      upstream: [],
      downstream: [],
      confidence: 0.6,
      tags: ["heuristic", "bootstrap", "data_store"],
      parentId: systemId,
      children: [],
      notes: signals.dataStorePathHints[0]
        ? `Path hint: ${signals.dataStorePathHints[0]}`
        : undefined,
    });
  }

  for (const tech of signals.queueTechnologies.slice(0, 2)) {
    const id = `queue_${slugify(tech)}`;
    if (nodes.some((node) => node.id === id)) continue;
    containerIds.push(id);
    nodes.push({
      id,
      type: "capability",
      name: tech,
      status: "active",
      description: `${tech} messaging`,
      summary: `Queue / broker inferred from repository manifests.`,
      responsibility: `Transports async messages via ${tech}.`,
      elementType: "container",
      level: "container",
      layer: "infrastructure",
      technology: tech,
      linkedFiles: [],
      upstream: [],
      downstream: [],
      confidence: 0.55,
      tags: ["heuristic", "bootstrap", "queue"],
      parentId: systemId,
      children: [],
    });
  }

  const system = nodes.find((node) => node.id === systemId)!;
  system.children = containerIds;
  system.downstream = [
    ...containerIds,
    ...nodes
      .filter((node) => node.elementType === "external_system")
      .map((node) => node.id),
  ];

  for (let index = 0; index < containerIds.length - 1; index += 1) {
    const source = containerIds[index]!;
    const target = containerIds[index + 1]!;
    const sourceNode = nodes.find((node) => node.id === source)!;
    const targetNode = nodes.find((node) => node.id === target)!;
    sourceNode.downstream = [...sourceNode.downstream, target];
    targetNode.upstream = [...targetNode.upstream, source];
    const relation =
      targetNode.elementType === "data_store" ? "reads_from" : "depends_on";
    const technology =
      targetNode.elementType === "data_store"
        ? "SQL"
        : /kafka|rabbit|nats|sqs|pubsub/i.test(targetNode.technology ?? "")
          ? targetNode.technology
          : "HTTPS";
    edges.push({
      id: `edge_${source}_to_${target}`,
      source,
      target,
      relation,
      label:
        relation === "reads_from"
          ? "Reads from and writes to"
          : `${sourceNode.name} → ${targetNode.name}`,
      purpose: "Heuristic adjacency from repository layout",
      technology,
      confidence: 0.4,
      evidence: `Inferred from top-level directories ${sourceNode.name} and ${targetNode.name}`,
    });
  }

  const sourceFiles = collectSourceFiles(input.workspaceRoot, containers);
  for (const file of sourceFiles) {
    const ownerContainer =
      containers.find(
        (container) => file.path === container || file.path.startsWith(`${container}/`),
      ) ?? containers[0];
    const ownerComponentId = ownerContainer
      ? componentIdsByContainer.get(ownerContainer)
      : undefined;
    const nodeIds = ownerComponentId ? [ownerComponentId] : [];
    fileIndex.push({
      path: file.path,
      type: classifyFileType(file.path),
      nodeIds,
      imports: [],
      exports: [],
      status: "normal",
      size: file.size,
    });
    if (ownerComponentId) {
      const owner = nodes.find((node) => node.id === ownerComponentId);
      if (owner && owner.linkedFiles.length < 64) {
        owner.linkedFiles.push({
          path: file.path,
          role: owner.linkedFiles.length === 0 ? "primary" : "supporting",
        });
      }
    }
  }

  return {
    version: "0.4.0",
    projectId: input.projectId,
    projectName: input.projectName,
    projectType: input.projectType,
    analyzedAt,
    analysisStatus: "partial",
    authored: false,
    architecture: {
      notation: "c4",
      defaultLevel: "component",
      layers: [
        {
          id: "experience",
          label: "Experience",
          order: 0,
          description: "User-facing clients and presentation",
        },
        {
          id: "application",
          label: "Application",
          order: 1,
          description: "Application services and product logic",
        },
        {
          id: "infrastructure",
          label: "Infrastructure",
          order: 2,
          description: "Platform, data, and operational concerns",
        },
      ],
    },
    nodes,
    edges,
    fileIndex,
    topology: {
      rootIds: ["person_user", systemId],
      maxDepth: 2,
      totalNodes: nodes.length,
    },
    analysisError: null,
  };
}

export function buildHeuristicSemanticTree(input: {
  projectId: string;
  projectName: string;
  graph: ProjectGraph;
}): SemanticTree {
  const roots: SemanticTreeNode[] = input.graph.nodes
    .filter((node) => node.level === "container")
    .map((node) => ({
      id: `tree_${node.id}`,
      label: node.name,
      kind: "folder" as const,
      // Omit path: fixture validation requires referenced paths to be files, not directories.
      sourceNodeId: node.id,
      status: "normal" as const,
      children: input.graph.nodes
        .filter((child) => child.parentId === node.id)
        .map((child) => ({
          id: `tree_${child.id}`,
          label: child.name,
          kind: "feature" as const,
          sourceNodeId: child.id,
          status: "normal" as const,
          children: [],
        })),
    }));

  if (roots.length === 0) {
    roots.push({
      id: "tree_root",
      label: input.projectName,
      kind: "folder",
      status: "normal",
      children: [],
    });
  }

  return {
    version: "0.1.0",
    projectId: input.projectId,
    generatedAt: new Date().toISOString(),
    roots,
  };
}


function pickDefined(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

const GRAPH_ROOT_KEYS = [
  "version",
  "projectId",
  "projectName",
  "projectType",
  "analyzedAt",
  "analysisStatus",
  "architecture",
  "nodes",
  "edges",
  "fileRelations",
  "fileIndex",
  "topology",
  "analysisError",
] as const;

const NODE_KEYS = [
  "id",
  "type",
  "name",
  "nameEn",
  "status",
  "description",
  "summary",
  "responsibility",
  "elementType",
  "level",
  "layer",
  "technology",
  "linkedFiles",
  "upstream",
  "downstream",
  "preview",
  "confidence",
  "tags",
  "parentId",
  "children",
  "refs",
  "depth",
] as const;

const EDGE_KEYS = [
  "id",
  "source",
  "target",
  "relation",
  "label",
  "purpose",
  "technology",
  "confidence",
  "evidence",
] as const;

const FILE_ENTRY_KEYS = [
  "path",
  "type",
  "nodeIds",
  "imports",
  "exports",
  "status",
  "size",
  "lastModified",
] as const;

function fileExistsUnderWorkspace(workspaceRoot: string, relativePath: string): boolean {
  try {
    return existsSync(join(workspaceRoot, relativePath));
  } catch {
    return false;
  }
}

/**
 * Strip legacy / foreign keys from older Project OS / analyzer graphs so Zod `.strict()` accepts them.
 * Also drops file refs that no longer exist on disk (validation requires real files).
 */
export function sanitizeLegacyProjectGraph(
  raw: unknown,
  options: { workspaceRoot: string; projectId: string },
): ProjectGraph | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const root = raw as Record<string, unknown>;
  const nodesIn = Array.isArray(root.nodes) ? root.nodes : [];
  const edgesIn = Array.isArray(root.edges) ? root.edges : [];
  const fileIndexIn = Array.isArray(root.fileIndex) ? root.fileIndex : [];

  const nodes = nodesIn
    .filter((node): node is Record<string, unknown> => !!node && typeof node === "object")
    .map((node) => {
      const picked = pickDefined(node, NODE_KEYS);
      const linkedFiles = Array.isArray(node.linkedFiles)
        ? node.linkedFiles
            .filter(
              (file): file is Record<string, unknown> =>
                !!file && typeof file === "object" && typeof file.path === "string",
            )
            .filter((file) =>
              fileExistsUnderWorkspace(options.workspaceRoot, String(file.path)),
            )
            .map((file) => ({
              path: String(file.path),
              role:
                file.role === "primary" ||
                file.role === "supporting" ||
                file.role === "test" ||
                file.role === "config"
                  ? file.role
                  : "supporting",
              ...(typeof file.summary === "string" ? { summary: file.summary } : {}),
            }))
        : [];
      return { ...picked, linkedFiles };
    });

  const edges = edgesIn
    .filter((edge): edge is Record<string, unknown> => !!edge && typeof edge === "object")
    .map((edge) => pickDefined(edge, EDGE_KEYS));

  const fileIndex = fileIndexIn
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object" && typeof entry.path === "string",
    )
    .filter((entry) => fileExistsUnderWorkspace(options.workspaceRoot, String(entry.path)))
    .map((entry) => pickDefined(entry, FILE_ENTRY_KEYS));

  const projectTypeRaw = root.projectType;
  const projectType =
    projectTypeRaw === "nextjs-app" ||
    projectTypeRaw === "nextjs-pages" ||
    projectTypeRaw === "node" ||
    projectTypeRaw === "unknown"
      ? projectTypeRaw
      : "unknown";

  const defaultArchitecture = {
    notation: "c4",
    defaultLevel: "component",
    layers: [
      {
        id: "experience",
        label: "Experience",
        order: 0,
        description: "User-facing clients and presentation",
      },
      {
        id: "application",
        label: "Application",
        order: 1,
        description: "Application services and product logic",
      },
      {
        id: "infrastructure",
        label: "Infrastructure",
        order: 2,
        description: "Platform, data, and operational concerns",
      },
    ],
  };

  const architecture =
    root.architecture && typeof root.architecture === "object"
      ? root.architecture
      : defaultArchitecture;

  // Ensure architecture nodes have required fields when any architecture field is present.
  const normalizedNodes = nodes.map((node) => {
    const hasAnyArch = Boolean(
      node.level || node.elementType || node.layer || node.responsibility,
    );
    if (!hasAnyArch) return node;
    return {
      ...node,
      level: node.level ?? "component",
      elementType: node.elementType ?? "component",
      layer: node.layer ?? "application",
      responsibility:
        typeof node.responsibility === "string" && node.responsibility.length > 0
          ? node.responsibility
          : `Owns ${String(node.name ?? "module")}`,
    };
  });

  const candidate = {
    ...pickDefined(root, GRAPH_ROOT_KEYS),
    projectId: options.projectId,
    projectType,
    architecture,
    nodes: normalizedNodes,
    edges,
    fileIndex,
  };

  const parsed = ProjectGraphSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;

  // Soften required optional empties then retry once.
  const softened = {
    ...candidate,
    edges: candidate.edges ?? [],
    fileIndex: candidate.fileIndex ?? [],
    analysisStatus:
      typeof candidate.analysisStatus === "string" &&
      ["complete", "partial", "demo_fixture", "error"].includes(
        String(candidate.analysisStatus),
      )
        ? candidate.analysisStatus
        : "partial",
    analysisError:
      candidate.analysisError === undefined ? null : candidate.analysisError,
  };
  const again = ProjectGraphSchema.safeParse(softened);
  return again.success ? again.data : null;
}

function resolveSampleWorkspaceRootForBootstrap(): string | null {
  const fromEnv = process.env.PROJECTOS_SAMPLE_WORKSPACE;
  if (fromEnv && existsSync(fromEnv)) return resolve(fromEnv);
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../sample-graph-saas"),
    resolve(here, "../../../sample-graph-saas"),
    resolve(process.cwd(), "../sample-graph-saas"),
    resolve(process.cwd(), "sample-graph-saas"),
    resolve(process.cwd(), "../../sample-graph-saas"),
  ];
  return candidates.find((path) => existsSync(join(path, ".projectos", "settings.json"))) ?? null;
}

/**
 * Dev/test convenience: reuse sample workspace model profiles (and their apiKeyRef)
 * so local repos can call the same configured model without re-entering keys.
 */
export function seedModelSettingsFromSample(input: {
  projectOSRoot: string;
  projectId: string;
  created: string[];
}): boolean {
  const settingsPath = join(input.projectOSRoot, "settings.json");
  let existing: ProjectOSSettings | null = null;
  if (existsSync(settingsPath)) {
    try {
      existing = ProjectOSSettingsSchema.parse(
        JSON.parse(readFileSync(settingsPath, "utf8")) as unknown,
      );
    } catch {
      existing = null;
    }
  }
  if (existing && existing.modelProfiles.length > 0) return false;

  const sampleRoot = resolveSampleWorkspaceRootForBootstrap();
  if (!sampleRoot) return false;
  const sampleSettingsPath = join(sampleRoot, ".projectos", "settings.json");
  if (!existsSync(sampleSettingsPath)) return false;

  let sample: ProjectOSSettings;
  try {
    sample = ProjectOSSettingsSchema.parse(
      JSON.parse(readFileSync(sampleSettingsPath, "utf8")) as unknown,
    );
  } catch {
    return false;
  }
  if (sample.modelProfiles.length === 0) return false;

  const base = existing ?? createDefaultSettings(input.projectId, false);
  const next: ProjectOSSettings = {
    ...base,
    projectId: input.projectId,
    updatedAt: new Date().toISOString(),
    modelProfiles: sample.modelProfiles.map((profile) => ({ ...profile })),
    execution: {
      ...base.execution,
      defaultModelProfileId:
        sample.execution.defaultModelProfileId ??
        sample.modelProfiles.find((profile) => profile.isDefault)?.id ??
        sample.modelProfiles[0]?.id,
    },
  };
  writeJson(settingsPath, ProjectOSSettingsSchema.parse(next), input.created);
  return true;
}

function requiredFixturesMissing(projectOSRoot: string): boolean {
  return (
    !existsSync(join(projectOSRoot, "project.json")) ||
    !existsSync(join(projectOSRoot, "graph.json")) ||
    !existsSync(join(projectOSRoot, "semantic-tree.json")) ||
    !existsSync(join(projectOSRoot, "current-work.json"))
  );
}

function loadOrBuildGraph(input: {
  projectOSRoot: string;
  projectId: string;
  displayName: string;
  framework: ProjectFramework;
  workspaceRoot: string;
  created: string[];
}): { graph: ProjectGraph; repairedGraph: boolean } {
  const graphPath = join(input.projectOSRoot, "graph.json");
  if (existsSync(graphPath)) {
    try {
      const raw = JSON.parse(readFileSync(graphPath, "utf8")) as unknown;
      const direct = ProjectGraphSchema.safeParse(raw);
      if (direct.success) {
        if (direct.data.projectId !== input.projectId) {
          const aligned = { ...direct.data, projectId: input.projectId };
          writeJson(graphPath, aligned, input.created);
          return { graph: aligned, repairedGraph: true };
        }
        return { graph: direct.data, repairedGraph: false };
      }

      const sanitized = sanitizeLegacyProjectGraph(raw, {
        workspaceRoot: input.workspaceRoot,
        projectId: input.projectId,
      });
      if (sanitized) {
        writeJson(graphPath, sanitized, input.created);
        return { graph: sanitized, repairedGraph: true };
      }
    } catch {
      /* rebuild below */
    }
  }

  const graph = buildHeuristicProjectGraph({
    projectId: input.projectId,
    projectName: input.displayName,
    projectType: input.framework,
    workspaceRoot: input.workspaceRoot,
  });
  writeJson(graphPath, graph, input.created);
  return { graph, repairedGraph: true };
}


/**
 * Ensure `.projectos` exists with loadable fixtures and a heuristic C4 graph.
 * Idempotent for required fixtures.
 */
export function ensureWorkspaceBootstrapped(workspaceRoot: string): WorkspaceBootstrapResult {
  if (workspaceRoot.trim().length === 0) {
    throw new ProjectOSError("invalid_workspace_path", "Workspace path must not be empty");
  }
  if (workspaceRoot.startsWith("mock://")) {
    return {
      bootstrapped: false,
      workspaceRoot,
      projectOSRoot: `${workspaceRoot}/.projectos`,
      projectId: "mock",
      created: [],
      graphNodeCount: 0,
      graphFileCount: 0,
    };
  }
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  if (!existsSync(resolvedWorkspaceRoot) || !statSync(resolvedWorkspaceRoot).isDirectory()) {
    throw new ProjectOSError(
      "invalid_workspace_path",
      `Workspace path does not exist or is not a directory: ${resolvedWorkspaceRoot}`,
    );
  }

  const projectOSRoot = join(resolvedWorkspaceRoot, ".projectos");
  const needsCoreBootstrap =
    !existsSync(projectOSRoot) ||
    !statSync(projectOSRoot).isDirectory() ||
    requiredFixturesMissing(projectOSRoot);

  mkdirSync(projectOSRoot, { recursive: true });
  const created: string[] = [];
  const displayName = basename(resolvedWorkspaceRoot);
  const framework = detectFramework(resolvedWorkspaceRoot);
  const now = new Date().toISOString();

  let projectId: string = randomUUID();
  const existingProjectPath = join(projectOSRoot, "project.json");
  if (existsSync(existingProjectPath)) {
    try {
      const existing = JSON.parse(readFileSync(existingProjectPath, "utf8")) as {
        projectId?: string;
      };
      if (typeof existing.projectId === "string" && existing.projectId.length > 0) {
        projectId = existing.projectId;
      }
    } catch {
      /* recreate below if unreadable */
    }
  }

  const project: ProjectOSProject = {
    version: "0.1.0",
    projectId,
    workspaceRoot: ".",
    displayName,
    framework,
    createdAt: now,
    updatedAt: now,
    presentationMode: false,
  };
  writeJsonIfMissing(existingProjectPath, project, created);

  const { graph, repairedGraph } = loadOrBuildGraph({
    projectOSRoot,
    projectId,
    displayName,
    framework,
    workspaceRoot: resolvedWorkspaceRoot,
    created,
  });

  const semanticTreePath = join(projectOSRoot, "semantic-tree.json");
  if (
    needsCoreBootstrap ||
    repairedGraph ||
    !existsSync(semanticTreePath)
  ) {
    const semanticTree = buildHeuristicSemanticTree({
      projectId,
      projectName: displayName,
      graph,
    });
    if (!existsSync(semanticTreePath) || repairedGraph) {
      writeJson(semanticTreePath, semanticTree, created);
    } else {
      writeJsonIfMissing(semanticTreePath, semanticTree, created);
    }
  }

  if (needsCoreBootstrap || !existsSync(join(projectOSRoot, "current-work.json"))) {
    const currentWork: CurrentWorkState = {
      version: "0.1.0",
      projectId,
      recentChanges: [],
      unresolvedErrors: [],
    };
    writeJsonIfMissing(join(projectOSRoot, "current-work.json"), currentWork, created);
  }

  writeJsonIfMissing(
    join(projectOSRoot, "settings.json"),
    createDefaultSettings(projectId, false),
    created,
  );
  const seededModelSettings = seedModelSettingsFromSample({
    projectOSRoot,
    projectId,
    created,
  });

  const structurePrompts = installStructureGraphScaffolding(resolvedWorkspaceRoot);
  if (structurePrompts.created.length > 0) {
    created.push(...structurePrompts.created);
  }

  const validation = validateWorkspaceFixtures(resolvedWorkspaceRoot);

  // Last-resort: if fixtures still invalid due to graph/tree, force heuristic rewrite.
  if (!validation.ok) {
    const graphErrors = validation.errors.filter((error) => error.artifact === "graph.json");
    if (graphErrors.length > 0) {
      const fallback = buildHeuristicProjectGraph({
        projectId,
        projectName: displayName,
        projectType: framework,
        workspaceRoot: resolvedWorkspaceRoot,
      });
      writeJson(join(projectOSRoot, "graph.json"), fallback, created);
      writeJson(
        semanticTreePath,
        buildHeuristicSemanticTree({
          projectId,
          projectName: displayName,
          graph: fallback,
        }),
        created,
      );
      return {
        bootstrapped: true,
        workspaceRoot: resolvedWorkspaceRoot,
        projectOSRoot,
        projectId,
        created,
        graphNodeCount: fallback.nodes.length,
        graphFileCount: fallback.fileIndex.length,
      };
    }
  }

  const bootstrapped =
    needsCoreBootstrap ||
    created.length > 0 ||
    repairedGraph ||
    seededModelSettings;

  return {
    bootstrapped,
    workspaceRoot: resolvedWorkspaceRoot,
    projectOSRoot,
    projectId,
    created,
    graphNodeCount: graph.nodes.length,
    graphFileCount: graph.fileIndex.length,
  };
}
