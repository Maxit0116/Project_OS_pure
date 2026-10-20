import { createHash } from "node:crypto";

import ts from "typescript";

import type {
  CodeSymbol,
  CodeSymbolFileOmission,
  CodeSymbolKind,
} from "../../contracts/code-intelligence.js";

export interface ExtractedExports {
  symbols: CodeSymbol[];
  omissions: CodeSymbolFileOmission[];
}

const OMISSION_ORDER: readonly CodeSymbolFileOmission[] = [
  "parse_failed",
  "unresolved_export",
  "unclassified_export",
];

interface LocalDeclaration {
  kind: CodeSymbolKind;
  startLine: number;
}

/**
 * Exported functions, classes, types, interfaces, enums, and consts.
 * `export … from` is an omission, not a definition in this file.
 */
export function extractExportedSymbols(
  path: string,
  source: string,
  contentHash: string,
): ExtractedExports {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(path),
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }
  ).parseDiagnostics;
  if ((parseDiagnostics?.length ?? 0) > 0) {
    return { symbols: [], omissions: ["parse_failed"] };
  }

  const locals = new Map<string, LocalDeclaration>();
  const exported: Array<{ name: string; declaration: LocalDeclaration }> = [];
  const omissions = new Set<CodeSymbolFileOmission>();

  for (const statement of sourceFile.statements) {
    collectLocals(sourceFile, statement, locals);
  }
  for (const statement of sourceFile.statements) {
    collectExports(sourceFile, statement, locals, exported, omissions);
  }

  const symbols: CodeSymbol[] = [];
  const seen = new Set<string>();
  for (const item of exported) {
    const symbol = toSymbol(path, item.name, item.declaration, contentHash);
    if (seen.has(symbol.id)) continue;
    seen.add(symbol.id);
    symbols.push(symbol);
  }
  symbols.sort(compareSymbols);
  return {
    symbols,
    omissions: OMISSION_ORDER.filter((reason) => omissions.has(reason)),
  };
}

export function symbolId(
  path: string,
  kind: CodeSymbolKind,
  name: string,
  startLine: number,
): string {
  return createHash("sha256")
    .update(`${path}\0${kind}\0${name}\0${startLine}`)
    .digest("hex");
}

function collectLocals(
  sourceFile: ts.SourceFile,
  statement: ts.Statement,
  locals: Map<string, LocalDeclaration>,
): void {
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    remember(locals, statement.name.text, "function", lineOf(sourceFile, statement.name));
    return;
  }
  if (ts.isClassDeclaration(statement) && statement.name) {
    remember(locals, statement.name.text, "class", lineOf(sourceFile, statement.name));
    return;
  }
  if (ts.isInterfaceDeclaration(statement)) {
    remember(locals, statement.name.text, "interface", lineOf(sourceFile, statement.name));
    return;
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    remember(locals, statement.name.text, "type", lineOf(sourceFile, statement.name));
    return;
  }
  if (ts.isEnumDeclaration(statement)) {
    remember(locals, statement.name.text, "enum", lineOf(sourceFile, statement.name));
    return;
  }
  if (ts.isVariableStatement(statement) && isConst(statement.declarationList)) {
    for (const declaration of statement.declarationList.declarations) {
      for (const name of bindingIdentifiers(declaration.name)) {
        remember(locals, name.text, "const", lineOf(sourceFile, name));
      }
    }
  }
}

function collectExports(
  sourceFile: ts.SourceFile,
  statement: ts.Statement,
  locals: Map<string, LocalDeclaration>,
  exported: Array<{ name: string; declaration: LocalDeclaration }>,
  omissions: Set<CodeSymbolFileOmission>,
): void {
  if (ts.isExportAssignment(statement)) {
    if (statement.isExportEquals) {
      omissions.add("unclassified_export");
      return;
    }
    collectDefaultExpression(sourceFile, statement.expression, locals, exported, omissions);
    return;
  }
  if (ts.isExportDeclaration(statement)) {
    if (statement.moduleSpecifier) {
      omissions.add("unresolved_export");
      return;
    }
    for (const element of statement.exportClause && ts.isNamedExports(statement.exportClause)
      ? statement.exportClause.elements
      : []) {
      const localName = element.propertyName?.text ?? element.name.text;
      const publicName = element.name.text;
      const declaration = locals.get(localName);
      if (!declaration) {
        omissions.add("unresolved_export");
        continue;
      }
      exported.push({ name: publicName, declaration });
    }
    return;
  }
  if (ts.isModuleDeclaration(statement) && hasExport(statement)) {
    omissions.add("unclassified_export");
    return;
  }
  if (!hasExport(statement)) return;

  if (ts.isFunctionDeclaration(statement)) {
    pushNamedOrDefault(
      sourceFile,
      statement.name,
      statement,
      "function",
      hasDefault(statement),
      exported,
    );
    return;
  }
  if (ts.isClassDeclaration(statement)) {
    pushNamedOrDefault(
      sourceFile,
      statement.name,
      statement,
      "class",
      hasDefault(statement),
      exported,
    );
    return;
  }
  if (ts.isInterfaceDeclaration(statement)) {
    exported.push({
      name: statement.name.text,
      declaration: { kind: "interface", startLine: lineOf(sourceFile, statement.name) },
    });
    return;
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    exported.push({
      name: statement.name.text,
      declaration: { kind: "type", startLine: lineOf(sourceFile, statement.name) },
    });
    return;
  }
  if (ts.isEnumDeclaration(statement)) {
    exported.push({
      name: statement.name.text,
      declaration: { kind: "enum", startLine: lineOf(sourceFile, statement.name) },
    });
    return;
  }
  if (ts.isVariableStatement(statement) && isConst(statement.declarationList)) {
    for (const declaration of statement.declarationList.declarations) {
      for (const name of bindingIdentifiers(declaration.name)) {
        exported.push({
          name: name.text,
          declaration: { kind: "const", startLine: lineOf(sourceFile, name) },
        });
      }
    }
    return;
  }
  if (hasExport(statement)) omissions.add("unclassified_export");
}

function collectDefaultExpression(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
  locals: Map<string, LocalDeclaration>,
  exported: Array<{ name: string; declaration: LocalDeclaration }>,
  omissions: Set<CodeSymbolFileOmission>,
): void {
  if (ts.isIdentifier(expression)) {
    const declaration = locals.get(expression.text);
    if (!declaration) {
      omissions.add("unresolved_export");
      return;
    }
    exported.push({ name: "default", declaration });
    return;
  }
  if (ts.isFunctionExpression(expression) || ts.isArrowFunction(expression)) {
    const named = ts.isFunctionExpression(expression) ? expression.name : undefined;
    if (named) {
      exported.push({
        name: named.text,
        declaration: { kind: "function", startLine: lineOf(sourceFile, named) },
      });
    }
    exported.push({
      name: "default",
      declaration: { kind: "function", startLine: lineOf(sourceFile, expression) },
    });
    return;
  }
  if (ts.isClassExpression(expression)) {
    if (expression.name) {
      exported.push({
        name: expression.name.text,
        declaration: { kind: "class", startLine: lineOf(sourceFile, expression.name) },
      });
    }
    exported.push({
      name: "default",
      declaration: { kind: "class", startLine: lineOf(sourceFile, expression) },
    });
    return;
  }
  exported.push({
    name: "default",
    declaration: { kind: "const", startLine: lineOf(sourceFile, expression) },
  });
}

function pushNamedOrDefault(
  sourceFile: ts.SourceFile,
  name: ts.Identifier | undefined,
  anchor: ts.Node,
  kind: CodeSymbolKind,
  isDefault: boolean,
  exported: Array<{ name: string; declaration: LocalDeclaration }>,
): void {
  if (name) {
    exported.push({
      name: name.text,
      declaration: { kind, startLine: lineOf(sourceFile, name) },
    });
  }
  if (isDefault || !name) {
    exported.push({
      name: "default",
      declaration: { kind, startLine: lineOf(sourceFile, name ?? anchor) },
    });
  }
}

function remember(
  locals: Map<string, LocalDeclaration>,
  name: string,
  kind: CodeSymbolKind,
  startLine: number,
): void {
  if (!locals.has(name)) locals.set(name, { kind, startLine });
}

function toSymbol(
  path: string,
  name: string,
  declaration: LocalDeclaration,
  contentHash: string,
): CodeSymbol {
  return {
    id: symbolId(path, declaration.kind, name, declaration.startLine),
    kind: declaration.kind,
    name,
    path,
    startLine: declaration.startLine,
    exported: true,
    contentHash,
  };
}

function bindingIdentifiers(name: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  const identifiers: ts.Identifier[] = [];
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) identifiers.push(...bindingIdentifiers(element.name));
  }
  return identifiers;
}

function hasExport(node: ts.Node): boolean {
  return modifierKinds(node).includes(ts.SyntaxKind.ExportKeyword);
}

function hasDefault(node: ts.Node): boolean {
  return modifierKinds(node).includes(ts.SyntaxKind.DefaultKeyword);
}

function modifierKinds(node: ts.Node): ts.SyntaxKind[] {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.map((modifier) => modifier.kind) ?? [];
}

function isConst(list: ts.VariableDeclarationList): boolean {
  return (list.flags & ts.NodeFlags.Const) !== 0;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile, false)).line + 1;
}

function scriptKindForPath(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx") || path.endsWith(".jsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".ts") || path.endsWith(".mts") || path.endsWith(".cts")) return ts.ScriptKind.TS;
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function compareSymbols(left: CodeSymbol, right: CodeSymbol): number {
  return left.startLine - right.startLine
    || left.name.localeCompare(right.name)
    || left.kind.localeCompare(right.kind);
}
