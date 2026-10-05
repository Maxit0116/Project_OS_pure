import { readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  DebugInstrumentation,
  DebugSession,
} from "../contracts/debug-session.js";
import { ProjectOSError } from "../errors.js";

const INSTRUMENTATION_MARKER_START = "// __projectos_debug_start__";
const INSTRUMENTATION_MARKER_END = "// __projectos_debug_end__";

export interface InstrumentationSpec {
  id: string;
  filePath: string;
  hypothesisId: string;
  anchor: string;
  kind: "fetch_log" | "console_log";
}

export interface ApplyInstrumentationInput {
  workspaceRoot: string;
  sessionId: string;
  debugLogPort: number;
  specs: InstrumentationSpec[];
}

export interface ApplyInstrumentationResult {
  instrumentation: DebugInstrumentation[];
  backupByFile: Map<string, string>;
}

export class DebugInstrumentationService {
  apply(input: ApplyInstrumentationInput): ApplyInstrumentationResult {
    const backupByFile = new Map<string, string>();
    const instrumentation: DebugInstrumentation[] = [];

    for (const spec of input.specs) {
      const absolutePath = join(input.workspaceRoot, spec.filePath);
      const original = readFileSync(absolutePath, "utf8");
      if (!backupByFile.has(spec.filePath)) {
        backupByFile.set(spec.filePath, original);
      }
      const snippet = buildInstrumentationSnippet(
        input.sessionId,
        spec.hypothesisId,
        spec.anchor,
        spec.kind,
        input.debugLogPort,
      );
      const updated = insertInstrumentation(original, spec.anchor, snippet);
      writeFileSync(absolutePath, updated, "utf8");
      instrumentation.push({
        id: spec.id,
        filePath: spec.filePath,
        lineRange: spec.anchor,
        kind: spec.kind,
        status: "applied",
        hypothesisId: spec.hypothesisId,
      });
    }

    return { instrumentation, backupByFile };
  }

  cleanup(
    workspaceRoot: string,
    backupByFile: Map<string, string>,
    instrumentation: DebugInstrumentation[],
  ): DebugInstrumentation[] {
    for (const [filePath, original] of backupByFile.entries()) {
      writeFileSync(join(workspaceRoot, filePath), original, "utf8");
    }
    return instrumentation.map((item) => ({ ...item, status: "removed" }));
  }

  restoreFromSession(
    workspaceRoot: string,
    session: DebugSession,
    backupByFile: Map<string, string>,
  ): DebugSession {
    const instrumentation = this.cleanup(workspaceRoot, backupByFile, session.instrumentation);
    return {
      ...session,
      instrumentation,
      updatedAt: new Date().toISOString(),
    };
  }
}

export function buildInstrumentationSnippet(
  sessionId: string,
  hypothesisId: string,
  anchor: string,
  kind: "fetch_log" | "console_log",
  debugLogPort: number,
): string {
  const location = anchor.replace(/'/g, "\\'");
  if (kind === "console_log") {
    return [
      INSTRUMENTATION_MARKER_START,
      `console.log('[projectos-debug]', '${location}', { sessionId: '${sessionId}', hypothesisId: '${hypothesisId}' });`,
      `void fetch('http://127.0.0.1:${debugLogPort}/debug-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: '${sessionId}', hypothesisId: '${hypothesisId}', location: '${location}', data: { kind: 'console_log' } }) }).catch(() => undefined);`,
      INSTRUMENTATION_MARKER_END,
    ].join("\n");
  }
  return [
    INSTRUMENTATION_MARKER_START,
    `void fetch('http://127.0.0.1:${debugLogPort}/debug-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: '${sessionId}', hypothesisId: '${hypothesisId}', location: '${location}', data: { kind: 'fetch_log' } }) }).catch(() => undefined);`,
    INSTRUMENTATION_MARKER_END,
  ].join("\n");
}

function insertInstrumentation(
  source: string,
  anchor: string,
  snippet: string,
): string {
  const index = source.indexOf(anchor);
  if (index < 0) {
    throw new ProjectOSError(
      "debug_instrumentation_failed",
      `Could not find instrumentation anchor '${anchor}'`,
    );
  }
  const lineStart = source.lastIndexOf("\n", index) + 1;
  const indent = source.slice(lineStart, index).match(/^\s*/)?.[0] ?? "";
  const indentedSnippet = snippet
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
  return `${source.slice(0, index)}${indentedSnippet}\n${source.slice(index)}`;
}

export function ensureDirectory(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function readWorkspaceTextFile(workspaceRoot: string, filePath: string): string {
  return readFileSync(join(workspaceRoot, filePath), "utf8");
}
