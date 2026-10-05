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

export function isCssModuleCompositionFree(sourceText: string): boolean {
  return !sourceText.includes("composes:");
}

export function buildCssStylesheetDependencyGraph(
  sources: Iterable<{ filePath: string; text: string }>,
): {
  status: "complete" | "incomplete";
  inboundByTarget: Map<string, Set<string>>;
} {
  const inboundByTarget = new Map<string, Set<string>>();
  for (const source of sources) {
    if (/@import\s/u.test(source.text)) {
      return { status: "incomplete", inboundByTarget };
    }
    inboundByTarget.set(source.filePath, new Set());
  }
  return { status: "complete", inboundByTarget };
}
