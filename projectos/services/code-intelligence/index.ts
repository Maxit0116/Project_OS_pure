import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { extname, join, relative, sep } from "node:path";

import type { CodeFileUnderstandingEntry } from "../../contracts/code-file-understanding.js";
import {
  CodeInventoryDocumentSchema,
  CodeSymbolHitSchema,
  CodeSymbolIndexDocumentSchema,
  emptyCodeInventoryDocument,
  emptyCodeSymbolIndexDocument,
  type CodeIntelligenceLanguage,
  type CodeInventoryDocument,
  type CodeInventoryFile,
  type CodeInventoryOmission,
  type CodeSymbol,
  type CodeSymbolFile,
  type CodeSymbolHit,
  type CodeSymbolIndexDocument,
  type CodeSymbolQueryOmission,
} from "../../contracts/code-intelligence.js";
import { hashFileContent } from "../code-file-understanding-service.js";
import {
  findCodeFileUnderstandingEntry,
  readCodeFileUnderstandingDocument,
} from "../code-file-understanding-store.js";
import { containsHighConfidenceSecret } from "../high-confidence-secret-patterns.js";
import { DefaultWorkspaceIgnorePolicy } from "../local-context-assembler.js";
import type { ModelProfile } from "../../contracts/settings.js";
import type { ResolvedResponseLanguage } from "../agent-language-policy.js";
import { extractExportedSymbols } from "./extract-exports.js";
import { buildCodeImpact } from "./impact.js";
import {
  refreshUnderstandings,
  type UnderstandingGenerator,
} from "./refresh-understanding.js";

const INVENTORY_PATH = join(".projectos", "code-intelligence", "inventory.json");
const SYMBOL_PATH = join(".projectos", "code-intelligence", "symbols.json");
const MAX_FILE_BYTES = 1_048_576;
const MAX_TRACKED_FILES = 20_000;

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".git",
  ".projectos",
]);

/** Same extensions the retrieval broker refuses to read. */
const SENSITIVE_EXTENSIONS = new Set([
  ".key",
  ".pem",
  ".p12",
  ".pfx",
  ".crt",
  ".cer",
]);

export interface CodeIntelligenceSyncResult {
  inventory: CodeInventoryDocument;
  symbols: CodeSymbolIndexDocument;
}

export interface CodeSymbolQueryResult {
  symbols: CodeSymbolHit[];
  omissions: CodeSymbolQueryOmission[];
}

export interface CodeFileUnderstandingState {
  found: boolean;
  stale: boolean;
  entry: CodeFileUnderstandingEntry | null;
  /** Safe to place in model context. Absent when the entry is missing or stale. */
  context: { description: string; role: string } | null;
}

interface DiskFile {
  path: string;
  size: number;
  mtimeMs: number;
}

/**
 * Refresh the file inventory and exported-symbol index.
 * Does not create graph nodes, edit linked files, or grant write paths.
 */
export function syncCodeIntelligence(input: {
  workspaceRoot: string;
  projectId: string;
  scannedAt?: string;
}): CodeIntelligenceSyncResult {
  const previousInventory = readInventory(input.workspaceRoot, input.projectId);
  const previousSymbols = readSymbolIndex(input.workspaceRoot, input.projectId);
  const previousFiles = new Map(previousInventory.files.map((file) => [file.path, file]));
  const previousOmissions = new Map(previousInventory.omissions.map((item) => [item.path, item]));
  const previousSymbolFiles = new Map(previousSymbols.files.map((file) => [file.path, file]));

  const discovered = discoverFiles(input.workspaceRoot);
  const files: CodeInventoryFile[] = [];
  const omissions: CodeInventoryOmission[] = [];
  const symbolFiles: CodeSymbolFile[] = [];

  for (const disk of discovered.files) {
    const priorFile = previousFiles.get(disk.path);
    const priorOmission = previousOmissions.get(disk.path);
    const unchanged = sameFingerprint(priorFile, disk) || sameFingerprint(priorOmission, disk);
    if (isSensitiveExtension(disk.path)) {
      omissions.push(omission(disk, "secret"));
      continue;
    }
    if (disk.size > MAX_FILE_BYTES) {
      omissions.push(omission(disk, "too_large"));
      continue;
    }
    if (unchanged && priorFile) {
      files.push({ ...priorFile, size: disk.size, mtimeMs: disk.mtimeMs });
      const cached = previousSymbolFiles.get(disk.path);
      if (priorFile.language === "unsupported") continue;
      if (cached && cached.contentHash === priorFile.contentHash) symbolFiles.push(cached);
      else symbolFiles.push(parseSymbolFile(input.workspaceRoot, priorFile));
      continue;
    }
    if (unchanged && priorOmission) {
      omissions.push({ ...priorOmission, size: disk.size, mtimeMs: disk.mtimeMs });
      continue;
    }

    const read = readSource(input.workspaceRoot, disk.path);
    if (read.status !== "text") {
      omissions.push(omission(disk, read.status));
      continue;
    }
    if (containsHighConfidenceSecret(read.text)) {
      omissions.push(omission(disk, "secret"));
      continue;
    }
    const file: CodeInventoryFile = {
      path: disk.path,
      language: languageOf(disk.path),
      size: disk.size,
      contentHash: hashFileContent(read.text),
      mtimeMs: disk.mtimeMs,
    };
    files.push(file);
    if (file.language !== "unsupported") symbolFiles.push(parseSymbolText(file, read.text));
  }

  const inventory = CodeInventoryDocumentSchema.parse({
    version: "0.1.0",
    projectId: input.projectId,
    scannedAt: input.scannedAt ?? new Date().toISOString(),
    truncated: discovered.truncated,
    files: files.sort(byPath),
    omissions: omissions.sort(byPath),
  });
  const symbols = CodeSymbolIndexDocumentSchema.parse({
    version: "0.1.0",
    projectId: input.projectId,
    files: symbolFiles.sort(byPath),
  });
  writeJson(input.workspaceRoot, INVENTORY_PATH, inventory);
  writeJson(input.workspaceRoot, SYMBOL_PATH, symbols);
  return { inventory, symbols };
}

/**
 * Related tests already recorded by the symbol index.
 * Returns null when the index file is absent so callers do not guess paths.
 * The names are not commands and do not change write scope.
 */
export function suggestedTestsFromIndex(input: {
  workspaceRoot: string;
  projectId: string;
  plannedPaths: readonly string[];
}): string[] | null {
  if (!existsSync(join(input.workspaceRoot, SYMBOL_PATH))) return null;
  const inventory = readInventory(input.workspaceRoot, input.projectId);
  const symbols = readSymbolIndex(input.workspaceRoot, input.projectId);
  if (symbols.files.length === 0) return [];
  const found: string[] = [];
  for (const path of input.plannedPaths) {
    const impact = buildCodeImpact({
      workspaceRoot: input.workspaceRoot,
      path,
      inventory,
      symbols,
    });
    for (const test of impact.tests) {
      if (!found.includes(test.path)) found.push(test.path);
    }
  }
  return found;
}

export function lookupSymbols(input: {
  workspaceRoot: string;
  projectId: string;
  name: string;
  pathPrefix?: string;
  nodeIdsByPath?: ReadonlyMap<string, readonly string[]>;
}): CodeSymbolQueryResult {
  if (!input.name) return { symbols: [], omissions: [] };
  const prefix = normalizePrefix(input.pathPrefix);
  if (input.pathPrefix && !prefix) return { symbols: [], omissions: [] };
  const synced = syncCodeIntelligence(input);
  const paths = synced.symbols.files
    .filter((file) => file.symbols.some((symbol) => symbol.name === input.name))
    .map((file) => file.path)
    .filter((path) => !prefix || path === prefix || path.startsWith(`${prefix}/`))
    .sort();
  const hits: CodeSymbolHit[] = [];
  const omissions: CodeSymbolQueryOmission[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const confirmed = confirmSymbolFile(input.workspaceRoot, input.projectId, path);
    pushOmissions(omissions, seen, path, confirmed);
    for (const symbol of confirmed.file?.symbols ?? []) {
      if (symbol.name !== input.name) continue;
      if (symbol.contentHash !== confirmed.file?.contentHash) continue;
      hits.push(toHit(symbol, input.nodeIdsByPath?.get(path) ?? []));
    }
  }
  return { symbols: hits, omissions };
}

export function symbolsInFile(input: {
  workspaceRoot: string;
  projectId: string;
  path: string;
  nodeIdsByPath?: ReadonlyMap<string, readonly string[]>;
}): CodeSymbolQueryResult {
  const path = normalizePrefix(input.path);
  if (!path) return { symbols: [], omissions: [] };
  const synced = syncCodeIntelligence(input);
  const secret = synced.inventory.omissions.find(
    (item) => item.path === path && item.reason === "secret",
  );
  if (secret) return { symbols: [], omissions: [{ path, reason: "secret" }] };
  const inventoried = synced.inventory.files.find((file) => file.path === path);
  if (!inventoried) return { symbols: [], omissions: [{ path, reason: "not_indexed" }] };
  if (inventoried.language === "unsupported") {
    return { symbols: [], omissions: [{ path, reason: "unsupported_language" }] };
  }
  const confirmed = confirmSymbolFile(input.workspaceRoot, input.projectId, path);
  const omissions: CodeSymbolQueryOmission[] = [];
  pushOmissions(omissions, new Set(), path, confirmed);
  const fresh = (confirmed.file?.symbols ?? []).filter(
    (symbol) => symbol.contentHash === confirmed.file?.contentHash,
  );
  return {
    symbols: fresh.map((symbol) => toHit(symbol, input.nodeIdsByPath?.get(path) ?? [])),
    omissions,
  };
}

/**
 * A description whose hash does not match the current file is stale.
 * Callers that build model context must read `context`, which is null when stale.
 */
export function readCodeFileUnderstandingState(input: {
  workspaceRoot: string;
  projectId: string;
  path: string;
  currentContentHash: string;
}): CodeFileUnderstandingState {
  const document = readCodeFileUnderstandingDocument(input.workspaceRoot, input.projectId);
  const entry = findCodeFileUnderstandingEntry(document, input.path) ?? null;
  if (!entry) return { found: false, stale: false, entry: null, context: null };
  const stale = entry.contentHash !== input.currentContentHash;
  return {
    found: true,
    stale,
    entry,
    context: stale ? null : { description: entry.description, role: entry.role },
  };
}

export function nodeIdsByPathFromFileIndex(
  fileIndex: readonly { path: string; nodeIds: readonly string[] }[],
): Map<string, readonly string[]> {
  return new Map(fileIndex.map((file) => [file.path, file.nodeIds]));
}

export function codeImpact(input: {
  workspaceRoot: string;
  projectId: string;
  path: string;
  symbolName?: string;
  nodeIdsByPath?: ReadonlyMap<string, readonly string[]>;
}) {
  const synced = syncCodeIntelligence(input);
  return buildCodeImpact({
    workspaceRoot: input.workspaceRoot,
    path: input.path,
    inventory: synced.inventory,
    symbols: synced.symbols,
    ...(input.symbolName ? { symbolName: input.symbolName } : {}),
    ...(input.nodeIdsByPath ? { nodeIdsByPath: input.nodeIdsByPath } : {}),
  });
}

export async function refreshStaleCodeFileUnderstandings(input: {
  workspaceRoot: string;
  projectId: string;
  generator: UnderstandingGenerator;
  profile: ModelProfile;
  responseLanguage: ResolvedResponseLanguage;
  fileLimit?: number;
}) {
  const synced = syncCodeIntelligence(input);
  return refreshUnderstandings({
    workspaceRoot: input.workspaceRoot,
    projectId: input.projectId,
    inventory: synced.inventory,
    symbols: synced.symbols,
    generator: input.generator,
    profile: input.profile,
    responseLanguage: input.responseLanguage,
    ...(input.fileLimit === undefined ? {} : { fileLimit: input.fileLimit }),
  });
}

function confirmSymbolFile(
  workspaceRoot: string,
  projectId: string,
  path: string,
): { file: CodeSymbolFile | null; omission: CodeSymbolQueryOmission | null } {
  const inventory = readInventory(workspaceRoot, projectId);
  const symbols = readSymbolIndex(workspaceRoot, projectId);
  const indexed = inventory.files.find((file) => file.path === path);
  const existing = symbols.files.find((file) => file.path === path) ?? null;
  const disk = statFile(workspaceRoot, path);
  if (!disk || !indexed) return { file: null, omission: { path, reason: "not_indexed" } };

  const read = readSource(workspaceRoot, path);
  if (read.status !== "text") return { file: null, omission: { path, reason: "not_indexed" } };
  if (containsHighConfidenceSecret(read.text)) {
    replaceFileFacts(workspaceRoot, inventory, symbols, path, null, omission(disk, "secret"));
    return { file: null, omission: { path, reason: "secret" } };
  }
  const contentHash = hashFileContent(read.text);
  if (existing && existing.contentHash === contentHash && indexed.contentHash === contentHash) {
    return { file: existing, omission: null };
  }
  const nextFile = parseSymbolText(
    { ...indexed, contentHash, size: disk.size, mtimeMs: disk.mtimeMs },
    read.text,
  );
  replaceFileFacts(workspaceRoot, inventory, symbols, path, {
    inventoryFile: { ...indexed, contentHash, size: disk.size, mtimeMs: disk.mtimeMs },
    symbolFile: nextFile,
  }, null);
  return {
    file: nextFile,
    omission: nextFile.omissions.includes("parse_failed") ? { path, reason: "parse_failed" } : null,
  };
}

function replaceFileFacts(
  workspaceRoot: string,
  inventory: CodeInventoryDocument,
  symbols: CodeSymbolIndexDocument,
  path: string,
  next: { inventoryFile: CodeInventoryFile; symbolFile: CodeSymbolFile } | null,
  dropped: CodeInventoryOmission | null,
): void {
  const files = inventory.files.filter((file) => file.path !== path);
  const omissions = inventory.omissions.filter((item) => item.path !== path);
  const symbolFiles = symbols.files.filter((file) => file.path !== path);
  if (next) {
    files.push(next.inventoryFile);
    symbolFiles.push(next.symbolFile);
  }
  if (dropped) omissions.push(dropped);
  writeJson(workspaceRoot, INVENTORY_PATH, CodeInventoryDocumentSchema.parse({
    ...inventory,
    files: files.sort(byPath),
    omissions: omissions.sort(byPath),
  }));
  writeJson(workspaceRoot, SYMBOL_PATH, CodeSymbolIndexDocumentSchema.parse({
    ...symbols,
    files: symbolFiles.sort(byPath),
  }));
}

function parseSymbolFile(workspaceRoot: string, file: CodeInventoryFile): CodeSymbolFile {
  const read = readSource(workspaceRoot, file.path);
  if (read.status !== "text") {
    return { path: file.path, contentHash: file.contentHash, symbols: [], omissions: ["parse_failed"] };
  }
  return parseSymbolText(file, read.text);
}

function parseSymbolText(file: CodeInventoryFile, text: string): CodeSymbolFile {
  try {
    const extracted = extractExportedSymbols(file.path, text, file.contentHash);
    return {
      path: file.path,
      contentHash: file.contentHash,
      symbols: extracted.symbols,
      omissions: extracted.omissions,
    };
  } catch {
    return { path: file.path, contentHash: file.contentHash, symbols: [], omissions: ["parse_failed"] };
  }
}

function discoverFiles(workspaceRoot: string): { files: DiskFile[]; truncated: boolean } {
  const paths: string[] = [];
  let truncated = false;
  const walk = (directory: string) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (paths.length >= MAX_TRACKED_FILES) {
        truncated = true;
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
      const path = relative(workspaceRoot, absolute).split(sep).join("/");
      if (!path || path.startsWith("../") || path === "..") continue;
      paths.push(path);
    }
  };
  walk(workspaceRoot);
  const ignored = new DefaultWorkspaceIgnorePolicy().ignoredPaths(workspaceRoot, paths);
  const files: DiskFile[] = [];
  for (const path of paths.sort()) {
    if (ignored.has(path)) continue;
    const disk = statFile(workspaceRoot, path);
    if (disk) files.push(disk);
  }
  return { files, truncated };
}

function statFile(workspaceRoot: string, path: string): DiskFile | null {
  try {
    const absolute = join(workspaceRoot, ...path.split("/"));
    const stat = lstatSync(absolute, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const size = stat.size > BigInt(Number.MAX_SAFE_INTEGER)
      ? Number.MAX_SAFE_INTEGER
      : Number(stat.size);
    return { path, size, mtimeMs: Number(stat.mtimeNs / 1_000_000n) };
  } catch {
    return null;
  }
}

function readSource(
  workspaceRoot: string,
  path: string,
): { status: "text"; text: string } | { status: "binary" | "unreadable" } {
  try {
    const absolute = join(workspaceRoot, ...path.split("/"));
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) {
      return { status: "unreadable" };
    }
    const bytes = readFileSync(absolute);
    if (bytes.includes(0)) return { status: "binary" };
    return { status: "text", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { status: "unreadable" };
  }
}

function readInventory(workspaceRoot: string, projectId: string): CodeInventoryDocument {
  return readDocument(
    workspaceRoot,
    INVENTORY_PATH,
    projectId,
    CodeInventoryDocumentSchema,
    emptyCodeInventoryDocument(projectId, new Date(0).toISOString()),
  );
}

function readSymbolIndex(workspaceRoot: string, projectId: string): CodeSymbolIndexDocument {
  return readDocument(
    workspaceRoot,
    SYMBOL_PATH,
    projectId,
    CodeSymbolIndexDocumentSchema,
    emptyCodeSymbolIndexDocument(projectId),
  );
}

function readDocument<T extends { projectId: string }>(
  workspaceRoot: string,
  relativePath: string,
  projectId: string,
  schema: { parse: (value: unknown) => T },
  empty: T,
): T {
  const fullPath = join(workspaceRoot, relativePath);
  if (!existsSync(fullPath)) return empty;
  try {
    const parsed = schema.parse(JSON.parse(readFileSync(fullPath, "utf8")));
    if (parsed.projectId !== projectId) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

function writeJson(workspaceRoot: string, relativePath: string, value: unknown): void {
  const fullPath = join(workspaceRoot, relativePath);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function languageOf(path: string): CodeIntelligenceLanguage {
  const extension = extname(path).toLowerCase();
  if (extension === ".ts" || extension === ".tsx" || extension === ".mts" || extension === ".cts") {
    return "typescript";
  }
  if (extension === ".js" || extension === ".jsx" || extension === ".mjs" || extension === ".cjs") {
    return "javascript";
  }
  return "unsupported";
}

function isSensitiveExtension(path: string): boolean {
  return SENSITIVE_EXTENSIONS.has(extname(path).toLowerCase());
}

function sameFingerprint(
  prior: { size: number; mtimeMs: number } | undefined,
  disk: DiskFile,
): boolean {
  return prior?.size === disk.size && prior.mtimeMs === disk.mtimeMs;
}

function omission(disk: DiskFile, reason: CodeInventoryOmission["reason"]): CodeInventoryOmission {
  return { path: disk.path, reason, size: disk.size, mtimeMs: disk.mtimeMs };
}

function toHit(symbol: CodeSymbol, nodeIds: readonly string[]): CodeSymbolHit {
  return CodeSymbolHitSchema.parse({
    ...symbol,
    nodeIds: [...nodeIds].slice(0, 64),
  });
}

function pushOmissions(
  omissions: CodeSymbolQueryOmission[],
  seen: Set<string>,
  path: string,
  confirmed: { file: CodeSymbolFile | null; omission: CodeSymbolQueryOmission | null },
): void {
  const reasons = [
    ...(confirmed.omission ? [confirmed.omission.reason] : []),
    ...(confirmed.file?.omissions ?? []),
  ];
  for (const reason of reasons) {
    const key = `${path}\0${reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    omissions.push({ path, reason });
  }
}

function normalizePrefix(prefix: string | undefined): string | undefined {
  if (!prefix) return undefined;
  const normalized = prefix.replaceAll("\\", "/").replace(/^\.\/+/u, "").replace(/\/+$/u, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return undefined;
  }
  return normalized;
}

function byPath<T extends { path: string }>(left: T, right: T): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}
