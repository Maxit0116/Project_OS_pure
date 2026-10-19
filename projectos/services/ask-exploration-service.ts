import { readFileSync } from "node:fs";

import type { CapabilityContext } from "../contracts/tool-policy.js";
import type { LoadedProjectOSWorkspace } from "../persistence/workspace-store.js";
import { resolveContainedPath } from "../utils/path-containment.js";
import {
  excerptWindow,
} from "./agent-activity-evidence.js";
import {
  assertToolAllowed,
  readCapabilityContext,
} from "./harness/tool-policy.js";

export interface AskExplorationHit {
  path: string;
  line: number;
  preview: string;
}

export interface AskExplorationRead {
  path: string;
  startLine: number;
  endLine: number;
  excerpt: string;
  truncated: boolean;
}

export interface AskExplorationRound {
  index: number;
  symbols: string[];
  hits: AskExplorationHit[];
  reads: AskExplorationRead[];
}

export interface AskExplorationTrace {
  queriedSymbols: string[];
  hits: AskExplorationHit[];
  readPaths: string[];
  reads: AskExplorationRead[];
  rounds: AskExplorationRound[];
  truncated: boolean;
  roundsUsed: number;
  maxRounds: number;
}

export interface AskExplorationResult {
  trace: AskExplorationTrace;
  supplementalMarkdown: string;
}

export interface AskExplorationOptions {
  /** From the assembled Ask context bundle. Empty = Global → use graph fileIndex ACL. */
  allowedReadPaths?: readonly string[];
  maxHits?: number;
  maxReads?: number;
  /**
   * Bounded read-only passes. Round 1 uses question symbols; later rounds
   * mine identifiers from hit previews and search again. Never writes/shells.
   */
  maxRounds?: number;
}

const SYMBOL_RE = /\b([A-Z][A-Za-z0-9_]{2,}|[a-z][A-Za-z0-9_]{3,})\b/gu;
const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "what",
  "where",
  "how",
  "does",
  "file",
  "code",
  "function",
  "class",
  "please",
  "about",
  "project",
  "explain",
]);

/**
 * Heuristic read-only exploration (DevPlan M1.A / Harness H1.B middle-ground).
 * Bounded multi-pass symbol grep + authorized reads. Never writes or shells.
 */
export function exploreForAskQuestion(
  workspace: LoadedProjectOSWorkspace,
  question: string,
  options?: AskExplorationOptions,
): AskExplorationResult {
  const maxHits = options?.maxHits ?? 12;
  const maxReads = options?.maxReads ?? 3;
  const maxRounds = Math.max(1, Math.min(options?.maxRounds ?? 1, 5));
  const allowList = resolveExplorationAllowList(
    workspace,
    options?.allowedReadPaths ?? [],
  );
  const policy = readCapabilityContext({
    mode: "ask",
    allowedReadPaths: allowList,
  });

  const contentCache = new Map<string, string | undefined>();
  const readCached = (path: string): string | undefined => {
    if (!contentCache.has(path)) {
      contentCache.set(path, readAuthorizedText(workspace, path, policy));
    }
    return contentCache.get(path);
  };

  const queriedSymbols: string[] = [];
  const hits: AskExplorationHit[] = [];
  const rounds: AskExplorationRound[] = [];
  const seenHitKeys = new Set<string>();
  let roundSymbols = extractSymbols(question);
  let roundsUsed = 0;

  for (let round = 0; round < maxRounds; round += 1) {
    if (roundSymbols.length === 0 || hits.length >= maxHits) break;
    const symbols = [...roundSymbols];
    for (const symbol of symbols) {
      if (!queriedSymbols.includes(symbol)) queriedSymbols.push(symbol);
    }
    const roundStart = hits.length;
    collectHits({
      symbols,
      allowList,
      readCached,
      hits,
      seenHitKeys,
      maxHits,
    });
    roundsUsed = round + 1;
    const roundRecord: AskExplorationRound = {
      index: roundsUsed,
      symbols,
      hits: hits.slice(roundStart),
      reads: [],
    };
    rounds.push(roundRecord);
    if (hits.length === roundStart) break;
    if (round + 1 >= maxRounds) break;
    const previewText = roundRecord.hits.map((hit) => hit.preview).join("\n");
    const next = extractSymbols(previewText).filter(
      (symbol) => !queriedSymbols.includes(symbol),
    );
    roundSymbols = next.slice(0, 4);
  }

  const readPaths: string[] = [];
  const reads: AskExplorationRead[] = [];
  const supplementalChunks: string[] = [];
  const roundByPath = new Map<string, AskExplorationRound>();
  for (const roundRecord of rounds) {
    for (const hit of roundRecord.hits) {
      if (!roundByPath.has(hit.path)) roundByPath.set(hit.path, roundRecord);
    }
  }
  for (const hit of hits) {
    if (readPaths.length >= maxReads) break;
    if (readPaths.includes(hit.path)) continue;
    const content = readCached(hit.path);
    if (content === undefined) continue;
    readPaths.push(hit.path);
    const window = excerptWindow(content, hit.line);
    const read = { path: hit.path, ...window };
    reads.push(read);
    roundByPath.get(hit.path)?.reads.push(read);
    supplementalChunks.push(
      `### ${hit.path}\n\`\`\`\n${content.slice(0, 4_000)}\n\`\`\``,
    );
  }

  const trace: AskExplorationTrace = {
    queriedSymbols,
    hits,
    readPaths,
    reads,
    rounds,
    truncated: hits.length >= maxHits || readPaths.length >= maxReads,
    roundsUsed,
    maxRounds,
  };

  const supplementalMarkdown = supplementalChunks.length
    ? [
        "## Ask exploration (read-only)",
        `Rounds used: ${roundsUsed}/${maxRounds}; symbols: ${queriedSymbols.join(", ") || "(none)"}`,
        `Hits: ${hits.length}; files read: ${readPaths.join(", ") || "(none)"}`,
        ...supplementalChunks,
      ].join("\n\n")
    : "";

  return { trace, supplementalMarkdown };
}

function collectHits(input: {
  symbols: string[];
  allowList: string[];
  readCached: (path: string) => string | undefined;
  hits: AskExplorationHit[];
  seenHitKeys: Set<string>;
  maxHits: number;
}): void {
  for (const symbol of input.symbols) {
    if (input.hits.length >= input.maxHits) return;
    for (const path of input.allowList) {
      if (input.hits.length >= input.maxHits) return;
      const content = input.readCached(path);
      if (content === undefined) continue;
      const lines = content.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        if (input.hits.length >= input.maxHits) return;
        const line = lines[index]!;
        if (!line.includes(symbol)) continue;
        const key = `${path}:${index + 1}:${symbol}`;
        if (input.seenHitKeys.has(key)) continue;
        input.seenHitKeys.add(key);
        input.hits.push({
          path,
          line: index + 1,
          preview: line.trim().slice(0, 160),
        });
      }
    }
  }
}

/**
 * Searchable corpus: graph fileIndex ∩ allowedReadPaths.
 * When allowedReadPaths is empty (Global Ask), the fileIndex itself is the ACL.
 */
export function resolveExplorationAllowList(
  workspace: LoadedProjectOSWorkspace,
  allowedReadPaths: readonly string[],
): string[] {
  const indexed = workspace.graph.fileIndex.map((entry) => entry.path);
  if (allowedReadPaths.length === 0) {
    return indexed;
  }
  const indexedSet = new Set(indexed);
  return allowedReadPaths.filter((path) => indexedSet.has(path));
}

function readAuthorizedText(
  workspace: LoadedProjectOSWorkspace,
  relativePath: string,
  policy: CapabilityContext,
): string | undefined {
  try {
    assertToolAllowed({ tool: "read_file", path: relativePath }, policy);
    const absolute = resolveContainedPath(workspace.workspaceRoot, relativePath);
    return readFileSync(absolute, "utf8");
  } catch {
    return undefined;
  }
}

function extractSymbols(question: string): string[] {
  const found = new Set<string>();
  for (const match of question.matchAll(SYMBOL_RE)) {
    const token = match[1]!;
    if (STOP.has(token.toLowerCase())) continue;
    found.add(token);
    if (found.size >= 6) break;
  }
  return [...found];
}
