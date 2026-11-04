/**
 * Stand-ins for the design-preview source universe that the pure edition
 * no longer ships. Fixture checks stay closed over graph and semantic-tree
 * facts; they do not require a preview compiler.
 */

export function discoverWorkspaceSourceUniverseForTest(
  _workspaceRoot: string,
): Readonly<{
  complete: boolean;
  paths: readonly string[];
  fingerprint: string;
}> {
  return Object.freeze({
    complete: true,
    paths: Object.freeze([]),
    fingerprint: "pure",
  });
}

/**
 * Blank out comments and quoted strings so `@import` / `composes:` mentioned in
 * a comment or a `content: "..."` value is not mistaken for a dependency.
 * Real rules are untouched, and an unterminated comment or string swallows the
 * rest of the text so malformed input still fails closed elsewhere.
 */
function stripCssCommentsAndStrings(text: string): string {
  let out = "";
  for (let index = 0; index < text.length; ) {
    const char = text[index]!;
    if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
      out += " ";
    } else if (char === '"' || char === "'") {
      index += 1;
      while (index < text.length && text[index] !== char && text[index] !== "\n") {
        index += text[index] === "\\" ? 2 : 1;
      }
      index += 1;
      out += '""';
    } else {
      out += char;
      index += 1;
    }
  }
  return out;
}

export function isCssModuleCompositionFree(sourceText: string): boolean {
  return !stripCssCommentsAndStrings(sourceText).includes("composes:");
}

export function buildCssStylesheetDependencyGraph(
  sources: Iterable<{ filePath: string; text: string }>,
): {
  status: "complete" | "incomplete";
  inboundByTarget: Map<string, Set<string>>;
} {
  const inboundByTarget = new Map<string, Set<string>>();
  for (const source of sources) {
    if (/@import\s/u.test(stripCssCommentsAndStrings(source.text))) {
      return { status: "incomplete", inboundByTarget };
    }
    inboundByTarget.set(source.filePath, new Set());
  }
  return { status: "complete", inboundByTarget };
}
