import { structuredPatch } from "diff";

import type { GeneratedDiff } from "../../contracts/diff.js";
import {
  estimateLocalContextTokens,
  SELECTED_FILE_MAX_ESTIMATED_TOKENS,
} from "../local-context-assembler.js";

export { WINDOWED_SELECTED_FILE_MAX_ESTIMATED_TOKENS } from "../local-context-assembler.js";

/**
 * What the model sees of a file too large to send whole. An edit used to need the whole file in the
 * prompt (and the validators got it three times: before, after and snapshot), so a file above
 * SELECTED_FILE_MAX_ESTIMATED_TOKENS could not be edited at all: excalidraw's 93,000-token App.tsx failed
 * a whole run. Such a file now goes to the model as an outline of its declarations plus exact, contiguous
 * regions: the ones the request talks about while the edit is located, the ones the plan anchors name
 * while it is written, and the ones around each change while it is validated. The model answers with
 * search/replace edits, which the server applies to the full snapshot, and every search must be unique
 * in the whole file, so an edit can only land where the model was shown.
 */

/** The result of a search/replace edit on a windowed file may be this large (UTF-8 bytes). */
export const WINDOWED_FILE_MAX_BYTES = 1_048_576;

const OUTLINE_TOKEN_BUDGET = 3_000;
const OUTLINE_ENTRY_MAX_CHARACTERS = 120;
const REGION_MAX_LINES = 320;
const HEAD_LINES = 30;
const FOCUS_CONTEXT_LINES = 15;
const OCCURRENCE_CONTEXT_LINES = 30;
const HUNK_CONTEXT_LINES = 6;
const VALIDATION_CONTEXT_LINES = 40;
const MAX_FOCUS_WINDOWS = 24;
const MAX_PINNED_OUTLINE_ENTRIES = 60;

export const LOCATE_REGION_TOKEN_BUDGET = 7_000;
export const EDIT_REGION_TOKEN_BUDGET = 14_000;
export const VALIDATION_REGION_TOKEN_BUDGET = 8_000;

export function needsWindowedView(content: string): boolean {
  return estimateLocalContextTokens(content) > SELECTED_FILE_MAX_ESTIMATED_TOKENS;
}

export interface FileRegion {
  startLine: number;
  endLine: number;
  text: string;
}

export interface WindowedFileView {
  representation: "windowed";
  totalLines: number;
  estimatedTokens: number;
  note: string;
  /** "<line>: <declaration text>", in file order. */
  outline: string[];
  outlineOmittedEntries: number;
  regions: FileRegion[];
}

interface OutlineEntry {
  line: number;
  indent: number;
  text: string;
}

const NOT_A_DECLARATION = new Set([
  "if", "for", "while", "switch", "catch", "return", "else", "do", "try", "new", "throw", "await",
  "yield", "case", "typeof", "sizeof", "with", "using", "lock", "foreach", "elif", "until", "unless",
  "super", "this", "console", "assert", "expect", "describe", "it", "test", "print", "println",
]);

const DECLARATION_PATTERNS: RegExp[] = [
  // JavaScript and TypeScript declarations.
  /^\s*(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\b|class\s+[A-Za-z_$]|interface\s+[A-Za-z_$]|enum\s+[A-Za-z_$]|type\s+[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*=|namespace\s+[A-Za-z_$])/u,
  // Functions and components held in a variable.
  /^\s*(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=]*)?=\s*(?:async\s+)?(?:\([^)]*\)?\s*(?::[^=]*)?(?:=>|$)|function\b|[A-Za-z_$][\w$]*\s*=>|(?:React\.)?(?:memo|forwardRef|createContext)\s*[(<])/u,
  // Class members held as arrow functions: `private handleClick = (event) => {`.
  /^\s+(?:(?:public|private|protected|static|readonly|override)\s+)*[A-Za-z_$][\w$]*\s*(?::[^=]*)?=\s*(?:async\s*)?\((?:[^;]*=>[^;]*|\s*)$/u,
  // Methods: `  async render(props: P): Element {`, `public void save(Owner owner) {`.
  /^\s*(?:(?:public|private|protected|static|readonly|async|override|abstract|get|set|final|virtual|internal|suspend|open|synchronized)\s+)*(?:[\w$.<>,[\]?*&]+\s+)?[A-Za-z_$][\w$]*\s*(?:<[^>()]*>)?\s*\([^;]*\)\s*(?::\s*[^={;]+)?(?:throws\s+[\w.,\s]+)?\s*\{\s*$/u,
  // Python.
  /^\s*(?:async\s+)?def\s+\w+|^\s*class\s+\w+/u,
  // Go.
  /^func\s|^type\s+\w+\s/u,
  // Rust.
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:fn|struct|enum|trait|impl|mod)\b/u,
  // Java, Kotlin, C#, Swift, Scala, Ruby, PHP type and function declarations.
  /^\s*(?:(?:public|private|protected|internal|static|final|abstract|sealed|open|data|partial|override|inline)\s+)*(?:class|interface|enum|record|struct|object|trait|protocol|extension|fun|func|def|module|function)\s+\w/u,
];

function indentOf(line: string): number {
  return (/^[ \t]*/u.exec(line)?.[0] ?? "").replace(/\t/gu, "    ").length;
}

function leadingWord(line: string): string {
  const stripped = line.trim().replace(/^(?:public|private|protected|static|readonly|async|override|export|default)\s+/u, "");
  return /^[A-Za-z_$][\w$]*/u.exec(stripped)?.[0] ?? "";
}

function isDeclaration(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("#")) return false;
  if (NOT_A_DECLARATION.has(leadingWord(line))) return false;
  return DECLARATION_PATTERNS.some((pattern) => pattern.test(line));
}

function outlineOf(lines: readonly string[]): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  lines.forEach((text, index) => {
    if (isDeclaration(text)) entries.push({ line: index + 1, indent: indentOf(text), text: text.trim() });
  });
  return entries;
}

/**
 * Keeps the outline within its budget by dropping the most deeply indented entries first, then by
 * sampling. Entries that mention the request's words are always kept: excalidraw's App class has
 * hundreds of members at one level, and a sample alone drops the one the request is about.
 */
function renderOutline(entries: readonly OutlineEntry[], terms: readonly string[] = []): { outline: string[]; omitted: number } {
  const render = (entry: OutlineEntry) => {
    const text = [...entry.text].length > OUTLINE_ENTRY_MAX_CHARACTERS
      ? `${[...entry.text].slice(0, OUTLINE_ENTRY_MAX_CHARACTERS - 1).join("")}…`
      : entry.text;
    return `${entry.line}: ${" ".repeat(Math.min(entry.indent, 12))}${text}`;
  };
  const lowered = entries.map((entry) => entry.text.toLowerCase());
  // As in focusSpans, a word on more than a tenth of the entries ("event", "handle") pins nothing.
  const telling = terms.filter((term) => {
    const frequency = lowered.reduce((count, text) => count + (text.includes(term) ? 1 : 0), 0);
    return frequency > 0 && frequency <= Math.max(3, entries.length / 10);
  });
  const pinned = new Set(
    entries
      .filter((_, index) => telling.some((term) => lowered[index]!.includes(term)))
      .slice(0, MAX_PINNED_OUTLINE_ENTRIES),
  );
  const indents = [...new Set(entries.map((entry) => entry.indent))].sort((a, b) => a - b);
  let kept = [...entries];
  for (;;) {
    const rendered = kept.map(render);
    const tokens = estimateLocalContextTokens(rendered.join("\n"));
    if (tokens <= OUTLINE_TOKEN_BUDGET) return { outline: rendered, omitted: entries.length - kept.length };
    const deepest = indents.pop();
    if (deepest === undefined || indents.length === 0) {
      // Only one indentation level is left: keep an even sample of it, and every pinned entry.
      const step = Math.ceil(tokens / OUTLINE_TOKEN_BUDGET) + 1;
      kept = kept.filter((entry, index) => pinned.has(entry) || index % step === 0);
      return { outline: kept.map(render), omitted: entries.length - kept.length };
    }
    kept = kept.filter((entry) => entry.indent < deepest || pinned.has(entry));
  }
}

/** The last line of the declaration that starts at `line` (1-based), by braces or else by indentation. */
function declarationEnd(lines: readonly string[], line: number): number {
  const start = line - 1;
  const opensBrace = lines.slice(start, start + 6).some((text) => text.includes("{"));
  const endsWithColon = /:\s*(?:#.*)?$/u.test(lines[start] ?? "");
  if (opensBrace && !endsWithColon) {
    let depth = 0;
    let opened = false;
    for (let index = start; index < lines.length; index += 1) {
      const code = lines[index]!.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*$/gu, "");
      for (const char of code) {
        if (char === "{") {
          depth += 1;
          opened = true;
        } else if (char === "}") {
          depth -= 1;
          if (opened && depth <= 0) return index + 1;
        }
      }
    }
    return lines.length;
  }
  const indent = indentOf(lines[start] ?? "");
  let last = line;
  for (let index = start + 1; index < lines.length; index += 1) {
    const text = lines[index]!;
    if (text.trim() === "") continue;
    if (indentOf(text) <= indent) break;
    last = index + 1;
  }
  return last;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "when", "then", "than", "will", "should",
  "must", "make", "made", "add", "adds", "added", "change", "changes", "changed", "update", "updates",
  "file", "files", "code", "use", "uses", "using", "used", "new", "old", "can", "not", "are", "was",
  "has", "have", "its", "it's", "also", "only", "each", "every", "all", "any", "one", "two", "more",
  "less", "same", "other", "user", "users", "want", "wants", "need", "needs", "please", "existing",
  "current", "currently", "keep", "kept", "behavior", "behaviour", "function", "method", "class",
  "value", "values", "return", "returns", "true", "false", "null", "undefined", "const", "let", "var",
  "import", "export", "default", "string", "number", "boolean", "object", "type", "types", "test",
  "tests", "does", "doesn", "don", "without", "within", "which", "what", "where", "how", "who",
  "there", "their", "them", "they", "you", "your", "our", "but", "out", "via", "per", "about",
]);

/** Words of a request, with camelCase and snake_case identifiers split into their parts too. */
export function focusTerms(text: string): string[] {
  const terms = new Set<string>();
  for (const word of text.match(/[A-Za-z_$][\w$]*/gu) ?? []) {
    const parts = [word, ...word.split(/[_$]+|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/u)];
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower.length >= 3 && !STOP_WORDS.has(lower)) terms.add(lower);
    }
  }
  return [...terms];
}

/** Identifiers named in an anchor ("App.handleCanvasDoubleClick method" → App, handleCanvasDoubleClick). */
function anchorIdentifiers(anchor: string): string[] {
  return (anchor.match(/[A-Za-z_$][\w$]*/gu) ?? []).filter((word) =>
    word.length >= 3 && !STOP_WORDS.has(word.toLowerCase()) && !NOT_A_DECLARATION.has(word),
  );
}

function wordPattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, "u");
}

interface Span {
  start: number;
  end: number;
}

/** Lines that mention the request's rarer words, best first, each with a few lines around it. */
function focusSpans(lines: readonly string[], terms: readonly string[]): Span[] {
  if (terms.length === 0) return [];
  const lowered = lines.map((line) => line.toLowerCase());
  const weights = new Map<string, number>();
  for (const term of terms) {
    const frequency = lowered.reduce((count, line) => count + (line.includes(term) ? 1 : 0), 0);
    // A word on more than a tenth of the lines says nothing about where to look.
    if (frequency === 0 || frequency > Math.max(3, lines.length / 10)) continue;
    weights.set(term, Math.log(1 + lines.length / frequency));
  }
  if (weights.size === 0) return [];
  const scored: Array<{ line: number; score: number }> = [];
  lowered.forEach((line, index) => {
    let score = 0;
    for (const [term, weight] of weights) if (line.includes(term)) score += weight;
    if (score > 0) scored.push({ line: index + 1, score });
  });
  scored.sort((left, right) => right.score - left.score || left.line - right.line);
  return scored.slice(0, MAX_FOCUS_WINDOWS).map(({ line }) => ({
    start: Math.max(1, line - FOCUS_CONTEXT_LINES),
    end: Math.min(lines.length, line + FOCUS_CONTEXT_LINES),
  }));
}

/** The declarations an anchor names, or the lines that mention it when no declaration does. */
function anchorSpans(lines: readonly string[], outline: readonly OutlineEntry[], anchors: readonly string[]): Span[] {
  const spans: Span[] = [];
  for (const anchor of anchors) {
    // "App.handleCanvasDoubleClick": the longest name is the most specific one; once a name of the
    // anchor is found declared, the shorter ones (the 10,000-line class) are not shown as well.
    const identifiers = anchorIdentifiers(anchor).sort((left, right) => right.length - left.length);
    let declaredOne = false;
    for (const identifier of identifiers) {
      if (declaredOne) break;
      const pattern = wordPattern(identifier);
      const declared = outline.filter((entry) => pattern.test(entry.text));
      if (declared.length > 0) {
        declaredOne = true;
        for (const entry of declared.slice(0, 3)) {
          spans.push({ start: Math.max(1, entry.line - 2), end: declarationEnd(lines, entry.line) });
        }
        continue;
      }
      let found = 0;
      for (let index = 0; index < lines.length && found < 3; index += 1) {
        if (!pattern.test(lines[index]!)) continue;
        found += 1;
        spans.push({
          start: Math.max(1, index + 1 - OCCURRENCE_CONTEXT_LINES),
          end: Math.min(lines.length, index + 1 + OCCURRENCE_CONTEXT_LINES),
        });
      }
    }
  }
  return spans;
}

/** Takes spans in priority order until the budget is spent, then merges the ones that touch. */
function selectRegions(lines: readonly string[], prioritized: readonly Span[], tokenBudget: number): FileRegion[] {
  const chosen: Span[] = [];
  let spent = 0;
  const covered = (line: number) => chosen.some((span) => span.start <= line && line <= span.end);
  for (const candidate of prioritized) {
    const span = {
      start: candidate.start,
      end: Math.min(candidate.end, candidate.start + REGION_MAX_LINES - 1),
    };
    let cost = 0;
    for (let line = span.start; line <= span.end; line += 1) {
      if (!covered(line)) cost += estimateLocalContextTokens(lines[line - 1] ?? "") + 1;
    }
    if (spent + cost > tokenBudget) {
      if (chosen.length > 0) continue;
      // The first span always goes in, cut to the budget.
      let end = span.start;
      let partial = 0;
      while (end <= span.end && partial + estimateLocalContextTokens(lines[end - 1] ?? "") + 1 <= tokenBudget) {
        partial += estimateLocalContextTokens(lines[end - 1] ?? "") + 1;
        end += 1;
      }
      span.end = Math.max(span.start, end - 1);
      cost = partial;
    }
    chosen.push(span);
    spent += cost;
  }
  const merged: Span[] = [];
  for (const span of [...chosen].sort((left, right) => left.start - right.start)) {
    const last = merged.at(-1);
    if (last && span.start <= last.end + 3) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged.map((span) => ({
    startLine: span.start,
    endLine: span.end,
    text: lines.slice(span.start - 1, span.end).join("\n"),
  }));
}

function viewNote(estimatedTokens: number, purpose: "locate" | "edit" | "validate"): string {
  const base = `This file is about ${estimatedTokens} tokens, too large to show whole. "outline" lists its declarations as "<line>: <text>". Each entry of "regions" is an exact, contiguous excerpt from startLine to endLine.`;
  if (purpose === "locate") {
    return `${base} Name anchors by the identifiers in the outline or regions nearest the change, so that the edit step is shown those declarations.`;
  }
  if (purpose === "edit") {
    return `${base} Only text shown in regions can be edited. Every search string must be copied exactly from one region and must occur only once in the whole file, so include enough surrounding lines to make it unique.`;
  }
  return `${base} The regions surround each changed hunk of the proposal.`;
}

function splitLines(content: string): string[] {
  return content.split("\n");
}

function viewFromSpans(
  content: string,
  spans: readonly Span[],
  budget: number,
  purpose: "locate" | "edit" | "validate",
  terms: readonly string[] = [],
): WindowedFileView {
  const lines = splitLines(content);
  const entries = outlineOf(lines);
  const { outline, omitted } = renderOutline(entries, terms);
  const estimatedTokens = estimateLocalContextTokens(content);
  return {
    representation: "windowed",
    totalLines: lines.length,
    estimatedTokens,
    note: viewNote(estimatedTokens, purpose),
    outline,
    outlineOmittedEntries: omitted,
    regions: selectRegions(lines, spans, budget),
  };
}

/** What the locate step sees: the outline and the regions the request's words point to. */
export function locateView(content: string, focusText: string): WindowedFileView {
  const lines = splitLines(content);
  const terms = focusTerms(focusText);
  const spans = [
    ...focusSpans(lines, terms),
    { start: 1, end: Math.min(lines.length, HEAD_LINES) },
  ];
  return viewFromSpans(content, spans, LOCATE_REGION_TOKEN_BUDGET, "locate", terms);
}

/** What the edit step sees: the declarations the plan anchors, the top of the file, then the request's words. */
export function editView(content: string, anchors: readonly string[], focusText: string): WindowedFileView {
  const lines = splitLines(content);
  const entries = outlineOf(lines);
  const terms = focusTerms(`${anchors.join(" ")} ${focusText}`);
  const spans = [
    ...anchorSpans(lines, entries, anchors),
    { start: 1, end: Math.min(lines.length, HEAD_LINES) },
    ...focusSpans(lines, terms),
  ];
  return viewFromSpans(content, spans, EDIT_REGION_TOKEN_BUDGET, "edit", terms);
}

interface ModelHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

function hunksOf(before: string, after: string): ModelHunk[] {
  const patch = structuredPatch("before", "after", before, after, undefined, undefined, { context: HUNK_CONTEXT_LINES });
  return patch.hunks.map((hunk) => ({
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    lines: hunk.lines,
  }));
}

/** What a validator sees of the file before the change: the outline and the regions around each change. */
export function validationView(before: string, after: string): WindowedFileView {
  const lines = splitLines(before);
  const spans = hunksOf(before, after).map((hunk) => ({
    start: Math.max(1, hunk.oldStart - VALIDATION_CONTEXT_LINES),
    end: Math.min(lines.length, hunk.oldStart + hunk.oldLines + VALIDATION_CONTEXT_LINES),
  }));
  return viewFromSpans(before, spans, VALIDATION_REGION_TOKEN_BUDGET, "validate");
}

type DiffFile = GeneratedDiff["files"][number];

function isWindowedDiffFile(file: DiffFile): boolean {
  return (file.before !== undefined && needsWindowedView(file.before)) ||
    (file.after !== undefined && needsWindowedView(file.after));
}

/**
 * A diff as a validator receives it. Files small enough are unchanged; a large modified file is
 * given as unified hunks, because before and after whole would be twice the file.
 */
export function diffForModel(diff: GeneratedDiff): unknown {
  if (!diff.files.some(isWindowedDiffFile)) return diff;
  return {
    ...diff,
    files: diff.files.map((file) => {
      if (!isWindowedDiffFile(file)) return file;
      if (file.changeType === "delete" && file.before !== undefined) {
        return {
          path: file.path,
          changeType: file.changeType,
          representation: "deleted",
          note: "This large file is deleted whole; its content is not shown.",
          beforeLineCount: splitLines(file.before).length,
        };
      }
      if (file.changeType !== "modify" || file.before === undefined || file.after === undefined) return file;
      return {
        path: file.path,
        changeType: file.changeType,
        representation: "hunks",
        note: "This file is too large to show whole; the change is given as unified hunks (lines starting with '-' are removed, '+' added, ' ' unchanged context).",
        beforeLineCount: splitLines(file.before).length,
        afterLineCount: splitLines(file.after).length,
        hunks: hunksOf(file.before, file.after),
      };
    }),
  };
}

/**
 * The snapshot a validator receives with a proposal: the whole file when it fits, otherwise the
 * outline and the regions around the change.
 */
export function snapshotForModel<T extends { selectedFileContent?: string | undefined }>(
  snapshot: T,
  diff: GeneratedDiff,
): T | (Omit<T, "selectedFileContent"> & { selectedFileView: WindowedFileView }) {
  const content = snapshot.selectedFileContent;
  if (content === undefined || !needsWindowedView(content)) return snapshot;
  const file = diff.files.find((candidate) => candidate.before === content);
  const { selectedFileContent: _omitted, ...rest } = snapshot;
  return {
    ...rest,
    selectedFileView: file?.after !== undefined
      ? validationView(content, file.after)
      : locateView(content, ""),
  };
}

/** A bound local context with its selected file replaced by a view, for the model only. */
export function localContextForModel<T extends { fileManifest: ReadonlyArray<{ relationship: string; content?: string | undefined }> }>(
  bundle: T,
  view: WindowedFileView | undefined,
): T {
  if (!view) return bundle;
  return {
    ...bundle,
    fileManifest: bundle.fileManifest.map((file) => {
      if (file.relationship !== "selected") return file;
      const { content: _omitted, ...rest } = file;
      return { ...rest, disposition: "windowed", view };
    }),
  };
}
