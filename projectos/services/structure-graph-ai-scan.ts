/**
 * Direct ModelGateway structure-graph scan (CodeSee-style) — no chat / agent sidebar.
 * Used on first open when the heuristic C4 graph is incomplete / bootstrap-tagged.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import {
  ProjectGraphSchema,
  type FunctionalEdge,
  type FunctionalNode,
  type ProjectGraph,
  type StructureScanMode,
} from "../contracts/graph.js";
import type { ModelProfile } from "../contracts/settings.js";
import { ProjectOSError } from "../errors.js";
import {
  mergeArchitectureViews,
  synthesizeDefaultArchitectureViews,
} from "../shared/c4-architecture-views/index.js";
import {
  buildHeuristicSemanticTree,
  sanitizeLegacyProjectGraph,
} from "./workspace-bootstrap.js";
import { ModelGateway } from "./model-gateway/index.js";
import type { SemanticTree } from "../contracts/semantic-tree.js";
import {
  assessL2GraphQuality,
  assignFilesToComponents,
  buildFileIndexAndRelations,
  collectRepoFiles,
  collectWorkspaceTechSignals,
  defaultArchitecture,
  detectReadmeLanguage,
  enrichNodesForC4Shapes,
  ensureEdgeFields,
  mergeStructureGraphs,
  rebuildHierarchy,
  type ScanLanguage,
} from "./structure-graph-l2.js";

export const AI_SCAN_GRAPH_GENERATOR_TAG = "ai-scan";
export const BOOTSTRAP_GRAPH_TAGS = new Set(["heuristic", "bootstrap"]);

export interface GraphCompletenessResult {
  complete: boolean;
  reasons: string[];
  score: number;
}

/**
 * Quality / gate assessment: heuristic / incomplete graphs need AI scan.
 */
export function assessGraphCompleteness(
  graph: ProjectGraph | null | undefined,
): GraphCompletenessResult {
  const reasons: string[] = [];
  if (!graph || graph.nodes.length === 0) {
    return { complete: false, reasons: ["missing_or_empty_graph"], score: 0 };
  }

  if (graph.analysisStatus !== "complete") {
    reasons.push(`analysis_status:${graph.analysisStatus}`);
  }

  const taggedBootstrap = graph.nodes.filter((node) =>
    (node.tags ?? []).some((tag) => BOOTSTRAP_GRAPH_TAGS.has(tag)),
  );
  if (taggedBootstrap.length > 0) {
    reasons.push(`bootstrap_or_heuristic_tags:${taggedBootstrap.length}`);
  }

  const systems = graph.nodes.filter(
    (node) =>
      node.level === "context" || node.elementType === "software_system",
  );
  const containers = graph.nodes.filter(
    (node) =>
      node.level === "container" || node.elementType === "container",
  );
  const components = graph.nodes.filter(
    (node) =>
      node.level === "component" || node.elementType === "component",
  );
  if (systems.length < 1) reasons.push("missing_system");
  if (containers.length < 1) reasons.push("missing_container");
  if (components.length < 1) reasons.push("missing_component");

  const thinDescriptions = graph.nodes.filter((node) => {
    const text = `${node.description ?? ""} ${node.summary ?? ""}`.trim();
    return text.length < 24 || /^(Container|Primary component|Heuristic)/i.test(text);
  });
  if (thinDescriptions.length >= Math.ceil(graph.nodes.length * 0.7)) {
    reasons.push("descriptions_too_thin");
  }

  const importsEmpty = graph.fileIndex.every(
    (entry) => entry.imports.length === 0 && entry.exports.length === 0,
  );
  const onlyAdjacentDepends =
    graph.edges.length > 0 &&
    graph.edges.every((edge) => edge.relation === "depends_on") &&
    graph.edges.every((edge) =>
      /Heuristic adjacency|repository layout/i.test(
        `${edge.purpose ?? ""} ${edge.evidence ?? ""}`,
      ),
    );
  if (importsEmpty && onlyAdjacentDepends) {
    reasons.push("empty_deps_and_adjacent_depends_on");
  }

  const score = Math.max(0, 100 - reasons.length * 16);
  return {
    complete: reasons.length === 0,
    reasons,
    score,
  };
}

export function graphNeedsAiScan(
  graph: ProjectGraph | null | undefined,
): boolean {
  return !assessGraphCompleteness(graph).complete;
}

/** Project semantic tree from a structure graph (left-rail / map tree). */
export function projectSemanticTreeFromGraph(input: {
  projectId: string;
  projectName: string;
  graph: ProjectGraph;
}): SemanticTree {
  return buildHeuristicSemanticTree(input);
}

function readTextCapped(path: string, maxChars: number): string | null {
  try {
    if (!existsSync(path) || !statSync(path).isFile()) return null;
    const raw = readFileSync(path, "utf8");
    return raw.length > maxChars ? `${raw.slice(0, maxChars)}\n…[truncated]` : raw;
  } catch {
    return null;
  }
}

function collectFileTree(workspaceRoot: string, limit = 120): string[] {
  return collectRepoFiles(workspaceRoot, limit);
}

function pickSnippetPaths(filePaths: string[]): string[] {
  const preferred = [
    "README.md",
    "readme.md",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "main.py",
    "app.py",
    "src/index.ts",
    "src/main.ts",
    "src/App.tsx",
    "app/page.tsx",
  ];
  const picked: string[] = [];
  for (const path of preferred) {
    if (filePaths.includes(path)) picked.push(path);
  }
  for (const path of filePaths) {
    if (picked.length >= 12) break;
    if (picked.includes(path)) continue;
    if (
      /(^|\/)(page|route|router|main|index|app)\.[a-z]+$/i.test(path) ||
      path.endsWith(".py") ||
      path.includes("/api/")
    ) {
      picked.push(path);
    }
  }
  return picked.slice(0, 12);
}

export function buildRepoScanContext(input: {
  workspaceRoot: string;
  displayName: string;
  graph: ProjectGraph;
}): string {
  const fromGraph = input.graph.fileIndex.map((entry) => entry.path).slice(0, 100);
  const walked = collectFileTree(input.workspaceRoot, 120);
  const filePaths = Array.from(new Set([...fromGraph, ...walked])).slice(0, 140);
  const snippets = pickSnippetPaths(filePaths)
    .map((relativePath) => {
      const body = readTextCapped(join(input.workspaceRoot, relativePath), 2500);
      if (!body) return null;
      return `### ${relativePath}\n\`\`\`\n${body}\n\`\`\``;
    })
    .filter((value): value is string => Boolean(value));

  const containers = input.graph.nodes
    .filter((node) => node.level === "container" || node.level === "component")
    .map((node) => `- ${node.id}: ${node.name} (${node.level ?? "node"})`)
    .slice(0, 40);

  return [
    `# Repository: ${input.displayName}`,
    "",
    "## File paths (sample)",
    ...filePaths.slice(0, 100).map((path) => `- ${path}`),
    "",
    "## Architecture nodes (heuristic)",
    ...(containers.length > 0 ? containers : ["(none)"]),
    "",
    "## Key file snippets",
    ...snippets,
  ].join("\n");
}

function loadPromptBundle(workspaceRoot: string): string {
  const promptsRoot = join(workspaceRoot, ".projectos", "prompts");
  const read = (name: string): string => {
    const path = join(promptsRoot, name);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  };
  return [
    read("structure-scan.md") || "# Structure Scan\nProduce ProjectGraph JSON",
    "",
    "## Schema",
    read("_schema.md").slice(0, 6000),
    "",
    "## Rules",
    read("_rules.md").slice(0, 4000),
  ].join("\n");
}

/**
 * Close truncated model JSON when max tokens cut mid-object.
 * Also strips incomplete trailing keys/values that salvage would otherwise
 * leave as invalid JSON (e.g. `"foo` without `:`).
 */
function salvageTruncatedJsonObject(source: string): string | null {
  const start = source.indexOf("{");
  if (start < 0) return null;
  let fragment = source.slice(start).trim();
  let inString = false;
  let escaped = false;
  for (let index = 0; index < fragment.length; index += 1) {
    const character = fragment[index]!;
    if (!inString) {
      if (character === '"') inString = true;
      continue;
    }
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') inString = false;
  }
  if (inString) {
    fragment = `${fragment}"`;
  }

  // Drop incomplete trailing property: `"key` / `"key":` / `"key": value-cut`
  // until the tail is a valid structural end (`,` `{` `[` or a complete value).
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const before = fragment;
    fragment = fragment
      .replace(/,\s*"[^"]*"\s*:\s*("[^"]*")?\s*$/u, "")
      .replace(/,\s*"[^"]*"\s*:\s*-?\d+\.?\d*\s*$/u, "")
      .replace(/,\s*"[^"]*"\s*:\s*(true|false|null)\s*$/u, "")
      .replace(/,\s*"[^"]*"\s*:?\s*$/u, "")
      .replace(/,\s*$/u, "");
    if (fragment === before) break;
  }

  const stack: string[] = [];
  inString = false;
  escaped = false;
  for (let index = 0; index < fragment.length; index += 1) {
    const character = fragment[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      const expected = character === "}" ? "{" : "[";
      if (stack[stack.length - 1] === expected) stack.pop();
    }
  }
  if (stack.length === 0) return null;
  fragment = fragment.replace(/,\s*$/u, "");
  while (stack.length > 0) {
    const open = stack.pop();
    fragment += open === "{" ? "}" : "]";
  }
  return fragment;
}

function extractJsonObjectCandidates(output: string): string[] {
  const sources = [
    ...Array.from(output.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)).map(
      (match) => match[1] ?? "",
    ),
    output,
  ];
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (candidate: string): void => {
    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    candidates.push(trimmed);
  };
  for (const source of sources) {
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index]!;
      if (start < 0) {
        if (character === "{") {
          start = index;
          depth = 1;
          inString = false;
          escaped = false;
        }
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          push(source.slice(start, index + 1));
          start = -1;
        }
      }
    }
    if (start >= 0) {
      const salvaged = salvageTruncatedJsonObject(source.slice(start));
      if (salvaged) push(salvaged);
    }
  }
  return candidates;
}

function softRepairStructureGraphJson(
  value: unknown,
  options: { projectId: string; projectName: string },
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const root = { ...(value as Record<string, unknown>) };
  root.projectId = options.projectId;
  if (typeof root.projectName !== "string" || !root.projectName.trim()) {
    root.projectName = options.projectName;
  }
  if (
    root.version !== "0.5.0" &&
    root.version !== "0.4.0" &&
    root.version !== "0.3.0" &&
    root.version !== "0.2.0" &&
    root.version !== "0.1.0"
  ) {
    root.version = "0.5.0";
  }
  if (typeof root.analyzedAt !== "string") {
    root.analyzedAt = new Date().toISOString();
  }
  root.analysisStatus = "complete";
  root.analysisError = null;

  if (!root.architecture || typeof root.architecture !== "object") {
    root.architecture = {
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
  }

  if (Array.isArray(root.nodes)) {
    root.nodes = root.nodes.map((node) => {
      if (!node || typeof node !== "object" || Array.isArray(node)) return node;
      const next = { ...(node as Record<string, unknown>) };
      const tags = Array.isArray(next.tags)
        ? next.tags.filter(
            (tag): tag is string =>
              typeof tag === "string" && !BOOTSTRAP_GRAPH_TAGS.has(tag),
          )
        : [];
      if (!tags.includes(AI_SCAN_GRAPH_GENERATOR_TAG)) {
        tags.push(AI_SCAN_GRAPH_GENERATOR_TAG);
      }
      next.tags = tags;
      if (!Array.isArray(next.linkedFiles)) next.linkedFiles = [];
      if (!Array.isArray(next.upstream)) next.upstream = [];
      if (!Array.isArray(next.downstream)) next.downstream = [];
      if (typeof next.confidence !== "number") next.confidence = 0.7;
      if (typeof next.type !== "string") next.type = "capability";
      if (typeof next.status !== "string") next.status = "active";
      if (typeof next.description !== "string") {
        next.description = String(next.summary ?? next.name ?? "Component");
      }
      if (typeof next.summary !== "string") {
        next.summary = String(next.description ?? next.name ?? "Component");
      }
      return next;
    });
  }

  if (Array.isArray(root.edges)) {
    root.edges = root.edges.map((edge, index) => {
      if (!edge || typeof edge !== "object" || Array.isArray(edge)) return edge;
      const next = { ...(edge as Record<string, unknown>) };
      if (typeof next.id !== "string") {
        next.id = `edge_${String(next.source ?? "a")}_${String(next.target ?? "b")}_${index}`;
      }
      if (typeof next.confidence !== "number") next.confidence = 0.6;
      if (typeof next.label !== "string" || !next.label.trim()) {
        next.label = `${String(next.source ?? "?")} → ${String(next.target ?? "?")}`;
      }
      if (typeof next.evidence !== "string" || !next.evidence.trim()) {
        next.evidence = "Inferred from repository structure and source layout";
      }
      return next;
    });
  }

  if (Array.isArray(root.fileIndex)) {
    root.fileIndex = root.fileIndex.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const next = { ...(entry as Record<string, unknown>) };
      if (!Array.isArray(next.nodeIds)) next.nodeIds = [];
      if (!Array.isArray(next.imports)) next.imports = [];
      if (!Array.isArray(next.exports)) next.exports = [];
      if (typeof next.type !== "string") next.type = "other";
      return next;
    });
  } else {
    root.fileIndex = [];
  }

  // Drop fileRelations when present — they have strict co-ownership rules and
  // models often invent invalid pairs. Structure map does not require them.
  delete root.fileRelations;

  // Rebuild children from parentId so hierarchy stays bidirectional.
  if (Array.isArray(root.nodes)) {
    const nodes = root.nodes as Array<Record<string, unknown>>;
    const childrenByParent = new Map<string, string[]>();
    for (const node of nodes) {
      if (typeof node.id !== "string") continue;
      const parentId = typeof node.parentId === "string" ? node.parentId : null;
      if (!parentId) continue;
      const list = childrenByParent.get(parentId) ?? [];
      list.push(node.id);
      childrenByParent.set(parentId, list);
    }
    root.nodes = nodes.map((node) => {
      if (typeof node.id !== "string") return node;
      const children = childrenByParent.get(node.id) ?? [];
      return { ...node, children };
    });
  }

  return root;
}

function assertStructureQualityGate(graph: ProjectGraph): void {
  const systems = graph.nodes.filter(
    (node) =>
      node.level === "context" || node.elementType === "software_system",
  );
  const containers = graph.nodes.filter(
    (node) =>
      node.level === "container" || node.elementType === "container",
  );
  const components = graph.nodes.filter(
    (node) =>
      node.level === "component" || node.elementType === "component",
  );
  if (systems.length < 1 || containers.length < 1 || components.length < 1) {
    throw new ProjectOSError(
      "agent_orchestration_failed",
      `Structure graph quality gate failed (system=${systems.length}, container=${containers.length}, component=${components.length})`,
    );
  }
}

export function parseProjectGraphFromModelOutput(
  output: string,
  options: {
    workspaceRoot: string;
    projectId: string;
    projectName: string;
  },
): ProjectGraph {
  const issues: string[] = [];
  const candidates = extractJsonObjectCandidates(output);
  for (const candidate of candidates) {
    try {
      const repaired = softRepairStructureGraphJson(JSON.parse(candidate), {
        projectId: options.projectId,
        projectName: options.projectName,
      });
      const sanitized = sanitizeLegacyProjectGraph(repaired, {
        workspaceRoot: options.workspaceRoot,
        projectId: options.projectId,
      });
      if (!sanitized) {
        issues.push("sanitize_failed");
        continue;
      }
      const stamped: ProjectGraph = {
        ...sanitized,
        projectId: options.projectId,
        projectName:
          sanitized.projectName.trim().length > 0
            ? sanitized.projectName
            : options.projectName,
        analyzedAt: new Date().toISOString(),
        analysisStatus: "complete",
        analysisError: null,
        version: "0.4.0",
        nodes: sanitized.nodes.map((node) => {
          const tags = (node.tags ?? []).filter(
            (tag) => !BOOTSTRAP_GRAPH_TAGS.has(tag),
          );
          if (!tags.includes(AI_SCAN_GRAPH_GENERATOR_TAG)) {
            tags.push(AI_SCAN_GRAPH_GENERATOR_TAG);
          }
          return { ...node, tags };
        }),
        topology: sanitized.topology ?? {
          rootIds: sanitized.nodes
            .filter((node) => !node.parentId)
            .map((node) => node.id)
            .slice(0, 8),
          maxDepth: 3,
          totalNodes: sanitized.nodes.length,
        },
      };
      const parsed = ProjectGraphSchema.safeParse(stamped);
      if (!parsed.success) {
        issues.push(
          parsed.error.issues
            .slice(0, 4)
            .map((issue) => `${issue.path.join(".")}:${issue.message}`)
            .join("; "),
        );
        continue;
      }
      assertStructureQualityGate(parsed.data);
      return parsed.data;
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new ProjectOSError(
    "agent_orchestration_failed",
    `Model did not return a valid ProjectGraph JSON object${
      issues[0] ? ` (${issues[0]})` : ""
    }`,
  );
}

export interface RunStructureGraphAiScanInput {
  workspaceRoot: string;
  projectId: string;
  displayName: string;
  graph: ProjectGraph;
  profile: ModelProfile;
  gateway: ModelGateway;
  /** When true, scan even if the graph is already complete / authored. */
  force?: boolean;
  /**
   * User-initiated analyzeWorkspace: allow regenerate on complete graphs,
   * but still honor authored unless force is set.
   */
  userInitiated?: boolean;
  scanMode?: StructureScanMode;
  nodeIds?: string[];
  /** Bias refine toward these changed paths (Arch4 changed-files). */
  changedFiles?: string[];
  /** Refined graph payload for acceptRefine agent-mode. */
  refinedGraph?: unknown;
}

export interface StructureRefinePreparePayload {
  mode: "prepareRefine";
  projectId: string;
  projectName: string;
  prompts: {
    system: string;
    user: string;
  };
  graphSnapshot: {
    nodeCount: number;
    edgeCount: number;
    views: ProjectGraph["views"];
  };
}

function buildRefinePreparePayload(
  input: RunStructureGraphAiScanInput,
  bundle: string,
): StructureRefinePreparePayload {
  return {
    mode: "prepareRefine",
    projectId: input.projectId,
    projectName: input.displayName,
    prompts: {
      system: [
        bundle,
        "",
        "REFINE ONLY: improve names, descriptions, people actors, and responsibility text.",
        "Do NOT change topology (ids, parentId, children, edge endpoints) unless force is set.",
        "Return a ProjectGraph JSON object (version 0.5.0) with the same node/edge ids.",
      ].join("\n"),
      user: [
        `Project: ${input.displayName} (${input.projectId})`,
        `Changed files: ${(input.changedFiles ?? []).slice(0, 80).join(", ") || "(none)"}`,
        "",
        "Current graph JSON:",
        JSON.stringify(
          {
            version: input.graph.version,
            nodes: input.graph.nodes,
            edges: input.graph.edges,
            views: input.graph.views,
            architecture: input.graph.architecture,
          },
          null,
          2,
        ),
      ].join("\n"),
    },
    graphSnapshot: {
      nodeCount: input.graph.nodes.length,
      edgeCount: input.graph.edges.length,
      views: input.graph.views,
    },
  };
}

function acceptRefinedGraph(
  base: ProjectGraph,
  refinedUnknown: unknown,
  force: boolean,
): ProjectGraph {
  const repaired = softRepairStructureGraphJson(refinedUnknown, {
    projectId: base.projectId,
    projectName: base.projectName,
  });
  const parsed = ProjectGraphSchema.safeParse(repaired);
  if (!parsed.success) {
    throw new ProjectOSError(
      "agent_orchestration_failed",
      `acceptRefine payload failed validation (${parsed.error.issues
        .slice(0, 4)
        .map((issue) => `${issue.path.join(".")}:${issue.message}`)
        .join("; ")})`,
    );
  }
  const incoming = parsed.data;
  if (force) {
    return {
      ...incoming,
      version: "0.5.0",
      projectId: base.projectId,
      views: mergeArchitectureViews({
        existing: base.views,
        generated:
          incoming.views ??
          synthesizeDefaultArchitectureViews(incoming.nodes, { sourceKind: "ai" }),
        mode: "regenerate",
      }),
    };
  }
  // Refine semantics: preserve topology ids; take semantic fields from incoming.
  const baseById = new Map(base.nodes.map((node) => [node.id, node]));
  const nodes = incoming.nodes.map((node) => {
    const prior = baseById.get(node.id);
    if (!prior) return { ...node, sourceKind: node.sourceKind ?? "ai" as const };
    return {
      ...prior,
      name: node.name || prior.name,
      description: node.description || prior.description,
      summary: node.summary || prior.summary,
      responsibility: node.responsibility || prior.responsibility,
      technology: node.technology ?? prior.technology,
      owners: node.owners ?? prior.owners,
      notes: node.notes ?? prior.notes,
      openQuestions: node.openQuestions ?? prior.openQuestions,
      sourceKind: prior.sourceKind === "authored" ? "authored" : (node.sourceKind ?? "ai"),
    };
  });
  return {
    ...base,
    version: "0.5.0",
    analyzedAt: new Date().toISOString(),
    nodes,
    edges: base.edges.map((edge) => {
      const match = incoming.edges.find((item) => item.id === edge.id);
      if (!match) return edge;
      return {
        ...edge,
        label: match.label ?? edge.label,
        purpose: match.purpose ?? edge.purpose,
        technology: match.technology ?? edge.technology,
      };
    }),
    views: mergeArchitectureViews({
      existing: base.views,
      generated:
        incoming.views ??
        synthesizeDefaultArchitectureViews(nodes, { sourceKind: "ai" }),
      mode: "refine",
    }),
  };
}

function computeRepoScanContentHash(workspaceRoot: string, files: string[]): string {
  const hash = createHash("sha256");
  const manifests = [
    "package.json",
    "go.mod",
    "pyproject.toml",
    "requirements.txt",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Dockerfile",
    "prisma/schema.prisma",
    "README.md",
    "readme.md",
  ];
  for (const relativePath of manifests) {
    const absolute = join(workspaceRoot, relativePath);
    try {
      if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
      hash.update(relativePath);
      hash.update("\0");
      hash.update(readFileSync(absolute));
      hash.update("\0");
    } catch {
      /* ignore */
    }
  }
  hash.update(files.slice(0, 400).join("\n"));
  return hash.digest("hex");
}

function readScanCacheHash(workspaceRoot: string): string | null {
  const path = join(workspaceRoot, ".projectos", "scan-cache.json");
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { contentHash?: string };
    return typeof parsed.contentHash === "string" ? parsed.contentHash : null;
  } catch {
    return null;
  }
}

function writeScanCacheHash(workspaceRoot: string, contentHash: string): void {
  const dir = join(workspaceRoot, ".projectos");
  const path = join(dir, "scan-cache.json");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify({ contentHash, updatedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    /* best-effort */
  }
}

export function isAuthoredGraph(graph: ProjectGraph): boolean {
  if (graph.authored === true) return true;
  return graph.nodes.some((node) => node.tags.includes("product-authored"));
}

const STRUCTURE_SCAN_MAX_OUTPUT_TOKENS = 8_192;

function parseModelJsonObject(output: string): Record<string, unknown> {
  const issues: string[] = [];
  for (const candidate of extractJsonObjectCandidates(output)) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      issues.push("not_object");
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new ProjectOSError(
    "agent_orchestration_failed",
    `Model did not return a valid JSON object${issues[0] ? ` (${issues[0]})` : ""}`,
  );
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item),
  );
}

function normalizeNode(
  raw: Record<string, unknown>,
  language: ScanLanguage,
): FunctionalNode {
  const id = String(raw.id ?? "node_unknown");
  const name = String(raw.name ?? id);
  const description = String(raw.description ?? raw.summary ?? name);
  const summary = String(raw.summary ?? description);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  if (!tags.includes(AI_SCAN_GRAPH_GENERATOR_TAG)) tags.push(AI_SCAN_GRAPH_GENERATOR_TAG);
  const level =
    raw.level === "context" ||
    raw.level === "container" ||
    raw.level === "component" ||
    raw.level === "code"
      ? raw.level
      : raw.elementType === "person" ||
          raw.elementType === "software_system" ||
          raw.elementType === "external_system"
        ? "context"
        : raw.elementType === "container" || raw.elementType === "data_store"
          ? "container"
          : raw.elementType === "component"
            ? "component"
            : undefined;
  let elementType =
    raw.elementType === "person" ||
    raw.elementType === "software_system" ||
    raw.elementType === "external_system" ||
    raw.elementType === "container" ||
    raw.elementType === "component" ||
    raw.elementType === "data_store"
      ? raw.elementType
      : undefined;
  if (!elementType && level === "context") elementType = "software_system";
  if (!elementType && level === "container") elementType = "container";
  if (!elementType && level === "component") elementType = "component";
  const technology =
    typeof raw.technology === "string" && raw.technology.trim().length > 0
      ? raw.technology.trim()
      : undefined;
  const owners = Array.isArray(raw.owners)
    ? raw.owners.filter((owner): owner is string => typeof owner === "string" && owner.trim().length > 0)
    : undefined;
  const notes =
    typeof raw.notes === "string" && raw.notes.trim().length > 0
      ? raw.notes.trim()
      : undefined;
  const openQuestions = Array.isArray(raw.openQuestions)
    ? raw.openQuestions.filter(
        (question): question is string =>
          typeof question === "string" && question.trim().length > 0,
      )
    : undefined;
  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0.75;
  const inferredQuestions =
    openQuestions && openQuestions.length > 0
      ? openQuestions
      : confidence < 0.6
        ? [`Confirm role and boundaries for ${name}.`]
        : undefined;
  return {
    id,
    type: raw.type === "suggested" ? "suggested" : "capability",
    name,
    status: "active",
    description,
    summary,
    responsibility: String(raw.responsibility ?? description),
    elementType,
    level,
    layer: typeof raw.layer === "string" ? raw.layer : "application",
    ...(technology ? { technology } : {}),
    linkedFiles: [],
    upstream: Array.isArray(raw.upstream)
      ? raw.upstream.filter((id): id is string => typeof id === "string")
      : [],
    downstream: Array.isArray(raw.downstream)
      ? raw.downstream.filter((id): id is string => typeof id === "string")
      : [],
    confidence,
    tags: tags.filter((tag) => !BOOTSTRAP_GRAPH_TAGS.has(tag)),
    parentId: typeof raw.parentId === "string" ? raw.parentId : undefined,
    children: Array.isArray(raw.children)
      ? raw.children.filter((id): id is string => typeof id === "string")
      : [],
    ...(owners && owners.length > 0 ? { owners } : {}),
    ...(notes ? { notes } : {}),
    ...(inferredQuestions && inferredQuestions.length > 0
      ? { openQuestions: inferredQuestions }
      : {}),
    sourceKind: "ai",
  };
}

function normalizeEdge(raw: Record<string, unknown>, index: number): FunctionalEdge {
  const technology =
    typeof raw.technology === "string" && raw.technology.trim().length > 0
      ? raw.technology.trim()
      : undefined;
  return ensureEdgeFields(
    {
      id: String(raw.id ?? `edge_${index}`),
      source: String(raw.source ?? ""),
      target: String(raw.target ?? ""),
      relation:
        raw.relation === "calls" ||
        raw.relation === "data_flows_to" ||
        raw.relation === "uses" ||
        raw.relation === "imports" ||
        raw.relation === "reads_from" ||
        raw.relation === "writes_to" ||
        raw.relation === "publishes_to" ||
        raw.relation === "subscribes_to"
          ? raw.relation
          : "depends_on",
      label: typeof raw.label === "string" ? raw.label : undefined,
      purpose: typeof raw.purpose === "string" ? raw.purpose : undefined,
      sourceKind: "ai",
      ...(technology ? { technology } : {}),
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0.7,
      evidence: typeof raw.evidence === "string" ? raw.evidence : undefined,
    },
    index,
  );
}

async function completeJsonRound(
  input: RunStructureGraphAiScanInput,
  systemPrompt: string,
  task: string,
  extra: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await input.gateway.complete(input.profile, {
    projectId: input.projectId,
    requestKind: "structure_graph_scan",
    modelPreference: input.profile.id,
    systemPrompt,
    input: {
      task,
      repo: basename(input.workspaceRoot),
      ...extra,
    },
    redactionPolicy: "secrets_and_paths",
    maxOutputTokens: STRUCTURE_SCAN_MAX_OUTPUT_TOKENS,
    thinkingDepth: "medium",
  });
  return parseModelJsonObject(response.output);
}

function attachFilesToNodes(
  nodes: FunctionalNode[],
  assignments: Map<string, string[]>,
): FunctionalNode[] {
  return nodes.map((node) => {
    const paths = assignments.get(node.id);
    if (!paths || node.level !== "component") return node;
    return {
      ...node,
      linkedFiles: paths.map((path, index) => ({
        path,
        role: index === 0 ? ("primary" as const) : ("supporting" as const),
      })),
    };
  });
}

function assembleFromRounds(input: {
  projectId: string;
  projectName: string;
  workspaceRoot: string;
  language: ScanLanguage;
  projectType: ProjectGraph["projectType"];
  roundA: Record<string, unknown>;
  roundB: Record<string, unknown>;
}): ProjectGraph {
  const architecture =
    input.roundA.architecture && typeof input.roundA.architecture === "object"
      ? (input.roundA.architecture as ProjectGraph["architecture"])
      : defaultArchitecture(input.language);
  const layers = architecture?.layers ?? defaultArchitecture(input.language).layers;
  const layerIds = new Set(layers.map((layer) => layer.id));

  const skeleton = asRecordArray(input.roundA.nodes).map((raw) =>
    normalizeNode(raw, input.language),
  );
  const componentsRaw = asRecordArray(
    input.roundB.components ?? input.roundB.nodes,
  );
  const components = componentsRaw.map((raw) => {
    const node = normalizeNode(
      { ...raw, level: raw.level ?? "component", elementType: raw.elementType ?? "component" },
      input.language,
    );
    return node;
  });

  let nodes = [...skeleton, ...components].map((node) => ({
    ...node,
    layer: node.layer && layerIds.has(node.layer) ? node.layer : layers[1]?.id ?? layers[0]!.id,
  }));
  const systemId = nodes.find((node) => node.elementType === "software_system")?.id;
  const firstContainerId = nodes.find((node) => node.level === "container")?.id;
  nodes = nodes.map((node) => {
    if (node.level === "container" && !node.parentId && systemId) {
      return { ...node, parentId: systemId };
    }
    if (node.level === "component" && !node.parentId && firstContainerId) {
      return { ...node, parentId: firstContainerId };
    }
    return node;
  });
  nodes = rebuildHierarchy(nodes);

  const hints = componentsRaw.map((raw) => ({
    id: String(raw.id ?? ""),
    pathHints: Array.isArray(raw.pathHints)
      ? raw.pathHints.filter((hint): hint is string => typeof hint === "string")
      : typeof raw.pathHint === "string"
        ? [raw.pathHint]
        : [],
  })).filter((hint) => hint.id.length > 0);

  const files = collectRepoFiles(input.workspaceRoot, 400);
  const assignments = assignFilesToComponents({ files, components: hints });
  nodes = attachFilesToNodes(nodes, assignments);
  const techSignals = collectWorkspaceTechSignals(input.workspaceRoot, files);
  nodes = enrichNodesForC4Shapes({
    nodes,
    workspaceRoot: input.workspaceRoot,
    files,
    signals: techSignals,
  });
  const { fileIndex, fileRelations } = buildFileIndexAndRelations({
    workspaceRoot: input.workspaceRoot,
    assignments,
  });

  const edges = [
    ...asRecordArray(input.roundA.edges),
    ...asRecordArray(input.roundB.edges),
  ].map((raw, index) => normalizeEdge(raw, index));

  const graph: ProjectGraph = {
    version: "0.5.0",
    projectId: input.projectId,
    projectName: input.projectName,
    projectType: input.projectType,
    analyzedAt: new Date().toISOString(),
    analysisStatus: "complete",
    authored: false,
    architecture: architecture ?? defaultArchitecture(input.language),
    nodes,
    edges,
    views: synthesizeDefaultArchitectureViews(nodes, { sourceKind: "ai" }),
    fileIndex,
    fileRelations,
    topology: {
      rootIds: nodes.filter((node) => !node.parentId).map((node) => node.id),
      maxDepth: 3,
      totalNodes: nodes.length,
    },
    analysisError: null,
  };

  const sanitized = sanitizeLegacyProjectGraph(graph, {
    workspaceRoot: input.workspaceRoot,
    projectId: input.projectId,
  });
  const parsed = ProjectGraphSchema.safeParse(sanitized ?? graph);
  if (!parsed.success) {
    throw new ProjectOSError(
      "agent_orchestration_failed",
      `Assembled graph failed validation (${parsed.error.issues
        .slice(0, 4)
        .map((issue) => `${issue.path.join(".")}:${issue.message}`)
        .join("; ")})`,
    );
  }
  return parsed.data;
}

export async function runStructureGraphAiScan(
  input: RunStructureGraphAiScanInput,
): Promise<ProjectGraph> {
  const scanMode: StructureScanMode = input.scanMode ?? "regenerate";
  if (
    !input.force &&
    scanMode === "regenerate" &&
    isAuthoredGraph(input.graph)
  ) {
    return input.graph;
  }
  if (
    !input.force &&
    !input.userInitiated &&
    scanMode === "regenerate" &&
    !graphNeedsAiScan(input.graph)
  ) {
    return input.graph;
  }
  if (scanMode === "deepen" && (!input.nodeIds || input.nodeIds.length === 0)) {
    throw new ProjectOSError(
      "agent_orchestration_failed",
      "deepen requires nodeIds",
    );
  }

  if (scanMode === "prepareRefine") {
    const bundle = loadPromptBundle(input.workspaceRoot);
    const payload = buildRefinePreparePayload(input, bundle);
    // Persist prompts beside the workspace for agent consumption.
    const outDir = join(input.workspaceRoot, ".projectos", "structure-graph");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "refine-prepare.json"),
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    );
    return input.graph;
  }

  if (scanMode === "acceptRefine") {
    if (input.refinedGraph === undefined || input.refinedGraph === null) {
      throw new ProjectOSError(
        "agent_orchestration_failed",
        "acceptRefine requires refinedGraph",
      );
    }
    return acceptRefinedGraph(
      input.graph,
      input.refinedGraph,
      input.force === true,
    );
  }

  const language = detectReadmeLanguage(input.workspaceRoot);
  const files = collectRepoFiles(input.workspaceRoot, 400);
  const contentHash = computeRepoScanContentHash(input.workspaceRoot, files);
  const cachedHash = readScanCacheHash(input.workspaceRoot);
  const hashUnchanged = cachedHash !== null && cachedHash === contentHash;

  if (
    !input.force &&
    scanMode === "refine" &&
    hashUnchanged &&
    !graphNeedsAiScan(input.graph) &&
    (!input.changedFiles || input.changedFiles.length === 0)
  ) {
    return input.graph;
  }

  const bundle = loadPromptBundle(input.workspaceRoot);
  const repoContext = buildRepoScanContext({
    workspaceRoot: input.workspaceRoot,
    displayName: input.displayName,
    graph: input.graph,
  });
  const fileList = files.slice(0, 180).map((path) => `- ${path}`).join("\n");
  const changedNote =
    input.changedFiles && input.changedFiles.length > 0
      ? `Changed files to prioritize (keep unrelated node ids/names stable): ${input.changedFiles
          .slice(0, 80)
          .join(", ")}`
      : "";

  const skipRoundA =
    ((scanMode === "refine" || scanMode === "deepen") &&
      input.graph.nodes.some((node) => node.level === "container") &&
      (hashUnchanged || (input.changedFiles?.length ?? 0) > 0)) ||
    (scanMode === "refine" && hashUnchanged && !input.force);

  let roundA: Record<string, unknown>;
  if (skipRoundA) {
    roundA = {
      architecture: input.graph.architecture,
      nodes: input.graph.nodes.filter(
        (node) => node.level === "context" || node.level === "container",
      ),
      edges: input.graph.edges,
    };
  } else {
    roundA = await completeJsonRound(
      input,
      [
        bundle,
        "",
        "ROUND A: emit ONLY context + container nodes (no components, no fileIndex, no fileRelations).",
        `Language for names: ${language === "zh-CN" ? "Chinese" : "English"} (follow README).`,
        "Include 0–4 person actors, 1 software_system, 0–4 external_system (SaaS/cloud/third-party), 2–6 containers.",
        "Use elementType data_store (level=container) for databases/caches; short technology strings for C4 shapes:",
        "Next.js, React, Vue, React Native, Flutter, Node.js / Express, NestJS, PostgreSQL, MySQL, MongoDB, SQLite, Redis, Kafka, RabbitMQ, SQS.",
        "Every relationship MUST include short technology/protocol (HTTP, HTTPS, gRPC, Kafka, SQL, WebSocket, …).",
        "Optional enrichment: notes, openQuestions (for low confidence), owners.",
        "Nesting: containers/data_stores parentId = software_system id. Never emit layout coordinates.",
        "Product names only — never 'android module' / 'src module'.",
        "Return one JSON object: { architecture, nodes, edges }.",
        changedNote,
        `projectId: ${input.projectId}`,
        `Repo: ${input.displayName}`,
      ].join("\n"),
      "structure_graph_round_a",
      { context: repoContext, language },
    );
  }

  const deepenNote =
    scanMode === "deepen"
      ? `Only deepen these node ids and their children: ${(input.nodeIds ?? []).join(", ")}`
      : scanMode === "refine"
        ? "Keep existing node ids when possible; add missing components."
        : "Create a full component set.";

  const roundB = await completeJsonRound(
    input,
    [
      bundle,
      "",
      "ROUND B: emit ONLY components with pathHints. No fileIndex, no fileRelations.",
      `Language for names: ${language === "zh-CN" ? "Chinese" : "English"}.`,
      "Each container needs 2–6 components (about 8–20 total). Product capability names, not directory shells.",
      "Each component: { id, name, parentId, description, summary, responsibility, layer, pathHints: string[], technology?, notes?, openQuestions?, owners? }.",
      "pathHints must be real path prefixes from the file list (e.g. android/app/src, src/auth).",
      "Edges between components MUST include technology/protocol when known.",
      deepenNote,
      changedNote,
      "Return one JSON object: { components, edges }.",
      `projectId: ${input.projectId}`,
    ].join("\n"),
    "structure_graph_round_b",
    {
      language,
      files: fileList,
      roundA,
      changedFiles: input.changedFiles?.slice(0, 80) ?? [],
      existingComponents: input.graph.nodes
        .filter((node) => node.level === "component")
        .map((node) => ({ id: node.id, name: node.name, parentId: node.parentId })),
    },
  );

  const assembled = assembleFromRounds({
    projectId: input.projectId,
    projectName: input.displayName,
    workspaceRoot: input.workspaceRoot,
    language,
    projectType: input.graph.projectType,
    roundA,
    roundB,
  });

  const merged =
    scanMode === "regenerate"
      ? assembled
      : mergeStructureGraphs({
          base: input.graph,
          incoming: assembled,
          mode: scanMode,
          deepenIds: input.nodeIds,
        });

  const enrichedNodes = enrichNodesForC4Shapes({
    nodes: merged.nodes,
    workspaceRoot: input.workspaceRoot,
    files,
  });
  const generatedViews = synthesizeDefaultArchitectureViews(enrichedNodes, {
    sourceKind: "ai",
  });
  const views = mergeArchitectureViews({
    existing: scanMode === "regenerate" ? merged.views : (input.graph.views ?? merged.views),
    generated: generatedViews,
    mode: scanMode === "regenerate" ? "regenerate" : "refine",
  });

  const result: ProjectGraph = {
    ...merged,
    version: "0.5.0",
    authored: input.force ? false : merged.authored === true ? true : false,
    nodes: enrichedNodes,
    views,
  };

  const quality = assessL2GraphQuality(result, {
    sourceFileCount: files.length,
    language,
  });
  if (!quality.complete) {
    throw new ProjectOSError(
      "agent_orchestration_failed",
      `L2 quality gate failed: ${quality.reasons.join(",")}`,
    );
  }
  writeScanCacheHash(input.workspaceRoot, contentHash);
  return result;
}
