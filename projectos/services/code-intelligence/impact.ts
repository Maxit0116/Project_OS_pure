import { readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

import {
  CodeImpactResultSchema,
  type CodeImpactFile,
  type CodeImpactGroup,
  type CodeImpactResult,
  type CodeInventoryDocument,
  type CodeSymbolIndexDocument,
  type CodeTestCandidate,
} from "../../contracts/code-intelligence.js";
import {
  DependencyImpactError,
  DependencyImpactScanner,
  type ImportRelations,
} from "../dependency-impact-scanner.js";
import { moduleClauses } from "./import-names.js";

const TEST_FILE_PATTERN = /^(.+)\.(test|spec)\.[^.]+$/u;

/**
 * File impact comes from DependencyImpactScanner.
 * Symbol references are direct named imports of an export, not structure-graph edges.
 * This does not grant write paths.
 */
export function buildCodeImpact(input: {
  workspaceRoot: string;
  path: string;
  inventory: CodeInventoryDocument;
  symbols: CodeSymbolIndexDocument;
  symbolName?: string;
  nodeIdsByPath?: ReadonlyMap<string, readonly string[]>;
}): CodeImpactResult {
  const inventoried = input.inventory.files.find((file) => file.path === input.path);
  const nodeIds = input.nodeIdsByPath;
  if (!inventoried) {
    return emptyImpact(input.path, null, input.symbolName, [{ path: input.path, reason: "not_indexed" }]);
  }
  if (inventoried.language === "unsupported") {
    return emptyImpact(input.path, inventoried.contentHash, input.symbolName, [
      { path: input.path, reason: "unsupported_language" },
    ]);
  }

  let relations: ImportRelations;
  try {
    relations = new DependencyImpactScanner().relations({
      workspaceRoot: input.workspaceRoot,
      targetPath: input.path,
    });
  } catch (error) {
    if (error instanceof DependencyImpactError) {
      const reason = error.code === "unresolved_local_specifier"
        ? "unresolved_import"
        : error.code === "impact_scan_unavailable"
          ? "unsupported_language"
          : "scan_unavailable";
      return emptyImpact(input.path, inventoried.contentHash, input.symbolName, [
        { path: input.path, reason },
      ]);
    }
    throw error;
  }

  const files = groupFiles(relations.closure, nodeIds);
  const tests = relatedTests(input.path, [
    ...relations.closure.map((file) => file.path),
    ...input.inventory.files.map((file) => file.path),
  ], nodeIds);
  const omissions: CodeImpactResult["omissions"] = [];
  let symbols: CodeImpactResult["symbols"] = null;
  if (input.symbolName) {
    const defined = input.symbols.files
      .find((file) => file.path === input.path)
      ?.symbols.some((symbol) => symbol.name === input.symbolName);
    const references: Array<{ path: string; distance: number }> = [];
    if (defined) {
      const incomingByImporter = new Map<string, string[]>();
      for (const edge of relations.incoming) {
        const specifiers = incomingByImporter.get(edge.importerPath) ?? [];
        specifiers.push(edge.specifier);
        incomingByImporter.set(edge.importerPath, specifiers);
      }
      for (const [importerPath, specifiers] of incomingByImporter) {
        const source = readImporter(input.workspaceRoot, importerPath);
        if (source === null) {
          omissions.push({ path: importerPath, reason: "unresolved_import" });
          continue;
        }
        const parsed = moduleClauses(importerPath, source);
        if (parsed.parseFailed) {
          omissions.push({ path: importerPath, reason: "unresolved_import" });
          continue;
        }
        let referenced = false;
        let unresolved = false;
        for (const clause of parsed.clauses) {
          if (!specifiers.includes(clause.specifier)) continue;
          if (clause.unresolved) unresolved = true;
          if (clause.importedNames.includes(input.symbolName)) referenced = true;
        }
        if (referenced) references.push({ path: importerPath, distance: 1 });
        if (unresolved) omissions.push({ path: importerPath, reason: "unresolved_import" });
      }
    }
    symbols = {
      name: input.symbolName,
      references: groupFiles(references, nodeIds),
    };
  }

  return CodeImpactResultSchema.parse({
    targetPath: input.path,
    contentHash: inventoried.contentHash,
    files,
    symbols,
    tests,
    omissions,
  });
}

function emptyImpact(
  targetPath: string,
  contentHash: string | null,
  symbolName: string | undefined,
  omissions: CodeImpactResult["omissions"],
): CodeImpactResult {
  return CodeImpactResultSchema.parse({
    targetPath,
    contentHash,
    files: { onGraph: [], unlinked: [] },
    symbols: symbolName ? { name: symbolName, references: { onGraph: [], unlinked: [] } } : null,
    tests: [],
    omissions,
  });
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
  onGraph.sort(byDistance);
  unlinked.sort(byDistance);
  return { onGraph, unlinked };
}

function relatedTests(
  targetPath: string,
  candidates: readonly string[],
  nodeIdsByPath: ReadonlyMap<string, readonly string[]> | undefined,
): CodeTestCandidate[] {
  const stem = basename(targetPath, extname(targetPath));
  const seen = new Set<string>();
  const tests: CodeTestCandidate[] = [];
  for (const path of [...candidates].sort()) {
    const match = TEST_FILE_PATTERN.exec(basename(path));
    if (!match || match[1] !== stem || seen.has(path)) continue;
    seen.add(path);
    tests.push({
      path,
      nodeIds: [...(nodeIdsByPath?.get(path) ?? [])].slice(0, 64),
    });
  }
  return tests;
}

function readImporter(workspaceRoot: string, path: string): string | null {
  try {
    return readFileSync(join(workspaceRoot, ...path.split("/")), "utf8");
  } catch {
    return null;
  }
}
