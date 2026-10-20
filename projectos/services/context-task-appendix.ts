import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ContextAssemblyOmissionReason } from "../contracts/context-assembly.js";
import {
  codeImpact,
  readCodeFileUnderstandingState,
  symbolsInFile,
} from "./code-intelligence/index.js";

const SYMBOL_INDEX = join(".projectos", "code-intelligence", "symbols.json");
const MAX_SYMBOLS = 4;
const MAX_PATHS = 12;
const MAX_CHARS = 2_000;

export interface TaskAppendix {
  markdown: string;
  /** Informational paths. They are not a write grant. */
  paths: string[];
  omissions: Array<{ reason: ContextAssemblyOmissionReason; count: number }>;
}

/**
 * Read-only list of direct referrers and same-name tests for one selected file.
 * Empty when the symbol index is absent or the file has neither.
 */
export function buildTaskAppendix(input: {
  workspaceRoot: string;
  projectId: string;
  path: string;
}): TaskAppendix {
  if (!existsSync(join(input.workspaceRoot, SYMBOL_INDEX))) {
    return { markdown: "", paths: [], omissions: [] };
  }
  const indexed = symbolsInFile({
    workspaceRoot: input.workspaceRoot,
    projectId: input.projectId,
    path: input.path,
  });
  const exported = indexed.symbols.slice(0, MAX_SYMBOLS);
  const referrers: string[] = [];
  const tests: string[] = [];
  let contentHash: string | null = null;
  const names = exported.length > 0 ? exported.map((symbol) => symbol.name) : [undefined];
  for (const symbolName of names) {
    const impact = codeImpact({
      workspaceRoot: input.workspaceRoot,
      projectId: input.projectId,
      path: input.path,
      ...(symbolName ? { symbolName } : {}),
    });
    contentHash = impact.contentHash;
    if (impact.symbols) {
      for (const file of [
        ...impact.symbols.references.onGraph,
        ...impact.symbols.references.unlinked,
      ]) {
        pushPath(referrers, file.path);
      }
    }
    for (const test of impact.tests) pushPath(tests, test.path);
  }
  const paths = [...referrers, ...tests].slice(0, MAX_PATHS);
  if (paths.length === 0) {
    return { markdown: "", paths: [], omissions: [] };
  }
  const omissions: TaskAppendix["omissions"] = [];
  let description = "";
  if (contentHash) {
    const understanding = readCodeFileUnderstandingState({
      workspaceRoot: input.workspaceRoot,
      projectId: input.projectId,
      path: input.path,
      currentContentHash: contentHash,
    });
    if (understanding.stale) {
      omissions.push({ reason: "stale_description", count: 1 });
    } else if (understanding.context) {
      description = `${understanding.context.role}: ${understanding.context.description}`;
    }
  }
  const lines = ["## Task appendix (read-only, not a write grant)"];
  if (referrers.length > 0) {
    lines.push("Direct referrers:", ...referrers.map((path) => `- ${path}`));
  }
  if (tests.length > 0) {
    lines.push("Same-name tests:", ...tests.map((path) => `- ${path}`));
  }
  if (description) lines.push(description);
  let markdown = lines.join("\n");
  if (markdown.length > MAX_CHARS) {
    markdown = markdown.slice(0, MAX_CHARS);
    omissions.push({ reason: "explicit_budget", count: 1 });
  }
  return { markdown, paths, omissions };
}

/** Appendix paths never expand the write set. */
export function writePathsIgnoringAppendix(
  writePaths: readonly string[],
  _appendix: TaskAppendix,
): string[] {
  return [...writePaths];
}

function pushPath(paths: string[], path: string): void {
  if (paths.length >= MAX_PATHS || paths.includes(path)) return;
  paths.push(path);
}
