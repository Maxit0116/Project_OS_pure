import { readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import { structuredPatch } from "diff";

import type { GeneratedDiff } from "../../contracts/diff.js";
import { lookupSymbols } from "../code-intelligence/index.js";

/**
 * The definitions, in this project, of the functions a proposed change calls, and of the types their
 * signatures name. Validators judged a change from the change and the edited file alone, so a call
 * that does not match its definition passed: on gitea the model wrote `db.Count[Star](ctx,
 * builder.Eq{...})`, but `db.Count` takes a `FindOptions` (an interface with GetPage, ToConds, …), and
 * both validators accepted code that does not compile. With the definitions in front of it, a
 * validator can check each call's arguments.
 */

export interface DefinitionExcerpt {
  name: string;
  path: string;
  line: number;
  text: string;
}

const MAX_CALLEES = 10;
const MAX_TYPES = 6;
const MAX_SIGNATURE_LINES = 8;
const MAX_TYPE_LINES = 16;
const MAX_TOTAL_CHARS = 6_000;

const NOT_A_CALL = new Set([
  "if", "for", "while", "switch", "catch", "return", "func", "function", "def", "fn", "new", "typeof",
  "sizeof", "await", "yield", "super", "this", "self", "len", "append", "make", "cap", "print", "println",
  "printf", "Printf", "Sprintf", "Errorf", "map", "filter", "reduce", "push", "pop", "get", "set", "has",
  "toString", "String", "require", "import", "assert", "expect", "describe", "it", "test", "lambda",
]);

const BUILTIN_TYPES = new Set([
  "String", "Number", "Boolean", "Object", "Array", "Promise", "Map", "Set", "Record", "Partial", "Readonly",
  "Context", "Error", "Optional", "List", "Dict", "Any", "None", "Self", "Vec", "Option", "Result", "Box",
  "Integer", "Long", "Void", "T", "K", "V",
]);

interface Call {
  qualifier: string | undefined;
  name: string;
}

/** Calls in the lines a change adds: `name(`, `pkg.name(`, `pkg.Name[T](`. */
export function callsInAddedLines(added: string): Call[] {
  const calls = new Map<string, Call>();
  for (const match of added.matchAll(/(?:([A-Za-z_$][\w$]*)\s*\.\s*)?([A-Za-z_$][\w$]*)\s*(?:\[[^\]\n]{0,80}\])?\s*\(/gu)) {
    const name = match[2]!;
    if (NOT_A_CALL.has(name) || name.length < 3) continue;
    const qualifier = match[1];
    calls.set(`${qualifier ?? ""}.${name}`, { qualifier, name });
  }
  return [...calls.values()];
}

function addedText(diff: GeneratedDiff): { added: string; definedHere: Set<string>; editedPaths: string[] } {
  const parts: string[] = [];
  const definedHere = new Set<string>();
  for (const file of diff.files) {
    if (file.after === undefined) continue;
    const patch = structuredPatch(file.path, file.path, file.before ?? "", file.after, undefined, undefined, { context: 0 });
    for (const hunk of patch.hunks) {
      for (const line of hunk.lines) {
        if (!line.startsWith("+")) continue;
        const text = line.slice(1);
        parts.push(text);
        const declared = /(?:func\s+(?:\([^)]*\)\s*)?|def\s+|function\s+|fn\s+)([A-Za-z_$][\w$]*)/u.exec(text);
        if (declared) definedHere.add(declared[1]!);
      }
    }
  }
  return { added: parts.join("\n"), definedHere, editedPaths: diff.files.map((file) => file.path) };
}

function readLines(workspaceRoot: string, path: string): string[] | undefined {
  try {
    return readFileSync(join(workspaceRoot, ...path.split("/")), "utf8").split("\n");
  } catch {
    return undefined;
  }
}

/** The declaration's head: up to the line that opens its body. */
function signatureAt(lines: readonly string[], line: number): string {
  const taken: string[] = [];
  for (let index = line - 1; index < lines.length && taken.length < MAX_SIGNATURE_LINES; index += 1) {
    const text = lines[index]!;
    const brace = text.indexOf("{");
    taken.push(brace >= 0 ? text.slice(0, brace + 1) : text);
    if (brace >= 0 || /[:;]\s*$/u.test(text) || /=>\s*$/u.test(text)) break;
  }
  return taken.join("\n").trimEnd();
}

/** A type's whole definition when short (an interface, a struct), else its head. */
function definitionAt(lines: readonly string[], line: number): string {
  const taken: string[] = [];
  let depth = 0;
  let opened = false;
  for (let index = line - 1; index < lines.length && taken.length < MAX_TYPE_LINES; index += 1) {
    const text = lines[index]!;
    taken.push(text);
    for (const char of text) {
      if (char === "{") {
        depth += 1;
        opened = true;
      } else if (char === "}") {
        depth -= 1;
      }
    }
    if ((opened && depth <= 0) || (!opened && /[;)]\s*$/u.test(text) && index > line - 1)) break;
  }
  return taken.join("\n").trimEnd();
}

function matchesQualifier(path: string, qualifier: string): boolean {
  const lower = qualifier.toLowerCase();
  const folder = basename(dirname(path)).toLowerCase();
  const stem = basename(path, extname(path)).toLowerCase();
  return folder === lower || stem === lower;
}

export function calleeDefinitions(input: {
  workspaceRoot: string;
  projectId: string;
  diff: GeneratedDiff;
}): { callees: DefinitionExcerpt[]; types: DefinitionExcerpt[] } {
  const { added, definedHere, editedPaths } = addedText(input.diff);
  if (!added) return { callees: [], types: [] };
  const editedFolders = new Set(editedPaths.map((path) => dirname(path)));
  const callees: DefinitionExcerpt[] = [];
  let budget = MAX_TOTAL_CHARS;
  const lookup = (name: string) => lookupSymbols({ workspaceRoot: input.workspaceRoot, projectId: input.projectId, name }).symbols;

  for (const call of callsInAddedLines(added)) {
    if (callees.length >= MAX_CALLEES || budget <= 0) break;
    if (definedHere.has(call.name)) continue;
    const hits = lookup(call.name);
    // A qualified call must resolve to the package or module it names (an external package is not
    // in the index and is skipped); an unqualified one to the edited file's folder, or to a name
    // defined only once in the project.
    const chosen = call.qualifier
      ? hits.find((hit) => matchesQualifier(hit.path, call.qualifier!))
      : hits.find((hit) => editedFolders.has(dirname(hit.path))) ?? (hits.length === 1 ? hits[0] : undefined);
    if (!chosen) continue;
    const lines = readLines(input.workspaceRoot, chosen.path);
    if (!lines) continue;
    const text = signatureAt(lines, chosen.startLine);
    budget -= text.length;
    callees.push({ name: call.qualifier ? `${call.qualifier}.${call.name}` : call.name, path: chosen.path, line: chosen.startLine, text });
  }

  // The types those signatures take, defined next to them (gitea: FindOptions beside db.Count).
  const types: DefinitionExcerpt[] = [];
  const seen = new Set<string>();
  for (const callee of callees) {
    const parameters = callee.text.slice(callee.text.indexOf("("));
    for (const typeName of parameters.match(/\b[A-Z][A-Za-z0-9_]*\b/gu) ?? []) {
      if (types.length >= MAX_TYPES || budget <= 0) break;
      if (BUILTIN_TYPES.has(typeName) || seen.has(typeName)) continue;
      seen.add(typeName);
      const hit = lookup(typeName).find((candidate) => dirname(candidate.path) === dirname(callee.path));
      if (!hit || (hit.kind !== "interface" && hit.kind !== "class" && hit.kind !== "type")) continue;
      const lines = readLines(input.workspaceRoot, hit.path);
      if (!lines) continue;
      const text = definitionAt(lines, hit.startLine);
      budget -= text.length;
      types.push({ name: typeName, path: hit.path, line: hit.startLine, text });
    }
  }
  return { callees, types };
}
