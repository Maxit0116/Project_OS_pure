import { readFileSync } from "node:fs";
import { basename, extname, join, posix } from "node:path";

import type {
  CodeImpactFile,
  CodeImpactGroup,
  CodeImpactResult,
  CodeIntelligenceLanguage,
  CodeInventoryDocument,
  CodeSymbolIndexDocument,
  CodeTestCandidate,
} from "../../contracts/code-intelligence.js";
import { CodeImpactResultSchema } from "../../contracts/code-intelligence.js";
import { parseGoImports, parseImportSpecs, resolveCSharpReferences, resolveImportPath } from "../structure-graph-l2.js";

/**
 * Impact for the languages the TypeScript import scanner does not read (Python, Go, Rust, the JVM
 * languages, C#, Ruby, PHP, Swift). The files that import the target come from the same import
 * parsers and resolvers the map scan uses; a symbol is referenced by an importer that names it. It is
 * a text reading of imports, not a compiler's, and says so by what it cannot resolve: a dynamic import
 * or a name used through a wildcard is not found.
 */

const MAX_SCANNED_FILES = 4_000;
const MAX_READ_CHARS = 60_000;
const MAX_CLOSURE = 2_000;

/** Languages that import each other. */
const FAMILY: Partial<Record<CodeIntelligenceLanguage, string>> = {
  python: "python",
  go: "go",
  rust: "rust",
  java: "jvm",
  kotlin: "jvm",
  scala: "jvm",
  csharp: "dotnet",
  ruby: "ruby",
  php: "php",
  swift: "swift",
};

export function isImportImpactLanguage(language: CodeIntelligenceLanguage): boolean {
  return FAMILY[language] !== undefined;
}

export function buildImportImpact(input: {
  workspaceRoot: string;
  path: string;
  language: CodeIntelligenceLanguage;
  contentHash: string;
  inventory: CodeInventoryDocument;
  symbols: CodeSymbolIndexDocument;
  symbolName?: string | undefined;
  nodeIdsByPath?: ReadonlyMap<string, readonly string[]> | undefined;
}): CodeImpactResult {
  const family = FAMILY[input.language];
  const languageOf = new Map(input.inventory.files.map((file) => [file.path, file.language]));
  const allPaths = new Set(input.inventory.files.map((file) => file.path));
  const candidates = input.inventory.files
    .filter((file) => FAMILY[file.language] === family)
    .map((file) => file.path)
    .slice(0, MAX_SCANNED_FILES);

  const sources = new Map<string, string>();
  const importersOf = new Map<string, Set<string>>();
  const record = (importer: string, target: string) => {
    if (importer === target) return;
    const set = importersOf.get(target) ?? new Set<string>();
    set.add(importer);
    importersOf.set(target, set);
  };
  for (const path of candidates) {
    let source: string;
    try {
      source = readFileSync(join(input.workspaceRoot, ...path.split("/")), "utf8").slice(0, MAX_READ_CHARS);
    } catch {
      continue;
    }
    sources.set(path, source);
    if (family === "go") {
      // A Go import names a package (a folder), not a file: every file of that folder is imported.
      for (const spec of parseGoImports(source)) {
        const folder = goPackageFolder(spec, allPaths);
        if (!folder) continue;
        for (const target of candidates) {
          if (posix.dirname(target) === folder) record(path, target);
        }
      }
      continue;
    }
    for (const spec of parseImportSpecs(source)) {
      const target = resolveImportPath(path, spec, allPaths);
      if (target && languageOf.get(target) !== undefined) record(path, target);
    }
  }

  if (family === "dotnet") {
    // C# names namespaces, not files: references come from the types a file uses.
    for (const [importer, targets] of resolveCSharpReferences(sources)) {
      for (const target of targets) record(importer, target);
    }
  }

  // Everything that imports the target, directly or through other files, nearest first.
  const distance = new Map<string, number>();
  let frontier = [input.path];
  for (let step = 1; frontier.length > 0 && distance.size < MAX_CLOSURE; step += 1) {
    const next: string[] = [];
    for (const target of frontier) {
      for (const importer of importersOf.get(target) ?? []) {
        if (importer === input.path || distance.has(importer)) continue;
        distance.set(importer, step);
        next.push(importer);
      }
    }
    frontier = next;
  }
  const closure = [...distance.entries()].map(([path, steps]) => ({ path, distance: steps }));

  let symbols: CodeImpactResult["symbols"] = null;
  if (input.symbolName) {
    const defined = input.symbols.files
      .find((file) => file.path === input.path)
      ?.symbols.some((symbol) => symbol.name === input.symbolName);
    const references: Array<{ path: string; distance: number }> = [];
    if (defined) {
      const word = new RegExp(`(?<![\\w$])${input.symbolName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![\\w$])`, "u");
      for (const importer of importersOf.get(input.path) ?? []) {
        if (word.test(sources.get(importer) ?? "")) references.push({ path: importer, distance: 1 });
      }
    }
    symbols = { name: input.symbolName, references: groupFiles(references, input.nodeIdsByPath) };
  }

  return CodeImpactResultSchema.parse({
    targetPath: input.path,
    contentHash: input.contentHash,
    files: groupFiles(closure, input.nodeIdsByPath),
    symbols,
    tests: relatedTests(input.path, [...allPaths], closure.map((file) => file.path), input.nodeIdsByPath),
    omissions: [],
  });
}

/** The folder of the project a Go import path names: `github.com/acme/shop/internal/store` → `internal/store`. */
function goPackageFolder(spec: string, paths: ReadonlySet<string>): string | null {
  const parts = spec.split("/").filter(Boolean);
  const folders = new Set([...paths].filter((path) => path.endsWith(".go")).map((path) => posix.dirname(path)));
  for (let start = 0; start < parts.length; start += 1) {
    const suffix = parts.slice(start).join("/");
    if (folders.has(suffix)) return suffix;
  }
  return null;
}

/**
 * Tests by each language's naming rule (`test_orders.py`, `orders_test.go`, `OrderServiceTest.java`,
 * `orders_spec.rb`, `orders.test.ts`), and test files among the importers.
 */
function relatedTests(
  targetPath: string,
  allPaths: readonly string[],
  importers: readonly string[],
  nodeIdsByPath: ReadonlyMap<string, readonly string[]> | undefined,
): CodeTestCandidate[] {
  const stem = basename(targetPath, extname(targetPath));
  const lower = stem.toLowerCase();
  const names = new Set([
    `test_${lower}`, `${lower}_test`, `${lower}_tests`, `${lower}test`, `${lower}tests`, `${lower}_spec`, `${lower}.test`, `${lower}.spec`,
  ]);
  const isTestPath = (path: string) =>
    /(^|\/)(tests?|__tests__|spec|specs|src\/test)\//iu.test(path) || /(^|\/)test_[^/]+$|_test\.[a-z]+$|tests?\.[a-z]+$|_spec\.rb$/iu.test(path);
  const tests: CodeTestCandidate[] = [];
  const seen = new Set<string>();
  const push = (path: string) => {
    if (seen.has(path) || path === targetPath) return;
    seen.add(path);
    tests.push({ path, nodeIds: [...(nodeIdsByPath?.get(path) ?? [])].slice(0, 64) });
  };
  for (const path of [...allPaths].sort()) {
    if (names.has(basename(path, extname(path)).toLowerCase())) push(path);
  }
  for (const path of [...importers].sort()) {
    if (isTestPath(path)) push(path);
  }
  return tests;
}

function groupFiles(
  files: readonly { path: string; distance: number }[],
  nodeIdsByPath: ReadonlyMap<string, readonly string[]> | undefined,
): CodeImpactGroup {
  const onGraph: CodeImpactFile[] = [];
  const unlinked: CodeImpactFile[] = [];
  for (const file of files) {
    const nodeIds = [...(nodeIdsByPath?.get(file.path) ?? [])].slice(0, 64);
    const entry = { path: file.path, distance: file.distance, nodeIds };
    if (nodeIds.length > 0) onGraph.push(entry);
    else unlinked.push(entry);
  }
  const byDistance = (left: CodeImpactFile, right: CodeImpactFile) =>
    left.distance - right.distance || (left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return { onGraph: onGraph.sort(byDistance), unlinked: unlinked.sort(byDistance) };
}
