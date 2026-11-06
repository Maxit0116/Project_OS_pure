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
  "the", "and", "for", "with", "from", "that", "this", "what", "where", "how", "does", "file", "code",
  "function", "class", "please", "about", "project", "explain", "which", "when", "whose", "there",
  "their", "then", "than", "into", "onto", "over", "under", "have", "has", "had", "been", "being",
  "would", "could", "should", "will", "just", "also", "some", "any", "all", "each", "every", "more",
  "most", "much", "many", "such", "only", "very", "here", "your", "you", "our", "its", "are", "was",
  "were", "can", "not", "use", "used", "uses", "using", "make", "made", "shown", "show", "shows",
  "find", "value", "values", "name", "names", "list", "need", "want", "like", "work", "works",
  "happen", "happens", "mean", "means", "give", "get", "gets", "set", "sets", "after", "before",
  "while", "these", "those", "they", "them", "does", "did", "done", "user", "users", "app", "repo",
]);
const MAX_SYMBOLS = 10;
const MAX_HITS_PER_FILE = 3;
const WINDOW_RADIUS = 24;
const FILE_EXCERPT_CHARS = 4_000;

/**
 * Heuristic read-only exploration (DevPlan M1.A / Harness H1.B middle-ground).
 * Bounded multi-pass symbol grep + authorized reads. Never writes or shells.
 */
export function exploreForAskQuestion(
  workspace: LoadedProjectOSWorkspace,
  question: string,
  options?: AskExplorationOptions,
): AskExplorationResult {
  const maxHits = options?.maxHits ?? 16;
  const maxReads = options?.maxReads ?? 5;
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
      question,
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
  // Hits are in rank order (best file first), so the files read are the best matches, not whichever
  // came first in the index.
  for (const hit of hits) {
    if (readPaths.length >= maxReads) break;
    if (readPaths.includes(hit.path)) continue;
    const content = readCached(hit.path);
    if (content === undefined) continue;
    readPaths.push(hit.path);
    const fileHits = hits.filter((candidate) => candidate.path === hit.path).map((candidate) => candidate.line);
    const window = excerptWindow(content, hit.line);
    const read = { path: hit.path, ...window };
    reads.push(read);
    roundByPath.get(hit.path)?.reads.push(read);
    supplementalChunks.push(renderFileExcerpt(hit.path, content, fileHits));
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

/** Words and identifier parts to look for: the symbol itself, its lower-cased parts and a crude singular. */
function termsFor(symbol: string): string[] {
  const terms = new Set<string>();
  const lower = symbol.toLowerCase();
  terms.add(lower);
  if (lower.length > 4 && lower.endsWith("s") && !lower.endsWith("ss")) terms.add(lower.slice(0, -1));
  for (const part of symbol.split(/(?<=[a-z0-9])(?=[A-Z])|[_\-]+/u)) {
    const piece = part.toLowerCase();
    if (piece.length >= 4 && !STOP.has(piece)) terms.add(piece);
  }
  return [...terms];
}

const NOISE_LOCK = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock|go\.sum)$|\.(lock|snap|map)$|\.min\.(js|css)$/u;
const NOISE_DOCS = /\.(md|mdx|rst|txt)$|(^|\/)(docs?|dev-docs|documentation)\//iu;
const NOISE_TESTS = /(^|\/)(tests?|__tests__|spec|specs)\/|\.(test|spec)\.[a-z]+$|_test\.[a-z]+$/iu;
const DEFINITION = (term: string): RegExp =>
  new RegExp(
    `\\b(?:function|class|def|const|let|var|type|interface|enum|struct|func|fn|trait|record|impl)\\s+[A-Za-z0-9_$]*${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[A-Za-z0-9_$]*`,
    "iu",
  );

interface RankedFile {
  path: string;
  score: number;
  lines: Array<{ line: number; weight: number }>;
}

/**
 * Rank the searchable files for these symbols and return the best lines of the best files.
 * A term that appears in most files says little (weighted by how rare it is), a term in a file's
 * name or in a definition says a lot, and lock files, documents and tests count for less. The search
 * used to take the first twelve matching lines in index order, so in a large repository the answer
 * came from whichever files sorted first (a debug overlay, a lock file) and never from the code asked about.
 */
function collectHits(input: {
  symbols: string[];
  question: string;
  allowList: string[];
  readCached: (path: string) => string | undefined;
  hits: AskExplorationHit[];
  seenHitKeys: Set<string>;
  maxHits: number;
}): void {
  const termSets = input.symbols.map((symbol) => ({ symbol, terms: termsFor(symbol) }));
  const allTerms = [...new Set(termSets.flatMap((entry) => entry.terms))];
  if (allTerms.length === 0) return;
  const wantsDocs = /\b(docs?|documentation|readme|guide|changelog)\b/iu.test(input.question);
  const wantsTests = /\b(tests?|specs?|testing|coverage)\b/iu.test(input.question);

  const perFile: Array<{
    path: string;
    lines: string[];
    counts: Map<string, number>;
  }> = [];
  const docFrequency = new Map<string, number>();
  for (const path of input.allowList) {
    const content = input.readCached(path);
    if (content === undefined) continue;
    const lowerContent = content.toLowerCase();
    const counts = new Map<string, number>();
    for (const term of allTerms) {
      let count = 0;
      for (let at = lowerContent.indexOf(term); at !== -1 && count < 50; at = lowerContent.indexOf(term, at + term.length)) {
        count += 1;
      }
      if (count > 0) {
        counts.set(term, count);
        docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
      }
    }
    const pathLower = path.toLowerCase();
    if (counts.size === 0 && !allTerms.some((term) => pathLower.includes(term))) continue;
    perFile.push({ path, lines: content.split("\n"), counts });
  }
  if (perFile.length === 0) return;

  const total = perFile.length;
  const idf = (term: string): number => Math.log(1 + total / (docFrequency.get(term) ?? total));
  const ranked: RankedFile[] = [];
  for (const file of perFile) {
    const pathLower = file.path.toLowerCase();
    const base = pathLower.split("/").at(-1) ?? pathLower;
    const directories = pathLower.split("/").slice(0, -1).join("/");
    let score = 0;
    const matched = new Set<string>();
    for (const term of allTerms) {
      const count = file.counts.get(term) ?? 0;
      const weight = idf(term);
      if (count > 0) {
        score += weight * Math.min(count, 6);
        matched.add(term);
      }
      if (base.includes(term)) {
        score += weight * 8;
        matched.add(term);
      }
      if (directories.includes(term)) score += weight * 2;
    }
    if (matched.size === 0) continue;
    const symbolsCovered = termSets.filter((entry) => entry.terms.some((term) => matched.has(term))).length;
    score *= 1 + 0.5 * Math.max(0, symbolsCovered - 1);

    const lineScores: Array<{ line: number; weight: number }> = [];
    file.lines.forEach((text, index) => {
      const lowerLine = text.toLowerCase();
      let weight = 0;
      for (const term of allTerms) {
        if (lowerLine.includes(term)) weight += idf(term);
      }
      if (weight === 0) return;
      for (const term of allTerms) {
        if (lowerLine.includes(term) && DEFINITION(term).test(text)) {
          weight += idf(term) * 3;
          score += idf(term) * 3;
        }
      }
      lineScores.push({ line: index + 1, weight });
    });

    if (NOISE_LOCK.test(file.path)) score *= 0.05;
    else {
      if (!wantsDocs && NOISE_DOCS.test(file.path)) score *= 0.3;
      if (!wantsTests && NOISE_TESTS.test(file.path)) score *= 0.6;
    }
    lineScores.sort((left, right) => right.weight - left.weight || left.line - right.line);
    ranked.push({ path: file.path, score, lines: lineScores.slice(0, MAX_HITS_PER_FILE) });
  }
  ranked.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

  for (const file of ranked) {
    if (input.hits.length >= input.maxHits) return;
    const content = input.readCached(file.path) ?? "";
    const lines = content.split("\n");
    const chosen = file.lines.length > 0 ? file.lines : [{ line: 1, weight: 0 }];
    for (const { line } of [...chosen].sort((left, right) => left.line - right.line)) {
      if (input.hits.length >= input.maxHits) return;
      const key = `${file.path}:${line}`;
      if (input.seenHitKeys.has(key)) continue;
      input.seenHitKeys.add(key);
      input.hits.push({ path: file.path, line, preview: (lines[line - 1] ?? file.path).trim().slice(0, 160) });
    }
  }
}

/** The lines around the best hits of a file, not its first lines: a large file's head says nothing about the match. */
function renderFileExcerpt(path: string, content: string, hitLines: readonly number[]): string {
  if (content.length <= FILE_EXCERPT_CHARS) return `### ${path}\n\`\`\`\n${content}\n\`\`\``;
  const lines = content.split("\n");
  const windows: Array<[number, number]> = [];
  for (const hit of [...hitLines].sort((left, right) => left - right)) {
    const start = Math.max(1, hit - WINDOW_RADIUS);
    const end = Math.min(lines.length, hit + WINDOW_RADIUS);
    const last = windows.at(-1);
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else windows.push([start, end]);
  }
  const parts: string[] = [];
  let used = 0;
  for (const [start, end] of windows) {
    const body = lines.slice(start - 1, end).map((text, index) => `${start + index}: ${text}`).join("\n");
    const remaining = FILE_EXCERPT_CHARS - used;
    if (remaining <= 200) break;
    const clipped = body.length > remaining ? `${body.slice(0, remaining)}\n…` : body;
    parts.push(`lines ${start}-${end}\n${clipped}`);
    used += clipped.length;
  }
  return `### ${path} (${lines.length} lines; excerpts around the matches)\n\`\`\`\n${parts.join("\n…\n")}\n\`\`\``;
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
    if (found.size >= MAX_SYMBOLS) break;
  }
  return [...found];
}
