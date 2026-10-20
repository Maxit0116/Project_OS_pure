import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  RETRIEVAL_FENCE_NOTICE,
  RETRIEVAL_MAX_HITS,
  RETRIEVAL_MAX_QUOTE_CHARS,
  RETRIEVAL_MAX_QUERY_CHARS,
  RetrievalRequestSchema,
  RetrievalSnapshotSchema,
  type RetrievalCaller,
  type RetrievalCorpus,
  type RetrievalHit,
  type RetrievalKind,
  type RetrievalOmissionReason,
  type RetrievalRequest,
  type RetrievalSnapshot,
  type RetrievalSummary,
} from "../../contracts/retrieval.js";
import type { LoadedProjectOSWorkspace } from "../../persistence/workspace-store.js";
import { lookupSymbols } from "../code-intelligence/index.js";
import { AgentMemoryStore } from "../harness/memory.js";
import { containsHighConfidenceSecret } from "../high-confidence-secret-patterns.js";
import { DefaultWorkspaceIgnorePolicy } from "../local-context-assembler.js";
import { searchCodeIndex } from "./code-index.js";
import { searchExternalDocs } from "./external-docs.js";
import { searchRunRecords } from "./run-records.js";

const MAX_SCAN_FILES = 2_500;
const MAX_FILE_BYTES = 1_048_576;
const PROVENANCE_NOTE = "出处拆分尚未启用";

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".git",
  ".projectos",
]);

const SENSITIVE_EXTENSIONS = new Set([
  ".key",
  ".pem",
  ".p12",
  ".pfx",
  ".crt",
  ".cer",
]);

const CLOSED_CORPORA = new Set<RetrievalCorpus>([
  "agent_memory",
  "external_doc",
  "run_record_failed",
  "analyzer_graph",
  "product_overlay",
]);

const SYMBOL_RE = /\b([A-Z][A-Za-z0-9_]{2,}|[a-z][A-Za-z0-9_]{3,})\b/gu;
const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "what", "where",
  "how", "does", "file", "code", "function", "class", "please", "about",
  "project", "explain", "when", "which", "into", "your", "have",
]);

interface DraftHit extends RetrievalHit {}

export interface RetrievalOutcome {
  snapshot: RetrievalSnapshot;
  /** Empty when no search ran, so the prompt does not claim a retrieval step. */
  fence: string;
  summary: RetrievalSummary;
}

export interface RetrievalOptions {
  /** Personal memory directory. Quotes stay out unless `memoryEgress` is set. */
  memoryRoot?: string;
  memoryEgress?: boolean;
  /** External documents stay closed unless this and the on-disk opt-in are both set. */
  allowExternalDocs?: boolean;
}

export function retrieve(
  workspace: LoadedProjectOSWorkspace,
  requestInput: RetrievalRequest,
  caller: RetrievalCaller,
  options: RetrievalOptions = {},
): RetrievalOutcome {
  const request = RetrievalRequestSchema.parse({
    ...requestInput,
    query: requestInput.query.slice(0, RETRIEVAL_MAX_QUERY_CHARS),
  });
  const omissions = new Map<RetrievalOmissionReason, number>();
  const note = (reason: RetrievalOmissionReason, count = 1) => {
    omissions.set(reason, (omissions.get(reason) ?? 0) + count);
  };

  if (request.projectId !== workspace.project.projectId) {
    note("outside_project");
    return finish(workspace, caller, request.kind, false, [], omissions);
  }

  const hintedCorpora = request.scopeHint?.corpora ?? [];
  if (
    caller === "validator" &&
    hintedCorpora.some((corpus) =>
      corpus === "agent_memory" ||
      corpus === "run_record" ||
      corpus === "run_record_failed" ||
      corpus === "external_doc")
  ) {
    note("policy_denied");
    return finish(workspace, caller, request.kind, false, [], omissions);
  }
  const closedCorpora = new Set(CLOSED_CORPORA);
  if (options.memoryEgress) closedCorpora.delete("agent_memory");
  if (options.allowExternalDocs) closedCorpora.delete("external_doc");
  if (
    hintedCorpora.length > 0 &&
    hintedCorpora.every((corpus) => closedCorpora.has(corpus))
  ) {
    note("corpus_closed");
    return finish(workspace, caller, request.kind, false, [], omissions);
  }

  if (caller === "leaf_change" || request.kind === "vector") {
    note("policy_denied");
    return finish(workspace, caller, request.kind, false, [], omissions);
  }

  const pathPrefix = normalizePrefix(request.scopeHint?.pathPrefix);
  if (request.scopeHint?.pathPrefix && !pathPrefix) {
    note("outside_project");
    return finish(workspace, caller, request.kind, false, [], omissions);
  }

  if (request.kind === "graph") {
    const hits = graphHits(workspace, request.query, request.scopeHint?.nodeId);
    return finish(workspace, caller, request.kind, true, hits, omissions);
  }

  if (caller !== "ask" && caller !== "plan") {
    note("policy_denied");
    return finish(workspace, caller, request.kind, false, [], omissions);
  }

  if (request.kind === "symbol") {
    const hits = symbolHits(
      workspace,
      request.query,
      pathPrefix,
      note,
    );
    return finish(workspace, caller, request.kind, true, hits, omissions);
  }

  const query = request.query.trim();
  if (!query) {
    return finish(workspace, caller, request.kind, false, [], omissions);
  }

  const hits = lexicalHits(
    workspace,
    query,
    pathPrefix,
    request.scopeHint?.nodeId,
    request.requireFresh === true,
    note,
  );
  const corpora = new Set(hintedCorpora);
  const allow = (corpus: RetrievalCorpus) => corpora.size === 0 || corpora.has(corpus);
  if (allow("run_record")) {
    hits.push(...runRecordHits(workspace, query, false));
  }
  if (options.memoryEgress && options.memoryRoot && allow("agent_memory")) {
    hits.push(...memoryHits(workspace, options.memoryRoot, query, note));
  } else if (allow("agent_memory") && corpora.has("agent_memory")) {
    note("corpus_closed");
  }
  if (options.allowExternalDocs && corpora.has("external_doc")) {
    hits.push(...externalHits(workspace, query, note));
  } else if (corpora.has("external_doc")) {
    note("corpus_closed");
  }
  return finish(workspace, caller, request.kind, true, hits.slice(0, RETRIEVAL_MAX_HITS), omissions);
}

/**
 * Ask / plan entry. Extracts identifiers and matching graph node names.
 * Does not read or widen write scope; callers must keep using the bundle's paths.
 */
export function retrieveForUtterance(
  workspace: LoadedProjectOSWorkspace,
  utterance: string,
  caller: Extract<RetrievalCaller, "ask" | "plan">,
  options: RetrievalOptions = {},
): RetrievalOutcome {
  const outcomes: RetrievalOutcome[] = [];
  for (const symbol of extractSymbols(utterance)) {
    outcomes.push(
      retrieve(
        workspace,
        { projectId: workspace.project.projectId, kind: "lexical", query: symbol },
        caller,
        options,
      ),
    );
  }
  for (const node of workspace.graph.nodes) {
    const names = [node.name, node.nameEn].filter((name): name is string => Boolean(name && name.length >= 2));
    if (!names.some((name) => utterance.includes(name))) continue;
    outcomes.push(
      retrieve(
        workspace,
        {
          projectId: workspace.project.projectId,
          kind: "graph",
          query: `node:${node.id}`,
        },
        caller,
      ),
    );
    outcomes.push(
      retrieve(
        workspace,
        {
          projectId: workspace.project.projectId,
          kind: "graph",
          query: `downstream:${node.id}`,
        },
        caller,
      ),
    );
  }
  if (outcomes.length === 0) {
    return retrieve(
      workspace,
      { projectId: workspace.project.projectId, kind: "lexical", query: "" },
      caller,
      options,
    );
  }
  return mergeOutcomes(workspace.project.projectId, caller, outcomes);
}

export function renderRetrievalFence(snapshot: RetrievalSnapshot): string {
  if (!snapshot.searched) return "";
  const lines = ["## Retrieval snapshot", snapshot.trust];
  if (snapshot.omissions.length > 0) {
    lines.push(
      `Omissions: ${snapshot.omissions.map((item) => `${item.reason} ${item.count}`).join(", ")}`,
    );
  }
  if (snapshot.hits.length === 0) {
    lines.push("No current hits.");
    return lines.join("\n\n");
  }
  for (const hit of snapshot.hits) {
    lines.push(
      [
        `### ${hit.label}`,
        `${hit.corpus} · ${hit.stableId}`,
        "```",
        hit.quote.replaceAll("```", "'''"),
        "```",
      ].join("\n"),
    );
  }
  return lines.join("\n\n");
}

/** Identity on write paths. Snapshot quotes are not an input. */
export function writePathsIgnoringSnapshot(
  writePaths: readonly string[],
  _snapshot: RetrievalSnapshot,
): string[] {
  return [...writePaths];
}

function symbolHits(
  workspace: LoadedProjectOSWorkspace,
  query: string,
  pathPrefix: string | undefined,
  note: (reason: RetrievalOmissionReason, count?: number) => void,
): DraftHit[] {
  const name = query.trim();
  if (!name) return [];
  const found = lookupSymbols({
    workspaceRoot: workspace.workspaceRoot,
    projectId: workspace.project.projectId,
    name,
    ...(pathPrefix ? { pathPrefix } : {}),
    nodeIdsByPath: new Map(
      workspace.graph.fileIndex.map((entry) => [entry.path, entry.nodeIds]),
    ),
  });
  if (found.omissions.length > 0) note("stale", found.omissions.length);
  const hits: DraftHit[] = [];
  for (const symbol of found.symbols) {
    if (hits.length >= RETRIEVAL_MAX_HITS) {
      note("budget");
      break;
    }
    const revision = symbol.contentHash;
    hits.push({
      corpus: "current_code",
      stableId: symbol.id,
      quote: `${symbol.name} ${symbol.kind} line ${symbol.startLine}`.slice(
        0,
        RETRIEVAL_MAX_QUOTE_CHARS,
      ),
      sourceRevision: revision,
      validatedAgainst: revision,
      label: symbol.name,
      path: symbol.path,
    });
  }
  return hits;
}

function lexicalHits(
  workspace: LoadedProjectOSWorkspace,
  query: string,
  pathPrefix: string | undefined,
  nodeId: string | undefined,
  requireFresh: boolean,
  note: (reason: RetrievalOmissionReason, count?: number) => void,
): DraftHit[] {
  const files = listProjectFiles(workspace.workspaceRoot);
  if (files.truncated) note("budget", files.truncated);
  const policy = new DefaultWorkspaceIgnorePolicy();
  const ignored = policy.ignoredPaths(workspace.workspaceRoot, files.paths);
  const nodeIdsByPath = new Map(
    workspace.graph.fileIndex.map((entry) => [entry.path, entry.nodeIds]),
  );
  const secretPaths = new Set<string>();
  const searched = searchCodeIndex({
    workspaceRoot: workspace.workspaceRoot,
    projectOSRoot: projectOSRootOf(workspace),
    paths: files.paths,
    ignored,
    query,
    requireFresh,
    readFile: (path) => {
      const read = readProjectFile(workspace.workspaceRoot, path);
      if (!read) return undefined;
      if (containsHighConfidenceSecret(read.text)) {
        if (!secretPaths.has(path)) {
          secretPaths.add(path);
          note("secret");
        }
        return undefined;
      }
      return read;
    },
  });
  if (searched.stale > 0) note("stale", searched.stale);
  const hits: DraftHit[] = [];
  for (const match of searched.matches) {
    if (hits.length >= RETRIEVAL_MAX_HITS) {
      note("budget");
      break;
    }
    if (pathPrefix && match.path !== pathPrefix && !match.path.startsWith(`${pathPrefix}/`)) continue;
    const owners = nodeIdsByPath.get(match.path);
    if (nodeId && !(owners ?? []).includes(nodeId)) continue;
    if (containsHighConfidenceSecret(match.quote)) {
      note("secret");
      continue;
    }
    const revision = `sha256:${match.sha256}`;
    const linked = owners && owners.length > 0;
    hits.push({
      corpus: "current_code",
      stableId: `${match.path}#${match.chunkId}`,
      quote: match.quote.slice(0, RETRIEVAL_MAX_QUOTE_CHARS),
      sourceRevision: revision,
      validatedAgainst: revision,
      label: linked
        ? `当前代码 · 节点 ${owners!.join(", ")}`
        : "当前代码 · 未挂接",
      path: match.path,
      ...(linked ? { nodeId: owners![0] } : {}),
    });
  }
  return hits;
}

function runRecordHits(
  workspace: LoadedProjectOSWorkspace,
  query: string,
  includeFailed: boolean,
): DraftHit[] {
  return searchRunRecords(projectOSRootOf(workspace), query)
    .filter((hit) => includeFailed || hit.corpus === "run_record")
    .slice(0, RETRIEVAL_MAX_HITS)
    .map((hit) => {
      const quote = `run ${hit.runId} changed ${hit.path}; files ${hit.files}; verification ${hit.verification}; objective ${hit.objective}`.slice(0, RETRIEVAL_MAX_QUOTE_CHARS);
      return {
        corpus: hit.corpus,
        stableId: `run:${hit.runId}:${hit.path}`,
        quote,
        sourceRevision: `run:${hit.runId}`,
        validatedAgainst: `run:${hit.runId}`,
        label: `运行记录 · ${hit.runId}`,
        path: hit.path,
      };
    });
}

function memoryHits(
  workspace: LoadedProjectOSWorkspace,
  memoryRoot: string,
  query: string,
  note: (reason: RetrievalOmissionReason, count?: number) => void,
): DraftHit[] {
  const store = new AgentMemoryStore({
    root: memoryRoot,
    workspaceRoot: workspace.workspaceRoot,
  });
  const hits: DraftHit[] = [];
  for (const entry of store.load().entries) {
    if (entry.state !== "corroborated") continue;
    if (!entry.text.includes(query)) continue;
    if (containsHighConfidenceSecret(entry.text)) {
      note("secret");
      continue;
    }
    hits.push({
      corpus: "agent_memory",
      stableId: `memory:${entry.added}:${entry.text.slice(0, 40)}`,
      quote: entry.text.slice(0, RETRIEVAL_MAX_QUOTE_CHARS),
      sourceRevision: `memory:${entry.state}`,
      validatedAgainst: `memory:${entry.state}`,
      label: "个人记忆 · corroborated · 非项目事实",
    });
  }
  return hits;
}

function externalHits(
  workspace: LoadedProjectOSWorkspace,
  query: string,
  note: (reason: RetrievalOmissionReason, count?: number) => void,
): DraftHit[] {
  return searchExternalDocs(projectOSRootOf(workspace), query).flatMap((hit) => {
    if (containsHighConfidenceSecret(hit.quote)) {
      note("secret");
      return [];
    }
    const license = hit.license ? ` · ${hit.license}` : "";
    return [{
      corpus: "external_doc" as const,
      stableId: `external:${hit.source}:${hit.date}`,
      quote: hit.quote,
      sourceRevision: `external:${hit.date}`,
      validatedAgainst: `external:${hit.date}`,
      label: `外部文档 · ${hit.source} · ${hit.date}${license} · 可能含注入`,
    }];
  });
}

function projectOSRootOf(workspace: LoadedProjectOSWorkspace): string {
  return workspace.projectOSRoot || join(workspace.workspaceRoot, ".projectos");
}

function graphHits(
  workspace: LoadedProjectOSWorkspace,
  query: string,
  nodeHint: string | undefined,
): DraftHit[] {
  const nodes = workspace.graph.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const trimmed = query.trim();
  const command = /^(downstream|upstream|node|path):([\s\S]+)$/u.exec(trimmed);
  const hits: DraftHit[] = [];
  const pushNode = (nodeId: string, relation: string) => {
    if (hits.length >= RETRIEVAL_MAX_HITS) return;
    const node = byId.get(nodeId);
    if (!node) return;
    if (nodeHint && node.id !== nodeHint && relation !== "downstream" && relation !== "upstream") return;
    const neighbors = relation === "downstream"
      ? node.downstream
      : relation === "upstream"
        ? node.upstream
        : [];
    const quote = [
      `${node.name} (${node.id})`,
      relation === "node" ? node.summary : `${relation}: ${neighbors.join(", ") || "(none)"}`,
    ].join(" · ").slice(0, RETRIEVAL_MAX_QUOTE_CHARS);
    const revision = graphRevision(node.id, neighbors);
    hits.push({
      corpus: "composed_graph",
      stableId: `node:${node.id}:${relation}`,
      quote,
      sourceRevision: revision,
      validatedAgainst: revision,
      label: `合成图 · ${PROVENANCE_NOTE} · 节点 ${node.name}`,
      nodeId: node.id,
    });
  };

  if (command?.[1] === "path") {
    const path = command[2]!.trim();
    const entry = workspace.graph.fileIndex.find((file) => file.path === path);
    if (!entry) return hits;
    for (const nodeId of entry.nodeIds) pushNode(nodeId, "node");
    return hits;
  }
  if (command?.[1] === "downstream" || command?.[1] === "upstream" || command?.[1] === "node") {
    pushNode(command[2]!.trim(), command[1] === "node" ? "node" : command[1]);
    return hits;
  }
  const needle = trimmed.toLowerCase();
  for (const node of nodes) {
    if (hits.length >= RETRIEVAL_MAX_HITS) break;
    const haystack = `${node.id} ${node.name} ${node.nameEn ?? ""}`.toLowerCase();
    if (!needle || !haystack.includes(needle)) continue;
    pushNode(node.id, "node");
  }
  return hits;
}

function finish(
  workspace: LoadedProjectOSWorkspace,
  caller: RetrievalCaller,
  kind: RetrievalKind,
  searched: boolean,
  hits: DraftHit[],
  omissions: Map<RetrievalOmissionReason, number>,
): RetrievalOutcome {
  const omissionList = [...omissions.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => a.reason.localeCompare(b.reason));
  const body = {
    caller,
    kind,
    searched,
    projectId: workspace.project.projectId,
    hits,
    omissions: omissionList,
    trust: RETRIEVAL_FENCE_NOTICE,
  };
  const contentHash = `sha256:${sha256(JSON.stringify(canonicalize(body)))}`;
  const snapshot = RetrievalSnapshotSchema.parse({
    ...body,
    snapshotId: `retrieval_${contentHash.slice(7, 23)}`,
    contentHash,
  });
  const summary: RetrievalSummary = {
    searched: snapshot.searched,
    contentHash: snapshot.contentHash,
    hitCount: snapshot.hits.length,
    paths: [...new Set(snapshot.hits.flatMap((hit) => (hit.path ? [hit.path] : [])))],
    corpora: [...new Set(snapshot.hits.map((hit) => hit.corpus))],
    omissions: snapshot.omissions,
    includesComposedGraph: snapshot.hits.some((hit) => hit.corpus === "composed_graph"),
  };
  return {
    snapshot,
    fence: renderRetrievalFence(snapshot),
    summary,
  };
}

function mergeOutcomes(
  projectId: string,
  caller: RetrievalCaller,
  outcomes: RetrievalOutcome[],
): RetrievalOutcome {
  const hits: DraftHit[] = [];
  const seen = new Set<string>();
  const omissions = new Map<RetrievalOmissionReason, number>();
  let searched = false;
  for (const outcome of outcomes) {
    if (outcome.snapshot.searched) searched = true;
    for (const omission of outcome.snapshot.omissions) {
      omissions.set(omission.reason, (omissions.get(omission.reason) ?? 0) + omission.count);
    }
    for (const hit of outcome.snapshot.hits) {
      if (seen.has(hit.stableId) || hits.length >= RETRIEVAL_MAX_HITS) continue;
      seen.add(hit.stableId);
      hits.push(hit);
    }
  }
  const workspace = { project: { projectId } } as LoadedProjectOSWorkspace;
  return finish(workspace, caller, "lexical", searched, hits, omissions);
}

function listProjectFiles(root: string): { paths: string[]; truncated: number } {
  const paths: string[] = [];
  let truncated = 0;
  const walk = (directory: string) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (paths.length >= MAX_SCAN_FILES) {
        truncated += 1;
        return;
      }
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      let stat;
      try {
        stat = lstatSync(absolute);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!stat.isFile()) continue;
      const extension = entry.name.includes(".") ? entry.name.slice(entry.name.lastIndexOf(".")) : "";
      if (SENSITIVE_EXTENSIONS.has(extension.toLowerCase())) continue;
      const rel = relative(root, absolute).split(sep).join("/");
      if (!rel || rel.startsWith("../") || rel === "..") continue;
      paths.push(rel);
    }
  };
  walk(root);
  paths.sort();
  return { paths, truncated };
}

function readProjectFile(
  root: string,
  relativePath: string,
): { text: string; sha256: string } | undefined {
  try {
    const absolute = join(root, relativePath);
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) return undefined;
    const bytes = readFileSync(absolute);
    if (bytes.includes(0)) return undefined;
    const text = bytes.toString("utf8");
    return { text, sha256: sha256(bytes) };
  } catch {
    return undefined;
  }
}

function normalizePrefix(prefix: string | undefined): string | undefined {
  if (!prefix) return undefined;
  const normalized = prefix.replaceAll("\\", "/").replace(/^\.\/+/u, "");
  if (
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.split("/").some((part) => part === "..")
  ) {
    return undefined;
  }
  return normalized.replace(/\/+$/u, "");
}

function extractSymbols(utterance: string): string[] {
  const found: string[] = [];
  for (const match of utterance.matchAll(SYMBOL_RE)) {
    const token = match[1]!;
    if (STOP.has(token.toLowerCase())) continue;
    if (!found.includes(token)) found.push(token);
    if (found.length >= 4) break;
  }
  return found;
}

function graphRevision(nodeId: string, neighbors: readonly string[]): string {
  return `sha256:${sha256(JSON.stringify({ nodeId, neighbors: [...neighbors] }))}`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}
