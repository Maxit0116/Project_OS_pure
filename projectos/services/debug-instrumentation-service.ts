import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import ts from "typescript";

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
  /** Specs that could not be placed without breaking the file, with why. */
  skipped: Array<{ id: string; reason: string }>;
}

export class DebugInstrumentationService {
  apply(input: ApplyInstrumentationInput): ApplyInstrumentationResult {
    const backupByFile = new Map<string, string>();
    const instrumentation: DebugInstrumentation[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const spec of input.specs) {
      const absolutePath = join(input.workspaceRoot, spec.filePath);
      // Each probe goes into the file as the earlier probes left it.
      const current = readFileSync(absolutePath, "utf8");
      const original = backupByFile.get(spec.filePath) ?? current;
      const snippet = buildInstrumentationSnippet(
        input.sessionId,
        spec.hypothesisId,
        spec.anchor,
        spec.kind,
        input.debugLogPort,
      );
      let updated: string;
      try {
        updated = insertInstrumentation(current, spec.anchor, snippet, spec.filePath);
      } catch (error) {
        // A probe that cannot be placed safely is dropped; it must never break the file under test.
        skipped.push({ id: spec.id, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      if (!backupByFile.has(spec.filePath)) backupByFile.set(spec.filePath, original);
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

    return { instrumentation, backupByFile, skipped };
  }

  cleanup(
    workspaceRoot: string,
    backupByFile: Map<string, string>,
    instrumentation: DebugInstrumentation[],
  ): DebugInstrumentation[] {
    // Remove the probes from the file as it is now. Restoring the pre-probe backup threw away
    // everything done since: live, "problem fixed - clean up" put the bug back by restoring the buggy
    // file that was backed up before the fix.
    for (const filePath of backupByFile.keys()) {
      const absolutePath = join(workspaceRoot, filePath);
      // A file removed since the probes went in has nothing left to clean.
      if (!existsSync(absolutePath)) continue;
      const current = readFileSync(absolutePath, "utf8");
      const stripped = stripInstrumentation(current);
      if (stripped !== current) writeFileSync(absolutePath, stripped, "utf8");
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

/** The file without any debug probe: each marked block, with the whitespace that indented it, is removed. */
export function stripInstrumentation(source: string): string {
  const start = INSTRUMENTATION_MARKER_START.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const end = INSTRUMENTATION_MARKER_END.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return source.replace(new RegExp(`[ \\t]*${start}[\\s\\S]*?${end}[ \\t]*(?:\\r?\\n|$)`, "gu"), "");
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

function scriptKindFor(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function syntaxErrorCount(source: string, path: string): number {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKindFor(path));
  return (file as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics?.length ?? 0;
}

/**
 * Where a probe may go: at the start of the statement that contains the anchor, never inside an
 * expression. Inserting at the anchor itself put `console.log(...)` inside a Prisma `where:` object
 * live, de-indented the anchor line and left a file that no longer compiled.
 */
export function instrumentationInsertionOffset(source: string, anchor: string, path: string): number | undefined {
  const index = source.indexOf(anchor);
  if (index < 0) return undefined;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKindFor(path));
  let enclosing: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (index < node.getStart(file) || index >= node.end) return;
    const parent = node.parent;
    const atStatementPosition = parent !== undefined && (
      ts.isBlock(parent) || ts.isSourceFile(parent) || ts.isModuleBlock(parent) ||
      ts.isCaseClause(parent) || ts.isDefaultClause(parent)
    );
    if (ts.isStatement(node) && atStatementPosition) enclosing = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!enclosing) return undefined;
  const found: ts.Node = enclosing;
  // A directive such as 'use client' must stay first: the probe goes after it.
  const isDirective = ts.isExpressionStatement(found) && ts.isStringLiteral(found.expression) && ts.isSourceFile(found.parent);
  const position = isDirective ? found.end : found.getStart(file);
  return isDirective ? position : source.lastIndexOf("\n", position) + 1;
}

function insertInstrumentation(
  source: string,
  anchor: string,
  snippet: string,
  path: string,
): string {
  if (source.indexOf(anchor) < 0) {
    throw new ProjectOSError(
      "debug_instrumentation_failed",
      `Could not find instrumentation anchor '${anchor}'`,
    );
  }
  const offset = instrumentationInsertionOffset(source, anchor, path);
  if (offset === undefined) {
    throw new ProjectOSError(
      "debug_instrumentation_failed",
      `The anchor '${anchor.slice(0, 60)}' is not inside a statement a probe can be placed before`,
    );
  }
  const lineEnd = source.indexOf("\n", offset);
  const lineText = source.slice(offset, lineEnd < 0 ? source.length : lineEnd);
  const indent = lineText.match(/^\s*/)?.[0] ?? "";
  const indentedSnippet = snippet
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
  const updated = `${source.slice(0, offset)}${indentedSnippet}\n${source.slice(offset)}`;
  // Never leave a file that parses worse than it did.
  if (syntaxErrorCount(updated, path) > syntaxErrorCount(source, path)) {
    throw new ProjectOSError(
      "debug_instrumentation_failed",
      `Inserting a probe at '${anchor.slice(0, 60)}' would break the file's syntax`,
    );
  }
  return updated;
}

export function ensureDirectory(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function readWorkspaceTextFile(workspaceRoot: string, filePath: string): string {
  return readFileSync(join(workspaceRoot, filePath), "utf8");
}
