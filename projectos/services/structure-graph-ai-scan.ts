/**
 * Direct ModelGateway structure-graph scan (CodeSee-style) — no chat / agent sidebar.
 * Used on first open when the heuristic C4 graph is incomplete / bootstrap-tagged.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

import {
  ProjectGraphSchema,
  type ProjectGraph,
} from "../contracts/graph.js";
import type { ModelProfile } from "../contracts/settings.js";
import { ProjectOSError } from "../errors.js";
import {
  buildHeuristicSemanticTree,
  sanitizeLegacyProjectGraph,
} from "./workspace-bootstrap.js";
import { ModelGateway } from "./model-gateway/index.js";
import type { SemanticTree } from "../contracts/semantic-tree.js";

export const AI_SCAN_GRAPH_GENERATOR_TAG = "ai-scan";
export const BOOTSTRAP_GRAPH_TAGS = new Set(["heuristic", "bootstrap"]);

const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".projectos",
  ".codesee",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".venv",
  "venv",
  ".next",
  ".turbo",
  ".cache",
  "target",
  "vendor",
]);

const TEXT_EXTS = new Set([
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
  ".md",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".sql",
  ".css",
  ".scss",
  ".html",
]);

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
  const files: string[] = [];
  const walk = (absoluteDir: string): void => {
    if (files.length >= limit) return;
    let entries;
    try {
      entries = readdirSync(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limit) return;
      if (entry.name.startsWith(".") && entry.name !== ".env.example") {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name !== ".github" && entry.name !== ".agents") continue;
      }
      if (SKIP_DIRS.has(entry.name)) continue;
      const absolute = join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = entry.name.includes(".")
        ? `.${entry.name.split(".").pop()!.toLowerCase()}`
        : "";
      if (!TEXT_EXTS.has(ext) && entry.name !== "Dockerfile") continue;
      files.push(relative(workspaceRoot, absolute).split(sep).join("/"));
    }
  };
  walk(workspaceRoot);
  return files;
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
  if (root.version !== "0.3.0" && root.version !== "0.2.0" && root.version !== "0.1.0") {
    root.version = "0.3.0";
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
        version: "0.3.0",
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
  /** When true, skip the completeness gate (used by analyzeWorkspace rescan). */
  force?: boolean;
}

const STRUCTURE_SCAN_MAX_OUTPUT_TOKENS = 32_768;

function buildStructureScanSystemPrompt(input: {
  workspaceRoot: string;
  displayName: string;
  projectId: string;
  mode: "standard" | "compact";
}): string {
  const sizeRules =
    input.mode === "compact"
      ? [
          "COMPACT MODE (token-safe): keep the JSON small enough to finish.",
          "Hard caps: ≤1 system, ≤3 containers, ≤6 components, ≤20 fileIndex entries, ≤12 edges.",
          "Each description/summary/responsibility ≤ 60 Chinese/English chars.",
          "Only link 1–3 primary files per component. imports/exports MUST be [].",
          "Omit nameEn, refs, preview, fileRelations, technology when unsure.",
        ]
      : [
          "SIZE CAPS so the JSON always finishes: ≤1 system + optional persons, ≤4 containers, ≤10 components, ≤40 fileIndex entries, ≤20 edges.",
          "Each description/summary/responsibility ≤ 100 chars. Prefer product language like sample maps (e.g.「访客」「登录服务」), never「android module」.",
          "Only include files you actually attach via linkedFiles. imports/exports may be [].",
          "Omit fileRelations, nameEn, refs, preview unless essential.",
        ];

  return [
    loadPromptBundle(input.workspaceRoot),
    "",
    "You are generating `.projectos/graph.json` for Project OS Function Map (structure layer).",
    "Goal: a readable C4 map like Project OS sample — actors/system/containers/components with clear product names and real file mounts.",
    "Return ONLY one JSON object matching ProjectGraph v0.3.0. No markdown fences unless required.",
    "The first character of your response should be `{` and the last should be `}`.",
    "Do NOT invent file paths. Prefer real paths from the file list.",
    "Include at least one system, one container, and one component with meaningful names.",
    ...sizeRules,
    `Repo name: ${input.displayName}`,
    `projectId (must match exactly): ${input.projectId}`,
  ].join("\n");
}

async function completeStructureScanOnce(
  input: RunStructureGraphAiScanInput,
  mode: "standard" | "compact",
): Promise<ProjectGraph> {
  const systemPrompt = buildStructureScanSystemPrompt({
    workspaceRoot: input.workspaceRoot,
    displayName: input.displayName,
    projectId: input.projectId,
    mode,
  });

  const repoContext = buildRepoScanContext({
    workspaceRoot: input.workspaceRoot,
    displayName: input.displayName,
    graph: input.graph,
  });

  const response = await input.gateway.complete(input.profile, {
    projectId: input.projectId,
    requestKind: "structure_graph_scan",
    modelPreference: input.profile.id,
    systemPrompt,
    input: {
      task: "Generate ProjectGraph JSON for this repository",
      mode,
      repo: basename(input.workspaceRoot),
      context: repoContext,
    },
    redactionPolicy: "secrets_and_paths",
    maxOutputTokens: STRUCTURE_SCAN_MAX_OUTPUT_TOKENS,
    thinkingDepth: mode === "compact" ? "low" : "medium",
  });

  return parseProjectGraphFromModelOutput(response.output, {
    workspaceRoot: input.workspaceRoot,
    projectId: input.projectId,
    projectName: input.displayName,
  });
}

export async function runStructureGraphAiScan(
  input: RunStructureGraphAiScanInput,
): Promise<ProjectGraph> {
  if (!input.force && !graphNeedsAiScan(input.graph)) {
    return input.graph;
  }

  let lastError: unknown;
  for (const mode of ["standard", "compact"] as const) {
    try {
      return await completeStructureScanOnce(input, mode);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ProjectOSError(
        "agent_orchestration_failed",
        "Structure graph AI scan failed after retries",
      );
}
