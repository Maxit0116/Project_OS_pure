import ts from "typescript";

export interface ModuleClause {
  specifier: string;
  /** Exported names requested from the specifier. `default` is the default export. */
  importedNames: string[];
  /** Dynamic import, require, namespace, export-star, or a binding this parser will not name. */
  unresolved: boolean;
}

/**
 * Static module clauses plus dynamic import/require.
 * Resolution of the specifier is left to DependencyImpactScanner.
 */
export function moduleClauses(path: string, source: string): { clauses: ModuleClause[]; parseFailed: boolean } {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));
  const diagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics;
  if ((diagnostics?.length ?? 0) > 0) return { clauses: [], parseFailed: true };

  const clauses: ModuleClause[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      clauses.push(importClause(node.moduleSpecifier.text, node.importClause));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      clauses.push(exportClause(node.moduleSpecifier.text, node));
    } else if (ts.isCallExpression(node) && isDynamicImportOrRequire(node)) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) {
        clauses.push({ specifier: argument.text, importedNames: [], unresolved: true });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { clauses, parseFailed: false };
}

function importClause(specifier: string, clause: ts.ImportClause | undefined): ModuleClause {
  if (!clause) return { specifier, importedNames: [], unresolved: false };
  const importedNames: string[] = [];
  let unresolved = false;
  if (clause.name) importedNames.push("default");
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) unresolved = true;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      importedNames.push(element.propertyName?.text ?? element.name.text);
    }
  }
  return { specifier, importedNames, unresolved };
}

function exportClause(specifier: string, node: ts.ExportDeclaration): ModuleClause {
  if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) {
    return { specifier, importedNames: [], unresolved: true };
  }
  return {
    specifier,
    importedNames: node.exportClause.elements.map((element) => element.propertyName?.text ?? element.name.text),
    unresolved: false,
  };
}

function isDynamicImportOrRequire(node: ts.CallExpression): boolean {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  return ts.isIdentifier(node.expression) && node.expression.text === "require";
}

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx") || path.endsWith(".jsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
