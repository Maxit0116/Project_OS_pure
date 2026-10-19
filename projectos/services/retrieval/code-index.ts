import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const CHUNK_LINE_LIMIT = 40;
const INDEX_FILE = "code-index.json";
const CHANGE_FILE = "changes.jsonl";

export interface SourceChunk {
  id: string;
  startLine: number;
  text: string;
}

export interface IndexedFile {
  sha256: string;
  chunks: SourceChunk[];
}

interface CodeIndexFile {
  version: 1;
  appliedSeq: number;
  files: Record<string, IndexedFile>;
}

export interface RetrievalChange {
  path: string;
  sha256?: string;
  deleted?: boolean;
}

export interface CodeSearchMatch {
  path: string;
  line: number;
  quote: string;
  sha256: string;
  chunkId: string;
}

export interface CodeSearchResult {
  matches: CodeSearchMatch[];
  rechunked: string[];
  stale: number;
  truncatedFiles: number;
  watermark: number;
}

export function chunkSource(text: string): SourceChunk[] {
  const lines = text.split("\n");
  const chunks: SourceChunk[] = [];
  let start = 0;
  while (start < lines.length) {
    const end = Math.min(start + CHUNK_LINE_LIMIT, lines.length);
    const body = lines.slice(start, end).join("\n");
    if (body.trim()) {
      chunks.push({
        id: sha256(body),
        startLine: start + 1,
        text: body,
      });
    }
    start = end;
  }
  return chunks;
}

export function appendRetrievalChangeFeed(
  projectOSRoot: string,
  changes: readonly RetrievalChange[],
): number {
  if (changes.length === 0) return readWatermark(projectOSRoot);
  const directory = retrievalDir(projectOSRoot);
  mkdirSync(directory, { recursive: true });
  const file = join(directory, CHANGE_FILE);
  let seq = readWatermark(projectOSRoot);
  const lines: string[] = [];
  for (const change of changes) {
    seq += 1;
    lines.push(JSON.stringify({
      seq,
      path: change.path,
      ...(change.sha256 ? { sha256: change.sha256 } : {}),
      ...(change.deleted ? { deleted: true } : {}),
    }));
  }
  writeFileSync(file, `${existsSync(file) ? readFileSync(file, "utf8") : ""}${lines.join("\n")}\n`, "utf8");
  return seq;
}

export function searchCodeIndex(input: {
  workspaceRoot: string;
  projectOSRoot: string;
  paths: readonly string[];
  ignored: ReadonlySet<string>;
  query: string;
  readFile: (relativePath: string) => { text: string; sha256: string } | undefined;
  requireFresh?: boolean;
}): CodeSearchResult {
  const index = readIndex(input.projectOSRoot);
  const feed = readChanges(input.projectOSRoot);
  let stale = 0;
  const pending = feed.filter((entry) => entry.seq > index.appliedSeq);
  for (const change of pending) {
    const current = index.files[change.path];
    if (!current) continue;
    if (change.deleted || (change.sha256 && hashBody(change.sha256) !== hashBody(current.sha256))) {
      delete index.files[change.path];
      stale += current.chunks.length;
    }
  }
  if (input.requireFresh && stale > 0) {
    index.appliedSeq = feed.at(-1)?.seq ?? index.appliedSeq;
    writeIndex(input.projectOSRoot, index);
    return {
      matches: [],
      rechunked: [],
      stale,
      truncatedFiles: 0,
      watermark: index.appliedSeq,
    };
  }

  const rechunked: string[] = [];
  const live = new Set(input.paths);
  for (const path of Object.keys(index.files)) {
    if (!live.has(path) || input.ignored.has(path)) {
      stale += index.files[path]!.chunks.length;
      delete index.files[path];
    }
  }
  for (const path of input.paths) {
    if (input.ignored.has(path)) continue;
    const read = input.readFile(path);
    if (!read) {
      if (index.files[path]) {
        stale += index.files[path]!.chunks.length;
        delete index.files[path];
      }
      continue;
    }
    const existing = index.files[path];
    if (existing?.sha256 === read.sha256) continue;
    if (existing) stale += existing.chunks.length;
    index.files[path] = { sha256: read.sha256, chunks: chunkSource(read.text) };
    rechunked.push(path);
  }
  index.appliedSeq = feed.at(-1)?.seq ?? index.appliedSeq;
  writeIndex(input.projectOSRoot, index);

  const matches: CodeSearchMatch[] = [];
  for (const [path, file] of Object.entries(index.files)) {
    if (!file.chunks.some((chunk) => chunk.text.includes(input.query)) && !path.includes(input.query)) {
      continue;
    }
    const read = input.readFile(path);
    if (!read || read.sha256 !== file.sha256) {
      stale += file.chunks.length;
      delete index.files[path];
      continue;
    }
    const lines = read.text.split("\n");
    const lineIndex = lines.findIndex((line) => line.includes(input.query));
    const quote = (lineIndex >= 0 ? lines[lineIndex]! : path).trim();
    const chunk = file.chunks.find((item) => item.text.includes(input.query)) ?? file.chunks[0];
    if (!chunk) continue;
    matches.push({
      path,
      line: lineIndex >= 0 ? lineIndex + 1 : chunk.startLine,
      quote,
      sha256: read.sha256,
      chunkId: chunk.id,
    });
  }
  if (stale > 0) writeIndex(input.projectOSRoot, index);
  return {
    matches,
    rechunked,
    stale,
    truncatedFiles: 0,
    watermark: index.appliedSeq,
  };
}

export function indexedChunkIds(projectOSRoot: string, path: string): string[] {
  return readIndex(projectOSRoot).files[path]?.chunks.map((chunk) => chunk.id) ?? [];
}

function readWatermark(projectOSRoot: string): number {
  return readChanges(projectOSRoot).at(-1)?.seq ?? 0;
}

function readChanges(projectOSRoot: string): Array<RetrievalChange & { seq: number }> {
  const file = join(retrievalDir(projectOSRoot), CHANGE_FILE);
  if (!existsSync(file)) return [];
  const changes: Array<RetrievalChange & { seq: number }> = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as { seq?: number; path?: string; sha256?: string; deleted?: boolean };
      if (!parsed.path || typeof parsed.seq !== "number") continue;
      changes.push({
        seq: parsed.seq,
        path: parsed.path,
        ...(parsed.sha256 ? { sha256: parsed.sha256 } : {}),
        ...(parsed.deleted ? { deleted: true } : {}),
      });
    } catch {
      continue;
    }
  }
  return changes;
}

function readIndex(projectOSRoot: string): CodeIndexFile {
  const file = join(retrievalDir(projectOSRoot), INDEX_FILE);
  if (!existsSync(file)) return { version: 1, appliedSeq: 0, files: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as CodeIndexFile;
    if (parsed.version !== 1 || !parsed.files) return { version: 1, appliedSeq: 0, files: {} };
    return parsed;
  } catch {
    return { version: 1, appliedSeq: 0, files: {} };
  }
}

function writeIndex(projectOSRoot: string, index: CodeIndexFile): void {
  const directory = retrievalDir(projectOSRoot);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, INDEX_FILE), JSON.stringify(index), "utf8");
}

function retrievalDir(projectOSRoot: string): string {
  return join(projectOSRoot, "retrieval");
}

function hashBody(value: string | undefined): string {
  return (value ?? "").replace(/^sha256:/u, "");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function listJsonlFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .map((name) => join(directory, name));
}
