import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import {
  dirname,
  extname,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";

import { resolveContainedPath } from "../utils/path-containment.js";

const SOURCE_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts",
]);
const MODULE_EXTENSIONS = [...SOURCE_EXTENSIONS, ".json"];
const EXCLUDED_DIRECTORIES = new Set([
  ".git", ".projectos", "node_modules", ".next", "dist", "build", "coverage",
]);

export type DependencyImpactErrorCode =
  | "impact_scan_unavailable"
  | "invalid_target"
  | "unresolved_local_specifier";

export class DependencyImpactError extends Error {
  constructor(
    readonly code: DependencyImpactErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DependencyImpactError";
  }
}

export interface DependencyImpactScanInput {
  workspaceRoot: string;
  targetPath: string;
  /** Materialized proposal bytes used only by the post-repair impact gate. */
  contentOverrides?: Readonly<Record<string, string | null>>;
}

export interface DependencyImpactScanResult {
  scanner: "typescript_javascript_static_imports_v1";
  targetPath: string;
  directImporters: string[];
  reverseTransitiveClosure: string[];
  scannedFiles: string[];
}

export interface ImportClosureFile {
  path: string;
  distance: number;
}

export interface IncomingImport {
  importerPath: string;
  specifier: string;
}

/** Direct and transitive importers from the same graph `scan` uses. */
export interface ImportRelations {
  targetPath: string;
  closure: ImportClosureFile[];
  /** Files this target imports through a resolved local specifier. */
  dependsOn: string[];
  /** Direct importers and the specifier that resolved to the target. */
  incoming: IncomingImport[];
}

interface PathMapping {
  pattern: string;
  targets: string[];
  baseDirectory: string;
  required: boolean;
}

interface LoadedImportGraph {
  targetPath: string;
  sourceFiles: string[];
  reverse: Map<string, Set<string>>;
  forward: Map<string, Set<string>>;
  incoming: Map<string, IncomingImport[]>;
}

export class DependencyImpactScanner {
  scan(input: DependencyImpactScanInput): DependencyImpactScanResult {
    const graph = loadImportGraph(input);
    const closure = closureWithDistance(graph.reverse, graph.targetPath);
    return {
      scanner: "typescript_javascript_static_imports_v1",
      targetPath: graph.targetPath,
      directImporters: [...(graph.reverse.get(graph.targetPath) ?? [])].sort(compareText),
      reverseTransitiveClosure: closure.map((file) => file.path).sort(compareText),
      scannedFiles: graph.sourceFiles,
    };
  }

  /** Same import graph as `scan`, with distance and the direct edges into the target. */
  relations(input: DependencyImpactScanInput): ImportRelations {
    const graph = loadImportGraph(input);
    const incoming = [...(graph.incoming.get(graph.targetPath) ?? [])].sort((left, right) =>
      compareText(left.importerPath, right.importerPath) || compareText(left.specifier, right.specifier));
    return {
      targetPath: graph.targetPath,
      closure: closureWithDistance(graph.reverse, graph.targetPath),
      dependsOn: [...(graph.forward.get(graph.targetPath) ?? [])].sort(compareText),
      incoming,
    };
  }
}

function loadImportGraph(input: DependencyImpactScanInput): LoadedImportGraph {
  const root = realpathSync(input.workspaceRoot);
  const targetPath = normalizeRelativePath(input.targetPath);
  let targetAbsolute: string;
  try {
    targetAbsolute = resolveContainedPath(root, targetPath);
  } catch {
    throw new DependencyImpactError("invalid_target", "Deletion target is not a contained existing file");
  }
  assertNoSymlinkComponents(root, targetPath);
  const targetStats = lstatSync(targetAbsolute);
  if (!targetStats.isFile() || targetStats.isSymbolicLink()) {
    throw new DependencyImpactError("invalid_target", "Deletion target must be a regular non-symlink file");
  }
  if (!SOURCE_EXTENSIONS.has(extname(targetPath).toLowerCase())) {
    throw unavailable("No applicable dependency scanner exists for the target language");
  }

  const allFiles = collectWorkspaceFiles(root);
  if (!allFiles.has(targetPath)) {
    throw new DependencyImpactError("invalid_target", "Deletion target is excluded from dependency scanning");
  }
  const overrides = normalizeOverrides(input.contentOverrides, allFiles);
  const mappings = loadPathMappings(root);
  const sourceFiles = [...allFiles]
    .filter((path) => SOURCE_EXTENSIONS.has(extname(path).toLowerCase()))
    .sort(compareText);
  const reverse = new Map<string, Set<string>>();
  const forward = new Map<string, Set<string>>();
  const incoming = new Map<string, IncomingImport[]>();
  for (const importerPath of sourceFiles) {
    if (overrides.get(importerPath) === null) continue;
    const source = overrides.get(importerPath) ?? readUtf8(root, importerPath);
    let specifiers: string[];
    try {
      specifiers = extractModuleSpecifiers(source);
    } catch (error) {
      if (error instanceof DependencyImpactError) {
        throw new DependencyImpactError(
          error.code,
          `${error.message} in '${importerPath}'`,
        );
      }
      throw error;
    }
    for (const specifier of specifiers) {
      const dependency = resolveLocalModule(root, importerPath, specifier, allFiles, mappings);
      if (!dependency) continue;
      const importers = reverse.get(dependency) ?? new Set<string>();
      importers.add(importerPath);
      reverse.set(dependency, importers);
      const dependencies = forward.get(importerPath) ?? new Set<string>();
      dependencies.add(dependency);
      forward.set(importerPath, dependencies);
      const edges = incoming.get(dependency) ?? [];
      edges.push({ importerPath, specifier });
      incoming.set(dependency, edges);
    }
  }
  return { targetPath, sourceFiles, reverse, forward, incoming };
}

function closureWithDistance(
  reverse: Map<string, Set<string>>,
  targetPath: string,
): ImportClosureFile[] {
  const distances = new Map<string, number>();
  const queue = [...(reverse.get(targetPath) ?? [])]
    .sort(compareText)
    .map((path) => ({ path, distance: 1 }));
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.path === targetPath || distances.has(current.path)) continue;
    distances.set(current.path, current.distance);
    for (const importer of [...(reverse.get(current.path) ?? [])].sort(compareText)) {
      if (!distances.has(importer)) queue.push({ path: importer, distance: current.distance + 1 });
    }
  }
  return [...distances.entries()]
    .map(([path, distance]) => ({ path, distance }))
    .sort((left, right) => left.distance - right.distance || compareText(left.path, right.path));
}

function collectWorkspaceFiles(root: string): Set<string> {
  const result = new Set<string>();
  const visit = (directory: string, relativeDirectory: string): void => {
    const entries = readdirSync(directory).sort(compareText);
    for (const entry of entries) {
      if (EXCLUDED_DIRECTORIES.has(entry)) continue;
      const relativePath = relativeDirectory
        ? posix.join(relativeDirectory, entry)
        : entry;
      const absolutePath = join(directory, entry);
      const stats = lstatSync(absolutePath);
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) visit(absolutePath, relativePath);
      else if (stats.isFile()) result.add(relativePath);
    }
  };
  visit(root, "");
  return result;
}

function normalizeOverrides(
  overrides: Readonly<Record<string, string | null>> | undefined,
  allFiles: Set<string>,
): Map<string, string | null> {
  const result = new Map<string, string | null>();
  for (const [path, content] of Object.entries(overrides ?? {})) {
    const normalized = normalizeRelativePath(path);
    if (!allFiles.has(normalized) || !SOURCE_EXTENSIONS.has(extname(normalized).toLowerCase())) {
      throw new DependencyImpactError(
        "invalid_target",
        "Impact-scan overrides must identify existing supported source files",
      );
    }
    result.set(normalized, content);
  }
  return result;
}

function readUtf8(root: string, path: string): string {
  const absolute = resolveContainedPath(root, path);
  assertNoSymlinkComponents(root, path);
  const stats = lstatSync(absolute);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw unavailable("Dependency scan encountered a non-regular source file");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      readFileSync(absolute, { encoding: null }),
    );
  } catch {
    throw unavailable("Dependency scan encountered invalid UTF-8 source content");
  }
}

function loadPathMappings(root: string): PathMapping[] {
  const configPath = ["tsconfig.json", "jsconfig.json"]
    .map((name) => join(root, name))
    .find((path) => {
      try { return lstatSync(path).isFile(); } catch { return false; }
    });
  if (!configPath) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(readFileSync(configPath, "utf8")));
  } catch {
    throw unavailable("Project path aliases could not be read safely");
  }
  if (!parsed || typeof parsed !== "object") throw unavailable("Project path aliases are invalid");
  const config = parsed as Record<string, unknown>;
  if (typeof config.extends === "string") {
    throw unavailable("Extended TypeScript configurations are not supported by the dependency scanner");
  }
  const compilerOptions = config.compilerOptions;
  if (!compilerOptions || typeof compilerOptions !== "object") return [];
  const options = compilerOptions as Record<string, unknown>;
  const baseUrl = typeof options.baseUrl === "string" ? options.baseUrl : ".";
  const baseDirectory = resolve(dirname(configPath), baseUrl);
  if (baseDirectory !== root && !baseDirectory.startsWith(`${root}${sep}`)) {
    throw unavailable("TypeScript baseUrl escapes the workspace");
  }
  const baseUrlFallback: PathMapping[] = typeof options.baseUrl === "string"
    ? [{ pattern: "*", targets: ["*"], baseDirectory, required: false }]
    : [];
  if (options.paths === undefined) return baseUrlFallback;
  if (!options.paths || typeof options.paths !== "object" || Array.isArray(options.paths)) {
    throw unavailable("TypeScript path aliases are invalid");
  }
  return [...Object.entries(options.paths as Record<string, unknown>)
    .sort(([left], [right]) => compareText(left, right))
    .map(([pattern, value]) => {
      if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string")) {
        throw unavailable("TypeScript path aliases are invalid");
      }
      if ((pattern.match(/\*/gu) ?? []).length > 1 ||
          (value as string[]).some((entry) => (entry.match(/\*/gu) ?? []).length > 1)) {
        throw unavailable("Complex TypeScript path aliases are not supported");
      }
      return { pattern, targets: value as string[], baseDirectory, required: true };
    }), ...baseUrlFallback];
}

function resolveLocalModule(
  workspaceRoot: string,
  importerPath: string,
  specifier: string,
  allFiles: Set<string>,
  mappings: PathMapping[],
): string | undefined {
  const bases: string[] = [];
  let isLocal = false;
  let unresolvedMustFail = false;
  if (specifier.startsWith(".")) {
    isLocal = true;
    bases.push(posix.normalize(posix.join(posix.dirname(importerPath), specifier)));
  } else {
    for (const mapping of mappings) {
      const wildcard = matchMapping(mapping.pattern, specifier);
      if (wildcard === undefined) continue;
      isLocal = true;
      unresolvedMustFail ||= mapping.required;
      for (const target of mapping.targets) {
        const mapped = target.includes("*") ? target.replace("*", wildcard) : target;
        const absolute = resolve(mapping.baseDirectory, mapped);
        const workspaceRelative = normalizeSystemRelative(relative(workspaceRoot, absolute));
        if (workspaceRelative === ".." || workspaceRelative.startsWith("../")) {
          throw unavailable("A TypeScript path alias escapes the workspace");
        }
        bases.push(workspaceRelative);
      }
    }
  }
  if (!isLocal) return undefined;
  for (const base of bases) {
    for (const candidate of moduleCandidates(base)) {
      if (allFiles.has(candidate)) return candidate;
    }
  }
  if (!unresolvedMustFail && !specifier.startsWith(".")) return undefined;
  throw new DependencyImpactError(
    "unresolved_local_specifier",
    "Impact-aware deletion unavailable because a local module reference could not be resolved",
  );
}

function moduleCandidates(base: string): string[] {
  const normalized = normalizeSystemRelative(base);
  const result = [normalized];
  const extension = extname(normalized).toLowerCase();
  if (!extension) {
    result.push(...MODULE_EXTENSIONS.map((extension) => `${normalized}${extension}`));
    result.push(...MODULE_EXTENSIONS.map((extension) => posix.join(normalized, `index${extension}`)));
  } else if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    const stem = normalized.slice(0, -extension.length);
    result.push(...[".ts", ".tsx", ".mts", ".cts"].map((candidate) => `${stem}${candidate}`));
  }
  return result;
}

function matchMapping(pattern: string, specifier: string): string | undefined {
  const star = pattern.indexOf("*");
  if (star < 0) return pattern === specifier ? "" : undefined;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return specifier.startsWith(prefix) && specifier.endsWith(suffix)
    ? specifier.slice(prefix.length, specifier.length - suffix.length)
    : undefined;
}

type SlashContext = "regex_allowed" | "division_only" | "ambiguous";

const REGEX_PREFIX_KEYWORDS = new Set([
  "await", "break", "case", "continue", "debugger", "default", "delete",
  "do", "else", "extends", "in", "instanceof", "new", "of", "return",
  "throw", "typeof", "void", "yield",
]);
const CONTROL_HEADER_KEYWORDS = new Set([
  "catch", "for", "if", "switch", "while", "with",
]);

function extractModuleSpecifiers(source: string): string[] {
  const result: string[] = [];
  scanJavascriptForModuleSpecifiers(source, 0, result, false);
  return [...new Set(result)];
}

function scanJavascriptForModuleSpecifiers(
  source: string,
  start: number,
  result: string[],
  stopAtTemplateExpressionEnd: boolean,
): number {
  let index = start;
  let braceDepth = 0;
  let slashContext: SlashContext = "regex_allowed";
  let previousIdentifier: string | undefined;
  const parenthesisKinds: Array<"control" | "expression"> = [];

  while (index < source.length) {
    const char = source[index]!;
    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index + 2);
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index = skipJavascriptBlockComment(source, index + 2);
      continue;
    }
    if (stopAtTemplateExpressionEnd && char === "}" && braceDepth === 0) {
      return index + 1;
    }
    if (char === "'" || char === '"') {
      index = skipJavascriptString(source, index, char);
      slashContext = "division_only";
      previousIdentifier = undefined;
      continue;
    }
    if (char === "`") {
      index = scanTemplateLiteral(source, index, result);
      slashContext = "division_only";
      previousIdentifier = undefined;
      continue;
    }
    if (char === "<" && looksLikeJsxElementStart(source, index, slashContext)) {
      index = scanJsxElement(source, index, result);
      slashContext = "division_only";
      previousIdentifier = undefined;
      continue;
    }
    if (char === "/") {
      if (slashContext === "regex_allowed") {
        index = skipRegularExpressionLiteral(source, index);
        slashContext = "division_only";
      } else if (slashContext === "division_only") {
        index += source[index + 1] === "=" ? 2 : 1;
        slashContext = "regex_allowed";
      } else {
        throw unavailable("An ambiguous slash token prevents deterministic dependency analysis");
      }
      previousIdentifier = undefined;
      continue;
    }
    if (isIdentifierStart(char)) {
      const token = readIdentifier(source, index);
      if (token.value === "require") {
        const parsed = parseCallSpecifier(source, token.end);
        if (parsed) result.push(parsed);
        else if (source[skipTrivia(source, token.end)] === "(") {
          throw unavailable("A non-literal require call prevents deterministic dependency analysis");
        }
      } else if (token.value === "import") {
        const parsed = parseImportSpecifier(source, token.end);
        if (parsed) result.push(parsed);
        else if (source[skipTrivia(source, token.end)] === "(") {
          throw unavailable("A non-literal dynamic import prevents deterministic dependency analysis");
        }
      } else if (token.value === "export") {
        const parsed = parseExportSpecifier(source, token.end);
        if (parsed) result.push(parsed);
      }
      slashContext = REGEX_PREFIX_KEYWORDS.has(token.value)
        ? "regex_allowed"
        : "division_only";
      previousIdentifier = token.value;
      index = token.end;
      continue;
    }
    if (isNumberStart(source, index)) {
      index = skipNumberLiteral(source, index);
      slashContext = "division_only";
      previousIdentifier = undefined;
      continue;
    }

    const contextBeforeToken: SlashContext = slashContext;
    if (char === "(") {
      parenthesisKinds.push(
        previousIdentifier && CONTROL_HEADER_KEYWORDS.has(previousIdentifier)
          ? "control"
          : "expression",
      );
      slashContext = "regex_allowed";
    } else if (char === ")") {
      const kind = parenthesisKinds.pop();
      slashContext = kind === "control"
        ? "regex_allowed"
        : kind === "expression"
          ? "division_only"
          : "ambiguous";
    } else if (char === "{") {
      braceDepth += 1;
      slashContext = "regex_allowed";
    } else if (char === "}") {
      if (braceDepth > 0) braceDepth -= 1;
      slashContext = "ambiguous";
    } else if (char === "[") {
      slashContext = "regex_allowed";
    } else if (char === "]") {
      slashContext = "division_only";
    } else if (char === ".") {
      slashContext = "division_only";
    } else if (char === "<") {
      slashContext = "regex_allowed";
    } else if (char === ";" || char === "," || char === ":" || char === "?" ||
      char === "=" || char === "!" || char === "~" || char === "&" ||
      char === "|" || char === "^" || char === ">" || char === "*" ||
      char === "%" || char === "@" || char === "#") {
      slashContext = "regex_allowed";
    } else if (char === "+" || char === "-") {
      const doubled = source[index + 1] === char;
      if (doubled) index += 1;
      slashContext = doubled && contextBeforeToken === "division_only"
        ? "division_only"
        : "regex_allowed";
    } else {
      slashContext = "ambiguous";
    }
    previousIdentifier = undefined;
    index += 1;
  }

  if (stopAtTemplateExpressionEnd) {
    throw unavailable("An unterminated template expression prevents deterministic dependency analysis");
  }
  return index;
}

function parseImportSpecifier(source: string, start: number): string | undefined {
  let index = skipTrivia(source, start);
  if (source[index] === ".") return undefined;
  if (source[index] === "(") return parseCallSpecifier(source, index);
  if (source[index] === "'" || source[index] === '"') return parseQuotedValue(source, index)?.value;
  return parseFromSpecifier(source, index);
}

function parseExportSpecifier(source: string, start: number): string | undefined {
  let index = skipTrivia(source, start);
  if (isIdentifierStart(source[index] ?? "")) {
    const token = readIdentifier(source, index);
    if (token.value === "type") index = skipTrivia(source, token.end);
  }
  if (source[index] === "*") {
    index = skipTrivia(source, index + 1);
    if (isIdentifierStart(source[index] ?? "")) {
      const token = readIdentifier(source, index);
      if (token.value === "as") {
        index = skipTrivia(source, token.end);
        if (source[index] === "'" || source[index] === '"') {
          const alias = parseQuotedValue(source, index);
          if (!alias) return undefined;
          index = skipTrivia(source, alias.end);
        } else if (isIdentifierStart(source[index] ?? "")) {
          index = skipTrivia(source, readIdentifier(source, index).end);
        } else {
          return undefined;
        }
      }
    }
    return parseFromKeywordAndValue(source, index);
  }
  if (source[index] !== "{") return undefined;

  index += 1;
  while (index < source.length && source[index] !== "}") {
    if (source[index] === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index + 2);
    } else if (source[index] === "/" && source[index + 1] === "*") {
      index = skipJavascriptBlockComment(source, index + 2);
    } else if (source[index] === "'" || source[index] === '"') {
      index = skipJavascriptString(source, index, source[index]!);
    } else if (source[index] === ";") {
      return undefined;
    } else {
      index += 1;
    }
  }
  if (source[index] !== "}") {
    throw unavailable("An unterminated export clause prevents deterministic dependency analysis");
  }
  return parseFromKeywordAndValue(source, skipTrivia(source, index + 1));
}

function parseFromKeywordAndValue(source: string, start: number): string | undefined {
  if (!isIdentifierStart(source[start] ?? "")) return undefined;
  const token = readIdentifier(source, start);
  if (token.value !== "from") return undefined;
  const quoteIndex = skipTrivia(source, token.end);
  if (source[quoteIndex] !== "'" && source[quoteIndex] !== '"') return undefined;
  return parseQuotedValue(source, quoteIndex)?.value;
}

function parseCallSpecifier(source: string, start: number): string | undefined {
  let index = skipTrivia(source, start);
  if (source[index] !== "(") return undefined;
  index = skipTrivia(source, index + 1);
  if (source[index] !== "'" && source[index] !== '"') return undefined;
  return parseQuotedValue(source, index)?.value;
}

function parseFromSpecifier(source: string, start: number): string | undefined {
  for (let index = start, limit = Math.min(source.length, start + 8_000); index < limit;) {
    const char = source[index]!;
    if (char === ";") return undefined;
    if (char === "/" && source[index + 1] === "/") { index = skipLineComment(source, index + 2); continue; }
    if (char === "/" && source[index + 1] === "*") { index = skipBlockComment(source, index + 2); continue; }
    if (char === "'" || char === '"' || char === "`") { index = skipString(source, index, char); continue; }
    if (!isIdentifierStart(char)) { index += 1; continue; }
    const token = readIdentifier(source, index);
    if (token.value === "from") {
      const quoteIndex = skipTrivia(source, token.end);
      if (source[quoteIndex] === "'" || source[quoteIndex] === '"') {
        return parseQuotedValue(source, quoteIndex)?.value;
      }
      return undefined;
    }
    index = token.end;
  }
  return undefined;
}

function parseQuotedValue(source: string, start: number): { value: string; end: number } | undefined {
  const quote = source[start]!;
  let value = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]!;
    if (char === quote) return { value, end: index + 1 };
    if (char === "\\") {
      const escaped = source[index + 1];
      if (!escaped) return undefined;
      value += escaped;
      index += 1;
    } else if (char === "\n" || char === "\r") return undefined;
    else value += char;
  }
  return undefined;
}

function skipTrivia(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    if (/\s/u.test(source[index]!)) { index += 1; continue; }
    if (source[index] === "/" && source[index + 1] === "/") { index = skipLineComment(source, index + 2); continue; }
    if (source[index] === "/" && source[index + 1] === "*") { index = skipBlockComment(source, index + 2); continue; }
    break;
  }
  return index;
}

function skipLineComment(source: string, index: number): number {
  while (index < source.length && source[index] !== "\n") index += 1;
  return index;
}

function skipBlockComment(source: string, index: number): number {
  const end = source.indexOf("*/", index);
  return end < 0 ? source.length : end + 2;
}

function skipJavascriptBlockComment(source: string, index: number): number {
  const end = source.indexOf("*/", index);
  if (end < 0) {
    throw unavailable("An unterminated block comment prevents deterministic dependency analysis");
  }
  return end + 2;
}

function skipJavascriptString(source: string, start: number, quote: string): number {
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]!;
    if (char === quote) return index + 1;
    if (char === "\\") {
      if (index + 1 >= source.length) {
        throw unavailable("An unterminated string prevents deterministic dependency analysis");
      }
      index += 1;
    } else if (char === "\n" || char === "\r") {
      throw unavailable("An unterminated string prevents deterministic dependency analysis");
    }
  }
  throw unavailable("An unterminated string prevents deterministic dependency analysis");
}

function scanTemplateLiteral(source: string, start: number, result: string[]): number {
  for (let index = start + 1; index < source.length;) {
    const char = source[index]!;
    if (char === "\\") {
      if (index + 1 >= source.length) {
        throw unavailable("An unterminated template literal prevents deterministic dependency analysis");
      }
      index += 2;
    } else if (char === "`") {
      return index + 1;
    } else if (char === "$" && source[index + 1] === "{") {
      index = scanJavascriptForModuleSpecifiers(source, index + 2, result, true);
    } else {
      index += 1;
    }
  }
  throw unavailable("An unterminated template literal prevents deterministic dependency analysis");
}

function looksLikeJsxElementStart(
  source: string,
  index: number,
  slashContext: SlashContext,
): boolean {
  if (slashContext !== "regex_allowed") return false;
  const next = source[index + 1] ?? "";
  return next === ">" || isIdentifierStart(next);
}

function scanJsxElement(source: string, start: number, result: string[]): number {
  let index = start + 1;
  let tagName = "";
  if (source[index] === ">") {
    index += 1;
  } else {
    const tag = readJsxTagName(source, index);
    tagName = tag.value;
    index = tag.end;
    while (index < source.length) {
      const char = source[index]!;
      if (/\s/u.test(char)) {
        index += 1;
      } else if (char === "'" || char === '"') {
        index = skipJsxQuotedAttribute(source, index, char);
      } else if (char === "{") {
        index = scanJavascriptForModuleSpecifiers(source, index + 1, result, true);
      } else if (char === "/" && source[index + 1] === ">") {
        return index + 2;
      } else if (char === ">") {
        index += 1;
        break;
      } else if (char === "<") {
        throw unavailable("A malformed JSX opening tag prevents deterministic dependency analysis");
      } else {
        index += 1;
      }
    }
  }

  while (index < source.length) {
    if (source[index] === "{") {
      index = scanJavascriptForModuleSpecifiers(source, index + 1, result, true);
    } else if (source[index] === "<" && source[index + 1] === "/") {
      index += 2;
      let closingName = "";
      if (source[index] !== ">") {
        const closingTag = readJsxTagName(source, index);
        closingName = closingTag.value;
        index = closingTag.end;
      }
      while (index < source.length && /\s/u.test(source[index]!)) index += 1;
      if (source[index] !== ">" || closingName !== tagName) {
        throw unavailable("Mismatched JSX tags prevent deterministic dependency analysis");
      }
      return index + 1;
    } else if (source[index] === "<") {
      index = scanJsxElement(source, index, result);
    } else {
      index += 1;
    }
  }
  throw unavailable("An unterminated JSX element prevents deterministic dependency analysis");
}

function readJsxTagName(source: string, start: number): { value: string; end: number } {
  let end = start;
  while (end < source.length && /[A-Za-z0-9_$.:\-]/u.test(source[end]!)) end += 1;
  if (end === start) {
    throw unavailable("A malformed JSX tag prevents deterministic dependency analysis");
  }
  return { value: source.slice(start, end), end };
}

function skipJsxQuotedAttribute(source: string, start: number, quote: string): number {
  const end = source.indexOf(quote, start + 1);
  if (end < 0) {
    throw unavailable("An unterminated JSX attribute prevents deterministic dependency analysis");
  }
  return end + 1;
}

function skipRegularExpressionLiteral(source: string, start: number): number {
  let inCharacterClass = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]!;
    if (char === "\\") {
      if (index + 1 >= source.length) {
        throw unavailable("An unterminated regular expression prevents deterministic dependency analysis");
      }
      index += 1;
    } else if (char === "\n" || char === "\r") {
      throw unavailable("An unterminated regular expression prevents deterministic dependency analysis");
    } else if (char === "[") {
      inCharacterClass = true;
    } else if (char === "]" && inCharacterClass) {
      inCharacterClass = false;
    } else if (char === "/" && !inCharacterClass) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z]/u.test(source[end]!)) end += 1;
      return end;
    }
  }
  throw unavailable("An unterminated regular expression prevents deterministic dependency analysis");
}

function isNumberStart(source: string, index: number): boolean {
  return /[0-9]/u.test(source[index]!) ||
    (source[index] === "." && /[0-9]/u.test(source[index + 1] ?? ""));
}

function skipNumberLiteral(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length && /[A-Za-z0-9_.$]/u.test(source[index]!)) index += 1;
  return index;
}

function skipString(source: string, start: number, quote: string): number {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") index += 1;
    else if (source[index] === quote) return index + 1;
  }
  return source.length;
}

function readIdentifier(source: string, start: number): { value: string; end: number } {
  let end = start + 1;
  while (end < source.length && /[A-Za-z0-9_$]/u.test(source[end]!)) end += 1;
  return { value: source.slice(start, end), end };
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/u.test(char);
}

function stripJsonCommentsAndTrailingCommas(source: string): string {
  let output = "";
  for (let index = 0; index < source.length;) {
    if (source[index] === '"') {
      const end = skipString(source, index, '"');
      output += source.slice(index, end);
      index = end;
    } else if (source[index] === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index + 2);
    } else if (source[index] === "/" && source[index + 1] === "*") {
      index = skipBlockComment(source, index + 2);
    } else {
      output += source[index]!;
      index += 1;
    }
  }
  return output.replace(/,\s*([}\]])/gu, "$1");
}

function assertNoSymlinkComponents(root: string, path: string): void {
  let current = root;
  for (const component of path.split("/")) {
    current = join(current, component);
    if (lstatSync(current).isSymbolicLink()) {
      throw new DependencyImpactError("invalid_target", "Symlinked dependency paths are not supported");
    }
  }
}

function normalizeRelativePath(path: string): string {
  if (
    path.includes("\0") || path.includes("\\") || path.startsWith("/") ||
    /^[A-Za-z]:/u.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new DependencyImpactError("invalid_target", "Dependency path must be a safe workspace-relative path");
  }
  return path;
}

function normalizeSystemRelative(path: string): string {
  return path.split(sep).join("/");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unavailable(message: string): DependencyImpactError {
  return new DependencyImpactError("impact_scan_unavailable", `Impact-aware deletion unavailable: ${message}`);
}
