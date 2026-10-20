import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CODE_UNDERSTANDING_REFRESH_LIMIT,
  type CodeInventoryDocument,
  type CodeSymbolIndexDocument,
} from "../../contracts/code-intelligence.js";
import type { CodeFileUnderstandingEntry } from "../../contracts/code-file-understanding.js";
import type { ModelProfile } from "../../contracts/settings.js";
import {
  findCodeFileUnderstandingEntry,
  readCodeFileUnderstandingDocument,
  upsertCodeFileUnderstandingEntry,
  writeCodeFileUnderstandingDocument,
} from "../code-file-understanding-store.js";
import {
  hashFileContent,
  type CodeFileUnderstandingModelInput,
} from "../code-file-understanding-service.js";
import { containsHighConfidenceSecret } from "../high-confidence-secret-patterns.js";
import {
  DependencyImpactError,
  DependencyImpactScanner,
} from "../dependency-impact-scanner.js";
import type { ResolvedResponseLanguage } from "../agent-language-policy.js";

/** Matches the neighbor cap inside CodeFileUnderstandingService. */
const NEIGHBOR_LIMIT = 8;

export interface UnderstandingGenerator {
  generateWithModel(input: CodeFileUnderstandingModelInput): Promise<CodeFileUnderstandingEntry>;
}

export interface CodeUnderstandingRefreshResult {
  refreshed: string[];
  keptStale: string[];
  deferred: string[];
}

/**
 * Regenerates hash-expired descriptions, a bounded batch at a time.
 * A failed model response leaves the previous entry in place and still stale.
 * Descriptions are not write authorization and are not a symbol table.
 */
export async function refreshUnderstandings(input: {
  workspaceRoot: string;
  projectId: string;
  inventory: CodeInventoryDocument;
  symbols: CodeSymbolIndexDocument;
  generator: UnderstandingGenerator;
  profile: ModelProfile;
  responseLanguage: ResolvedResponseLanguage;
  fileLimit?: number;
}): Promise<CodeUnderstandingRefreshResult> {
  const limit = input.fileLimit ?? CODE_UNDERSTANDING_REFRESH_LIMIT;
  const document = readCodeFileUnderstandingDocument(input.workspaceRoot, input.projectId);
  const stale = document.entries
    .filter((entry) => {
      const current = input.inventory.files.find((file) => file.path === entry.path);
      return !current || current.contentHash !== entry.contentHash;
    })
    .map((entry) => entry.path)
    .sort();
  const selected = stale.slice(0, Math.max(0, limit));
  const deferred = stale.slice(selected.length);
  const refreshed: string[] = [];
  const keptStale: string[] = [];

  let stored = document;
  for (const path of selected) {
    const previous = findCodeFileUnderstandingEntry(stored, path);
    if (!previous) {
      keptStale.push(path);
      continue;
    }
    const inventoried = input.inventory.files.find((file) => file.path === path);
    const text = inventoried ? readText(input.workspaceRoot, path) : null;
    if (!inventoried || text === null || containsHighConfidenceSecret(text)) {
      keptStale.push(path);
      continue;
    }
    const contentHash = hashFileContent(text);
    if (contentHash === previous.contentHash) continue;
    const neighbors = directNeighbors(input.workspaceRoot, path);
    try {
      const generated = await input.generator.generateWithModel({
        projectId: input.projectId,
        path,
        sourceExcerpt: text,
        contentHash,
        fileType: null,
        stereotype: null,
        exports: input.symbols.files
          .find((file) => file.path === path)
          ?.symbols.map((symbol) => symbol.name) ?? [],
        usedBy: neighbors.usedBy.slice(0, NEIGHBOR_LIMIT),
        dependsOn: neighbors.dependsOn.slice(0, NEIGHBOR_LIMIT),
        parentComponentName: null,
        parentComponentSummary: null,
        profile: input.profile,
        responseLanguage: input.responseLanguage,
      });
      const latest = readText(input.workspaceRoot, path);
      if (
        !latest ||
        hashFileContent(latest) !== contentHash ||
        generated.path !== path ||
        generated.contentHash !== contentHash
      ) {
        keptStale.push(path);
        continue;
      }
      stored = upsertCodeFileUnderstandingEntry(stored, generated);
      writeCodeFileUnderstandingDocument(input.workspaceRoot, stored);
      refreshed.push(path);
    } catch {
      keptStale.push(path);
    }
  }

  return { refreshed, keptStale, deferred };
}

function directNeighbors(workspaceRoot: string, path: string): { usedBy: string[]; dependsOn: string[] } {
  try {
    const relations = new DependencyImpactScanner().relations({
      workspaceRoot,
      targetPath: path,
    });
    return {
      usedBy: relations.closure.filter((file) => file.distance === 1).map((file) => file.path),
      dependsOn: relations.dependsOn,
    };
  } catch (error) {
    if (error instanceof DependencyImpactError) return { usedBy: [], dependsOn: [] };
    throw error;
  }
}

function readText(workspaceRoot: string, path: string): string | null {
  try {
    return readFileSync(join(workspaceRoot, ...path.split("/")), "utf8");
  } catch {
    return null;
  }
}
