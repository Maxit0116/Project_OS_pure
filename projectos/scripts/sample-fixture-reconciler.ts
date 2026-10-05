import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";

import {
  ProjectGraphSchema,
  type FileEntry,
  type FileEntryType,
  type LinkedFileRole,
  type ProjectGraph,
} from "../contracts/graph.js";
import {
  SemanticTreeSchema,
  type SemanticTree,
  type SemanticTreeNode,
  type SemanticTreeNodeKind,
} from "../contracts/semantic-tree.js";
import {
  validateWorkspaceFixtures,
} from "../validation/validate-fixtures.js";
import {
  buildCssStylesheetDependencyGraph,
  discoverWorkspaceSourceUniverseForTest,
  isCssModuleCompositionFree,
} from "./pure-edition-fixture-stubs.js";

const AUTHORITATIVE_FIXTURE_NAMES = [
  "graph.json",
  "semantic-tree.json",
] as const;

/**
 * This list is intentionally explicit. Add a target only after deciding that it
 * is a read-only mirror of the sample workspace fixtures.
 */
export const DEFAULT_FIXTURE_MIRROR_ROOTS = [
  "client/sample-projectos-fixtures",
] as const;

const FIXTURE_GRAPH_VERSION = "0.2.0";
const FIXTURE_TREE_VERSION = "0.1.0";
const PINNED_EDITOR_PREVIEW_ROUTE = "/dashboard";
const MANAGED_FILE_NAMES = new Set([
  ".babelrc",
  "package.json",
  "tsconfig.json",
]);
const MANAGED_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".astro",
  ".js",
  ".jsx",
  ".less",
  ".mdx",
  ".mjs",
  ".mts",
  ".prisma",
  ".sass",
  ".scss",
  ".sql",
  ".styl",
  ".stylus",
  ".svelte",
  ".toml",
  ".ts",
  ".tsx",
  ".vue",
]);
const SOURCE_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const STYLESHEET_FILE_EXTENSIONS = new Set([
  ".css",
  ".less",
  ".sass",
  ".scss",
  ".styl",
  ".stylus",
]);
const SKIPPED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".projectos",
  "node_modules",
]);
const MODULE_FILE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".json",
] as const;
const CHINESE_TEXT = /[\u3400-\u9fff]/u;
const PLACEHOLDER_TEXT = /待人工/u;

/**
 * The old fixture intentionally has satellites that were indexed without a
 * feature link. New managed files are not allowed to repeat that debt.
 */
const LEGACY_LINKLESS_PATHS = new Set([
  "components/AdminNav.tsx",
  "components/BlogCard.tsx",
  "components/Header.tsx",
  "components/PricingCard.tsx",
  "components/ui/ChartContainer.tsx",
  "components/ui/Modal.tsx",
  "components/ui/NotificationBell.tsx",
  "components/ui/SearchBar.tsx",
  "components/ui/ShareButton.tsx",
  "lib/hooks/useAuth.ts",
  "lib/utils.ts",
  "lib/validators.ts",
  "tsconfig.json",
]);

/**
 * The old tree omits these satellites. The reconciler preserves that curated
 * history but requires every newly managed file to receive a semantic leaf.
 */
const LEGACY_TREELESS_PATHS = new Set([
  "components/AdminNav.tsx",
  "components/BlogCard.tsx",
  "components/Header.tsx",
  "components/PricingCard.tsx",
  "components/ui/ChartContainer.tsx",
  "components/ui/Modal.tsx",
  "components/ui/NotificationBell.tsx",
  "components/ui/SearchBar.tsx",
  "components/ui/ShareButton.tsx",
  "lib/constants.ts",
  "lib/hooks/useAuth.ts",
  "lib/utils.ts",
  "lib/validators.ts",
  "next.config.js",
  "package.json",
  "tsconfig.json",
]);

interface OwnershipSignature {
  index: string[];
  linked: string[];
  semantic: string[];
}

/**
 * These are exact inherited ownership divergences, not patterns. Any change to
 * one of them must either reconcile the fixture or update this reviewed debt
 * ledger deliberately. New paths receive strict three-surface ownership.
 */
const LEGACY_OWNERSHIP_DIVERGENCES: Readonly<
  Record<string, OwnershipSignature>
> = {
  "app/about/page.tsx": {
    index: ["feat_about"],
    linked: ["feat_about", "feat_home"],
    semantic: ["feat_about"],
  },
  "app/api/checkout/route.ts": {
    index: ["feat_checkout"],
    linked: ["component_route_api", "feat_checkout"],
    semantic: ["feat_checkout"],
  },
  "app/contact/page.tsx": {
    index: ["feat_contact"],
    linked: ["feat_contact", "feat_home"],
    semantic: ["feat_contact"],
  },
  "app/pricing/page.tsx": {
    index: ["feat_pricing"],
    linked: ["feat_home", "feat_pricing"],
    semantic: ["feat_pricing"],
  },
  "app/search/page.tsx": {
    index: ["feat_search"],
    linked: ["feat_blog", "feat_search"],
    semantic: ["feat_search"],
  },
  "lib/constants.ts": {
    index: [],
    linked: ["feat_checkout", "feat_home", "feat_projects"],
    semantic: [],
  },
  "lib/payments.ts": {
    index: ["feat_checkout"],
    linked: ["component_route_api", "feat_checkout", "feat_database"],
    semantic: ["feat_checkout"],
  },
  "next.config.js": {
    index: [],
    linked: ["container_next_web"],
    semantic: [],
  },
  "package.json": {
    index: [],
    linked: ["container_next_web", "system_saas_starter"],
    semantic: [],
  },
  "prisma/schema.prisma": {
    index: ["feat_database"],
    linked: ["container_saas_database", "feat_database"],
    semantic: ["feat_database"],
  },
};

const LEGACY_MISSING_CHINESE_SUMMARIES = new Set([
  "container_next_web:package.json",
  "container_next_web:next.config.js",
  "container_saas_database:prisma/schema.prisma",
  "feat_about:app/about/page.tsx",
  "feat_pricing:app/pricing/page.tsx",
]);

interface SourceFacts {
  imports: string[];
  exports: string[];
  importObservations: Array<{
    specifier: string;
    resolvedPath: string;
    line: number;
  }>;
}

interface NodeModuleBindings {
  namespaceBindings: Set<string>;
  createRequireBindings: Set<string>;
}

interface AuthorityRootBindings {
  globalObjectAliases: Set<ts.Symbol>;
  processAliases: Set<ts.Symbol>;
}

type AuthorityRootKind = "global-object" | "process";

interface MirrorSyncOperation {
  targetPath: string;
  displayPath: string;
  sourceBytes: Uint8Array;
  targetBytes?: Uint8Array;
  targetIdentity?: FileSystemIdentity;
  installedIdentity?: FileSystemIdentity;
  parentIdentity: FileSystemIdentity;
}

interface FileSystemIdentity {
  dev: bigint;
  ino: bigint;
  ctimeNs?: bigint;
}

interface MissingSourceFacts {
  imports: string[];
  exports: string[];
}

/**
 * These are the exact truthful facts omitted by old file-index entries. Any
 * added, removed, or newly recorded fact makes the exception stale and forces
 * a reviewed reconciliation. New paths must be exact from their first commit.
 */
const LEGACY_MISSING_SOURCE_FACTS: Readonly<
  Record<string, MissingSourceFacts>
> = {
  "app/blog/[slug]/page.tsx": {
    imports: ["components/ui/ShareButton.tsx"],
    exports: ["generateMetadata"],
  },
  "app/pricing/page.tsx": {
    imports: ["components/PricingCard.tsx"],
    exports: [],
  },
  "components/BlogCard.tsx": {
    imports: ["lib/utils.ts"],
    exports: [],
  },
  "components/Header.tsx": {
    imports: [
      "components/ui/NotificationBell.tsx",
      "components/ui/SearchBar.tsx",
    ],
    exports: [],
  },
  "components/PricingCard.tsx": {
    imports: ["lib/utils.ts"],
    exports: [],
  },
  "next.config.js": {
    imports: [],
    exports: ["default"],
  },
  "tools/projectos-source-binding-babel-plugin.cjs": {
    imports: [],
    exports: ["default"],
  },
};

export interface FixtureLayout {
  projectOSRoot: string;
  workspaceRoot: string;
  authoritativeRoot: string;
  mirrorRoots: string[];
}

export type FixtureIssueCode =
  | "fixture_read_failed"
  | "fixture_schema_invalid"
  | "fixture_reference_invalid"
  | "fixture_version_changed"
  | "mirror_drift"
  | "managed_file_unindexed"
  | "editor_source_universe_incomplete"
  | "indexed_file_unmanaged"
  | "indexed_file_missing"
  | "unsafe_fixture_path"
  | "source_facts_drift"
  | "legacy_exception_stale"
  | "ownership_incomplete"
  | "ownership_drift"
  | "editable_owner_invalid"
  | "linked_summary_uncurated"
  | "topology_drift"
  | "parent_child_drift"
  | "persisted_code_node";

export interface FixtureIssue {
  code: FixtureIssueCode;
  path: string;
  message: string;
}

export interface FixtureCheckReport {
  ok: boolean;
  issues: FixtureIssue[];
  inventory: string[];
  indexedFileCount: number;
  graphNodeCount: number;
  mirrorCount: number;
}

export interface ScaffoldFileRequest {
  path: string;
  role: LinkedFileRole;
}

export interface FixtureScaffoldRequest {
  ownerId: string;
  treeParentId: string;
  files: ScaffoldFileRequest[];
}

export interface FixtureScaffoldCandidate {
  version: 1;
  ownerId: string;
  treeParentId: string;
  fileIndex: FileEntry[];
  linkedFiles: Array<{
    path: string;
    role: LinkedFileRole;
    summary: string;
  }>;
  semanticChildren: SemanticTreeNode[];
  observedLocalImports: SourceFacts["importObservations"];
  reviewChecklist: string[];
}

export interface FixtureSyncResult {
  copied: string[];
  unchanged: string[];
  report: FixtureCheckReport;
}

export interface FixtureSyncTestHooks {
  beforeWriteForTest?: (context: {
    writeIndex: number;
    displayPath: string;
  }) => void;
  afterRenameBeforeVerificationForTest?: (context: {
    writeIndex: number;
    displayPath: string;
  }) => void;
}

export function discoverManagedFixtureInventoryForTest(
  workspaceRoot: string,
): Readonly<{ paths: readonly string[]; issues: readonly FixtureIssue[] }> {
  const issues: FixtureIssue[] = [];
  const paths = scanManagedWorkspaceFiles(workspaceRoot, issues);
  return Object.freeze({
    paths: Object.freeze(paths),
    issues: Object.freeze(issues),
  });
}

export class FixtureReconcilerError extends Error {
  readonly issues: FixtureIssue[];

  constructor(message: string, issues: FixtureIssue[] = []) {
    super(message);
    this.name = "FixtureReconcilerError";
    this.issues = issues;
  }
}

export function createDefaultFixtureLayout(
  projectOSRoot = findProjectOSRoot(process.cwd()),
): FixtureLayout {
  const normalizedProjectOSRoot = resolve(projectOSRoot);
  return {
    projectOSRoot: normalizedProjectOSRoot,
    workspaceRoot: resolve(normalizedProjectOSRoot, "..", "sample-graph-saas"),
    authoritativeRoot: resolve(
      normalizedProjectOSRoot,
      "..",
      "sample-graph-saas",
      ".projectos",
    ),
    mirrorRoots: DEFAULT_FIXTURE_MIRROR_ROOTS.map((mirrorRoot) =>
      resolve(normalizedProjectOSRoot, mirrorRoot)),
  };
}

export function checkFixtures(
  layout = createDefaultFixtureLayout(),
  options: {
    checkMirrors?: boolean;
    allowedSourcePaths?: ReadonlySet<string>;
  } = {},
): FixtureCheckReport {
  const issues: FixtureIssue[] = [];
  const checkMirrors = options.checkMirrors ?? true;
  const inventory = scanManagedWorkspaceFiles(layout.workspaceRoot, issues);
  const authoritativePathsSafe = checkAuthoritativePaths(layout, issues);
  const graph = authoritativePathsSafe ? readGraph(layout, issues) : undefined;
  const semanticTree = authoritativePathsSafe
    ? readSemanticTree(layout, issues)
    : undefined;

  if (checkMirrors && authoritativePathsSafe) {
    checkMirrorBytes(layout, issues);
  }

  if (!graph || !semanticTree) {
    return {
      ok: false,
      issues,
      inventory,
      indexedFileCount: 0,
      graphNodeCount: 0,
      mirrorCount: layout.mirrorRoots.length,
    };
  }

  if (graph.version !== FIXTURE_GRAPH_VERSION) {
    issues.push({
      code: "fixture_version_changed",
      path: "graph.json",
      message: `Expected graph version ${FIXTURE_GRAPH_VERSION}; received ${graph.version}`,
    });
  }
  if (semanticTree.version !== FIXTURE_TREE_VERSION) {
    issues.push({
      code: "fixture_version_changed",
      path: "semantic-tree.json",
      message: `Expected semantic-tree version ${FIXTURE_TREE_VERSION}; received ${semanticTree.version}`,
    });
  }
  if (semanticTree.projectId !== graph.projectId) {
    issues.push({
      code: "fixture_reference_invalid",
      path: "semantic-tree.json:projectId",
      message: `Semantic tree project '${semanticTree.projectId}' does not match graph project '${graph.projectId}'`,
    });
  }

  checkFixtureReferences(layout, issues);
  checkManagedInventory(layout, graph, inventory, issues);
  checkEditorSourceUniverse(layout, inventory, issues);
  checkTopology(graph, issues);
  checkOwnership(graph, semanticTree, issues);
  checkSourceFacts(layout, graph, issues, options.allowedSourcePaths);

  return {
    ok: issues.length === 0,
    issues,
    inventory,
    indexedFileCount: graph.fileIndex.length,
    graphNodeCount: graph.nodes.length,
    mirrorCount: layout.mirrorRoots.length,
  };
}

export function scaffoldFixtures(
  request: FixtureScaffoldRequest,
  layout = createDefaultFixtureLayout(),
): FixtureScaffoldCandidate {
  const requestedPaths = new Set(
    request.files.map((file) => validateFixturePath(file.path)),
  );
  const baseline = checkFixtures(layout, {
    checkMirrors: false,
    allowedSourcePaths: requestedPaths,
  });
  const blockingBaselineIssues = baseline.issues.filter((issue) =>
    issue.code !== "managed_file_unindexed" ||
    !requestedPaths.has(issue.path));
  if (blockingBaselineIssues.length > 0) {
    throw new FixtureReconcilerError(
      "Refusing to scaffold from an inconsistent fixture baseline",
      blockingBaselineIssues,
    );
  }

  const graph = ProjectGraphSchema.parse(
    JSON.parse(
      readFileSync(join(layout.authoritativeRoot, "graph.json"), "utf8"),
    ),
  );
  const semanticTree = SemanticTreeSchema.parse(
    JSON.parse(
      readFileSync(
        join(layout.authoritativeRoot, "semantic-tree.json"),
        "utf8",
      ),
    ),
  );
  const owner = graph.nodes.find((node) => node.id === request.ownerId);
  if (!owner) {
    throw new FixtureReconcilerError(
      `Unknown graph owner '${request.ownerId}'`,
    );
  }
  if (owner.level !== "component") {
    throw new FixtureReconcilerError(
      `Scaffold owner '${request.ownerId}' must be a component-level node`,
    );
  }

  const treeParent = flattenSemanticTree(semanticTree.roots).find(
    (node) => node.id === request.treeParentId,
  );
  if (!treeParent) {
    throw new FixtureReconcilerError(
      `Unknown semantic-tree parent '${request.treeParentId}'`,
    );
  }
  if (treeParent.sourceNodeId !== request.ownerId) {
    throw new FixtureReconcilerError(
      `Semantic-tree parent '${request.treeParentId}' is not owned by '${request.ownerId}'`,
    );
  }
  if (treeParent.kind !== "feature" || treeParent.path !== undefined) {
    throw new FixtureReconcilerError(
      `Semantic-tree parent '${request.treeParentId}' must be a pathless feature node`,
    );
  }
  const ownerFeatureParents = flattenSemanticTree(semanticTree.roots)
    .filter((node) =>
      node.kind === "feature" &&
      node.path === undefined &&
      node.sourceNodeId === request.ownerId);
  if (
    ownerFeatureParents.length !== 1 ||
    ownerFeatureParents[0]?.id !== request.treeParentId
  ) {
    throw new FixtureReconcilerError(
      `Scaffold owner '${request.ownerId}' must have exactly one pathless semantic feature parent, and it must be '${request.treeParentId}'`,
    );
  }
  if (request.files.length === 0) {
    throw new FixtureReconcilerError("At least one scaffold file is required");
  }

  const indexedPaths = new Set(graph.fileIndex.map((file) => file.path));
  const allowedLocalPaths = new Set([
    ...indexedPaths,
    ...requestedPaths,
  ]);
  const requestPaths = new Set<string>();
  const compilerOptions = readWorkspaceCompilerOptions(layout.workspaceRoot);
  const fileIndex: FileEntry[] = [];
  const linkedFiles: FixtureScaffoldCandidate["linkedFiles"] = [];
  const semanticChildren: SemanticTreeNode[] = [];
  const observedLocalImports: SourceFacts["importObservations"] = [];

  for (const file of request.files) {
    const normalizedPath = validateFixturePath(file.path);
    if (requestPaths.has(normalizedPath)) {
      throw new FixtureReconcilerError(
        `Duplicate scaffold path '${normalizedPath}'`,
      );
    }
    requestPaths.add(normalizedPath);
    if (indexedPaths.has(normalizedPath)) {
      throw new FixtureReconcilerError(
        `Scaffold path '${normalizedPath}' is already indexed`,
      );
    }
    if (!isManagedWorkspacePath(normalizedPath)) {
      throw new FixtureReconcilerError(
        `Scaffold path '${normalizedPath}' is outside the managed fixture universe`,
      );
    }
    const absolutePath = resolveWorkspaceFile(
      layout.workspaceRoot,
      normalizedPath,
    );
    if (!existsSync(absolutePath) || !lstatSync(absolutePath).isFile()) {
      throw new FixtureReconcilerError(
        `Scaffold path '${normalizedPath}' does not exist as a regular file`,
      );
    }

    const facts = analyzeSourceFacts(
      layout.workspaceRoot,
      normalizedPath,
      compilerOptions,
      allowedLocalPaths,
    );
    fileIndex.push({
      path: normalizedPath,
      type: inferFileEntryType(normalizedPath),
      nodeIds: [request.ownerId],
      imports: facts.imports,
      exports: facts.exports,
    });
    linkedFiles.push({
      path: normalizedPath,
      role: file.role,
      summary: `待人工补充中文职责说明：${normalizedPath}`,
    });
    semanticChildren.push({
      id: semanticLeafId(normalizedPath),
      label: normalizedPath,
      kind: inferSemanticTreeKind(normalizedPath),
      path: normalizedPath,
      sourceNodeId: request.ownerId,
      status: "normal",
      children: [],
    });
    observedLocalImports.push(...facts.importObservations);
  }

  fileIndex.sort((left, right) => compareText(left.path, right.path));
  linkedFiles.sort((left, right) => compareText(left.path, right.path));
  semanticChildren.sort((left, right) =>
    compareText(left.path ?? "", right.path ?? ""));
  observedLocalImports.sort((left, right) =>
    compareText(
      `${left.resolvedPath}:${left.line}:${left.specifier}`,
      `${right.resolvedPath}:${right.line}:${right.specifier}`,
    ));

  return {
    version: 1,
    ownerId: request.ownerId,
    treeParentId: request.treeParentId,
    fileIndex,
    linkedFiles,
    semanticChildren,
    observedLocalImports,
    reviewChecklist: [
      "Replace every 待人工 placeholder with reviewed Chinese copy.",
      "Confirm primary/supporting/config/test roles and semantic-tree ordering.",
      "Curate feature boundaries, shared ownership, functional edges, labels, and evidence manually.",
      "Run fixtures:sync, then fixtures:check; committed JSON remains authoritative.",
    ],
  };
}

export function syncFixtureMirrors(
  layout = createDefaultFixtureLayout(),
  testHooks: FixtureSyncTestHooks = {},
): FixtureSyncResult {
  const authoritativeReport = checkFixtures(layout, { checkMirrors: false });
  if (!authoritativeReport.ok) {
    throw new FixtureReconcilerError(
      "Refusing to sync invalid authoritative fixtures",
      authoritativeReport.issues,
    );
  }

  const copied: string[] = [];
  const unchanged: string[] = [];
  assertAuthoritativePaths(layout);
  const targetPaths = new Set<string>();
  for (const mirrorRoot of layout.mirrorRoots) {
    assertSafeMirrorRoot(layout.projectOSRoot, mirrorRoot);
    for (const fixtureName of AUTHORITATIVE_FIXTURE_NAMES) {
      const targetPath = join(mirrorRoot, fixtureName);
      assertContainedNonSymlinkPath(
        layout.projectOSRoot,
        targetPath,
        true,
        "Mirror target",
      );
      assertMirrorTargetDisjointFromAuthority(layout, targetPath);
      const normalizedTarget = resolve(targetPath);
      if (targetPaths.has(normalizedTarget)) {
        throw new FixtureReconcilerError(
          `Mirror target '${targetPath}' is configured more than once`,
        );
      }
      targetPaths.add(normalizedTarget);
    }
  }

  for (const mirrorRoot of layout.mirrorRoots) {
    mkdirSync(mirrorRoot, { recursive: true });
    assertSafeMirrorRoot(layout.projectOSRoot, mirrorRoot);
  }

  const operations: MirrorSyncOperation[] = [];
  const sourceSnapshots = new Map<string, {
    identity: FileSystemIdentity;
    bytes: Uint8Array;
  }>();
  const targetIdentities = new Map<string, string>();
  for (const fixtureName of AUTHORITATIVE_FIXTURE_NAMES) {
    const sourcePath = join(layout.authoritativeRoot, fixtureName);
    const beforeIdentity = requireRegularSingleLinkFile(
      sourcePath,
      `Authoritative ${fixtureName}`,
    );
    const bytes = readFileSync(sourcePath, { encoding: null });
    const afterIdentity = requireRegularSingleLinkFile(
      sourcePath,
      `Authoritative ${fixtureName}`,
    );
    if (!sameFileSystemIdentity(beforeIdentity, afterIdentity)) {
      throw new FixtureReconcilerError(
        `Authoritative '${fixtureName}' changed during sync preflight`,
      );
    }
    sourceSnapshots.set(fixtureName, {
      identity: beforeIdentity,
      bytes,
    });
  }
  for (const mirrorRoot of layout.mirrorRoots) {
    for (const fixtureName of AUTHORITATIVE_FIXTURE_NAMES) {
      const targetPath = join(mirrorRoot, fixtureName);
      const sourceSnapshot = sourceSnapshots.get(fixtureName)!;
      const sourceBytes = sourceSnapshot.bytes;
      let targetBytes: Uint8Array | undefined;
      let targetIdentity: FileSystemIdentity | undefined;
      if (existsSync(targetPath)) {
        const beforeTargetIdentity = requireRegularSingleLinkFile(
          targetPath,
          "Mirror target",
        );
        const identityKey = fileSystemIdentityKey(beforeTargetIdentity);
        if (
          sameFileSystemIdentity(
            beforeTargetIdentity,
            sourceSnapshot.identity,
          )
        ) {
          throw new FixtureReconcilerError(
            `Mirror target '${targetPath}' aliases authoritative '${fixtureName}'`,
          );
        }
        const priorTarget = targetIdentities.get(identityKey);
        if (priorTarget) {
          throw new FixtureReconcilerError(
            `Mirror targets '${priorTarget}' and '${targetPath}' alias the same file`,
          );
        }
        targetIdentities.set(identityKey, targetPath);
        targetBytes = readFileSync(targetPath, { encoding: null });
        const afterTargetIdentity = requireRegularSingleLinkFile(
          targetPath,
          "Mirror target",
        );
        if (
          !sameFileSystemIdentity(
            beforeTargetIdentity,
            afterTargetIdentity,
          )
        ) {
          throw new FixtureReconcilerError(
            `Mirror target '${targetPath}' changed during sync preflight`,
          );
        }
        targetIdentity = beforeTargetIdentity;
      }
      const displayPath = normalizePath(
        relative(layout.projectOSRoot, targetPath),
      );
      operations.push({
        targetPath,
        displayPath,
        sourceBytes,
        ...(targetBytes ? { targetBytes } : {}),
        ...(targetIdentity ? { targetIdentity } : {}),
        parentIdentity: requireCanonicalDirectory(
          dirname(targetPath),
          "Mirror target parent",
        ),
      });
    }
  }

  const applied: MirrorSyncOperation[] = [];
  let writeIndex = 0;
  try {
    for (const operation of operations) {
      if (
        operation.targetBytes &&
        bytesEqual(operation.targetBytes, operation.sourceBytes)
      ) {
        unchanged.push(operation.displayPath);
        continue;
      }
      testHooks.beforeWriteForTest?.({
        writeIndex,
        displayPath: operation.displayPath,
      });
      writeIndex += 1;
      assertTargetMatchesPreflight(operation);
      writeFileAtomically(
        operation.targetPath,
        operation.sourceBytes,
        operation.parentIdentity,
        (renamedIdentity) => {
          operation.installedIdentity = renamedIdentity;
          applied.push(operation);
          copied.push(operation.displayPath);
        },
        (verifiedIdentity) => {
          operation.installedIdentity = verifiedIdentity;
        },
        () => {
          testHooks.afterRenameBeforeVerificationForTest?.({
            writeIndex: writeIndex - 1,
            displayPath: operation.displayPath,
          });
        },
      );
    }

    const report = checkFixtures(layout);
    if (!report.ok) {
      throw new FixtureReconcilerError(
        "Fixture mirrors remained inconsistent after sync",
        report.issues,
      );
    }
    return { copied, unchanged, report };
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (let index = applied.length - 1; index >= 0; index -= 1) {
      const operation = applied[index]!;
      try {
        assertDirectoryIdentity(
          dirname(operation.targetPath),
          operation.parentIdentity,
          "Mirror rollback parent",
        );
        if (!existsSync(operation.targetPath)) {
          throw new FixtureReconcilerError(
            "Applied mirror target disappeared before rollback",
          );
        }
        const currentIdentity = requireRegularSingleLinkFile(
          operation.targetPath,
          "Applied mirror target",
        );
        if (
          !operation.installedIdentity ||
          !sameFileSystemIdentity(
            currentIdentity,
            operation.installedIdentity,
          )
        ) {
          throw new FixtureReconcilerError(
            "Applied mirror target identity changed concurrently; refusing stale rollback",
          );
        }
        const currentBytes = readFileSync(operation.targetPath, {
          encoding: null,
        });
        if (!bytesEqual(currentBytes, operation.sourceBytes)) {
          throw new FixtureReconcilerError(
            "Applied mirror target changed concurrently; refusing stale rollback",
          );
        }
        const afterReadIdentity = requireRegularSingleLinkFile(
          operation.targetPath,
          "Applied mirror target",
        );
        if (
          !sameFileSystemIdentity(
            currentIdentity,
            afterReadIdentity,
          ) ||
          !sameFileSystemIdentity(
            afterReadIdentity,
            operation.installedIdentity,
          )
        ) {
          throw new FixtureReconcilerError(
            "Applied mirror target changed while verifying rollback state",
          );
        }
        if (operation.targetBytes) {
          writeFileAtomically(
            operation.targetPath,
            operation.targetBytes,
            operation.parentIdentity,
          );
        } else {
          unlinkSync(operation.targetPath);
          assertDirectoryIdentity(
            dirname(operation.targetPath),
            operation.parentIdentity,
            "Mirror rollback parent",
          );
        }
      } catch (rollbackError) {
        rollbackErrors.push(
          `${operation.displayPath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }
    }
    if (rollbackErrors.length > 0) {
      throw new FixtureReconcilerError(
        `Fixture mirror sync failed and rollback was incomplete: ${rollbackErrors.join("; ")}`,
      );
    }
    throw error;
  }
}

function findProjectOSRoot(startPath: string): string {
  let current = resolve(startPath);
  for (let depth = 0; depth < 8; depth += 1) {
    const packagePath = join(current, "package.json");
    if (existsSync(packagePath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
          name?: unknown;
        };
        if (packageJson.name === "projectos") return current;
      } catch {
        // Keep walking; this directory is not a usable ProjectOS root.
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new FixtureReconcilerError(
    `Could not locate the projectos package from '${startPath}'`,
  );
}

function checkAuthoritativePaths(
  layout: FixtureLayout,
  issues: FixtureIssue[],
): boolean {
  try {
    assertAuthoritativePaths(layout);
    return true;
  } catch (error) {
    issues.push({
      code: "fixture_read_failed",
      path: normalizePath(
        relative(layout.workspaceRoot, layout.authoritativeRoot),
      ),
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function assertAuthoritativePaths(layout: FixtureLayout): void {
  const expectedAuthority = resolve(layout.workspaceRoot, ".projectos");
  if (resolve(layout.authoritativeRoot) !== expectedAuthority) {
    throw new FixtureReconcilerError(
      `Authoritative fixture root must be exactly '${expectedAuthority}'`,
    );
  }
  assertContainedNonSymlinkPath(
    layout.workspaceRoot,
    layout.authoritativeRoot,
    false,
    "Authoritative fixture root",
  );
  requireCanonicalDirectory(
    layout.authoritativeRoot,
    "Authoritative fixture root",
  );
  for (const fixtureName of AUTHORITATIVE_FIXTURE_NAMES) {
    const fixturePath = join(layout.authoritativeRoot, fixtureName);
    assertContainedNonSymlinkPath(
      layout.workspaceRoot,
      fixturePath,
      false,
      `Authoritative ${fixtureName}`,
    );
    requireRegularSingleLinkFile(
      fixturePath,
      `Authoritative fixture '${fixturePath}'`,
    );
  }
}

function readGraph(
  layout: FixtureLayout,
  issues: FixtureIssue[],
): ProjectGraph | undefined {
  return readFixture(
    join(layout.authoritativeRoot, "graph.json"),
    "graph.json",
    ProjectGraphSchema,
    issues,
  );
}

function readSemanticTree(
  layout: FixtureLayout,
  issues: FixtureIssue[],
): SemanticTree | undefined {
  return readFixture(
    join(layout.authoritativeRoot, "semantic-tree.json"),
    "semantic-tree.json",
    SemanticTreeSchema,
    issues,
  );
}

function readFixture<T>(
  absolutePath: string,
  displayPath: string,
  schema: { safeParse(value: unknown): { success: true; data: T } | {
    success: false;
    error: { issues: Array<{ path: PropertyKey[]; message: string }> };
  } },
  issues: FixtureIssue[],
): T | undefined {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    issues.push({
      code: "fixture_read_failed",
      path: displayPath,
      message: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) {
    issues.push({
      code: "fixture_schema_invalid",
      path: `${displayPath}:${issue.path.join(".")}`,
      message: issue.message,
    });
  }
  return undefined;
}

function checkMirrorBytes(
  layout: FixtureLayout,
  issues: FixtureIssue[],
): void {
  const seenMirrorTargets = new Set<string>();
  const seenMirrorIdentities = new Map<string, string>();
  for (const mirrorRoot of layout.mirrorRoots) {
    try {
      assertSafeMirrorRoot(layout.projectOSRoot, mirrorRoot);
    } catch (error) {
      issues.push({
        code: "mirror_drift",
        path: normalizePath(relative(layout.projectOSRoot, mirrorRoot)),
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    for (const fixtureName of AUTHORITATIVE_FIXTURE_NAMES) {
      const authoritativePath = join(layout.authoritativeRoot, fixtureName);
      const mirrorPath = join(mirrorRoot, fixtureName);
      try {
        assertMirrorTargetDisjointFromAuthority(layout, mirrorPath);
        const normalizedMirrorPath = resolve(mirrorPath);
        if (seenMirrorTargets.has(normalizedMirrorPath)) {
          throw new FixtureReconcilerError(
            "Mirror fixture target is configured more than once",
          );
        }
        seenMirrorTargets.add(normalizedMirrorPath);
        const authoritativeIdentity = requireRegularSingleLinkFile(
          authoritativePath,
          `Authoritative ${fixtureName}`,
        );
        const mirrorIdentity = requireRegularSingleLinkFile(
          mirrorPath,
          "Mirror fixture",
        );
        if (sameFileSystemIdentity(authoritativeIdentity, mirrorIdentity)) {
          throw new FixtureReconcilerError(
            "Mirror fixture aliases its authoritative source",
          );
        }
        const identityKey = fileSystemIdentityKey(mirrorIdentity);
        const priorPath = seenMirrorIdentities.get(identityKey);
        if (priorPath) {
          throw new FixtureReconcilerError(
            `Mirror fixtures '${priorPath}' and '${mirrorPath}' alias the same file`,
          );
        }
        seenMirrorIdentities.set(identityKey, mirrorPath);
        const authoritativeBytes = readFileSync(authoritativePath, {
          encoding: null,
        });
        const mirrorBytes = readFileSync(mirrorPath, { encoding: null });
        if (!bytesEqual(authoritativeBytes, mirrorBytes)) {
          issues.push({
            code: "mirror_drift",
            path: normalizePath(relative(layout.projectOSRoot, mirrorPath)),
            message: `${fixtureName} is not byte-identical to the authoritative fixture`,
          });
        }
      } catch (error) {
        issues.push({
          code: "mirror_drift",
          path: normalizePath(relative(layout.projectOSRoot, mirrorPath)),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

function checkFixtureReferences(
  layout: FixtureLayout,
  issues: FixtureIssue[],
): void {
  const result = validateWorkspaceFixtures(layout.workspaceRoot);
  for (const error of result.errors) {
    issues.push({
      code: "fixture_reference_invalid",
      path: `${error.artifact}:${error.path}`,
      message: `${error.code}: ${error.message}`,
    });
  }
}

function scanManagedWorkspaceFiles(
  workspaceRoot: string,
  issues: FixtureIssue[],
): string[] {
  const files: string[] = [];
  const pending = [""];
  while (pending.length > 0) {
    const relativeDirectory = pending.pop()!;
    const absoluteDirectory = resolve(workspaceRoot, relativeDirectory);
    const entries = readdirSync(absoluteDirectory).sort(compareText);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]!;
      const relativePath = normalizePath(
        relativeDirectory
          ? join(relativeDirectory, entry)
          : entry,
      );
      const entryStatus = lstatSync(resolve(absoluteDirectory, entry));
      if (entryStatus.isSymbolicLink()) {
        if (isManagedWorkspacePath(relativePath) || extname(relativePath) === "") {
          issues.push({
            code: "unsafe_fixture_path",
            path: relativePath,
            message: "Managed fixture inventory may not traverse symbolic links",
          });
          if (isManagedWorkspacePath(relativePath)) files.push(relativePath);
        }
        continue;
      }
      if (entryStatus.isDirectory()) {
        if (!SKIPPED_DIRECTORY_NAMES.has(entry.toLowerCase())) {
          pending.push(relativePath);
        }
        continue;
      }
      if (entryStatus.isFile() && isManagedWorkspacePath(relativePath)) {
        files.push(relativePath);
      }
    }
  }
  return files.sort(compareText);
}

function isManagedWorkspacePath(filePath: string): boolean {
  if (filePath.split("/").some((segment) =>
    SKIPPED_DIRECTORY_NAMES.has(segment.toLowerCase()))) {
    return false;
  }
  if (
    filePath.endsWith(".d.ts") ||
    filePath.endsWith(".d.mts") ||
    filePath.endsWith(".d.cts")
  ) return false;
  if (MANAGED_FILE_NAMES.has(basename(filePath))) return true;
  return MANAGED_FILE_EXTENSIONS.has(extname(filePath));
}

function checkManagedInventory(
  layout: FixtureLayout,
  graph: ProjectGraph,
  inventory: string[],
  issues: FixtureIssue[],
): void {
  const inventorySet = new Set(inventory);
  const indexedPaths = new Set(graph.fileIndex.map((file) => file.path));
  for (const filePath of inventory) {
    if (!indexedPaths.has(filePath)) {
      issues.push({
        code: "managed_file_unindexed",
        path: filePath,
        message: "Managed source/config/migration file is missing from graph.fileIndex",
      });
    }
  }
  for (const file of graph.fileIndex) {
    let normalizedPath: string;
    try {
      normalizedPath = validateFixturePath(file.path);
    } catch (error) {
      issues.push({
        code: "unsafe_fixture_path",
        path: file.path,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (!inventorySet.has(normalizedPath)) {
      issues.push({
        code: "indexed_file_unmanaged",
        path: normalizedPath,
        message: "Indexed path is outside the deterministic managed-file inventory",
      });
    }
    const absolutePath = resolveWorkspaceFile(
      layout.workspaceRoot,
      normalizedPath,
    );
    if (
      !existsSync(absolutePath) ||
      !lstatSync(absolutePath).isFile() ||
      lstatSync(absolutePath).isSymbolicLink()
    ) {
      issues.push({
        code: "indexed_file_missing",
        path: normalizedPath,
        message: "Indexed path must resolve to one regular non-symlink workspace file",
      });
    }
  }
}

function checkEditorSourceUniverse(
  layout: FixtureLayout,
  inventory: readonly string[],
  issues: FixtureIssue[],
): void {
  const editorUniverse = discoverWorkspaceSourceUniverseForTest(
    layout.workspaceRoot,
  );
  if (!editorUniverse.complete) {
    issues.push({
      code: "editor_source_universe_incomplete",
      path: ".",
      message: "The production preview source universe is incomplete; direct editing would fail closed",
    });
  }
  const inventorySet = new Set(inventory);
  for (const filePath of editorUniverse.paths) {
    if (!inventorySet.has(filePath)) {
      issues.push({
        code: "editor_source_universe_incomplete",
        path: filePath,
        message: "Production preview source is outside the reconciler managed inventory",
      });
    }
  }
}

function checkTopology(graph: ProjectGraph, issues: FixtureIssue[]): void {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const expectedRootIds = graph.nodes
    .filter((node) => !node.parentId)
    .map((node) => node.id);
  const depths = new Map<string, number>();
  const visiting = new Set<string>();

  const depthFor = (nodeId: string): number => {
    const retained = depths.get(nodeId);
    if (retained !== undefined) return retained;
    if (visiting.has(nodeId)) return 0;
    visiting.add(nodeId);
    const node = nodesById.get(nodeId);
    const depth = node?.parentId && nodesById.has(node.parentId)
      ? depthFor(node.parentId) + 1
      : 0;
    visiting.delete(nodeId);
    depths.set(nodeId, depth);
    return depth;
  };

  for (const node of graph.nodes) {
    const children = node.children ?? [];
    if (new Set(children).size !== children.length) {
      issues.push({
        code: "topology_drift",
        path: `nodes.${node.id}.children`,
        message: "Node children must be a duplicate-free deterministic array",
      });
    }
    const computedDepth = depthFor(node.id);
    if (node.depth !== undefined && node.depth !== computedDepth) {
      issues.push({
        code: "topology_drift",
        path: `nodes.${node.id}.depth`,
        message: `Stored depth ${node.depth} does not match computed depth ${computedDepth}`,
      });
    }
    if (node.level === "code") {
      issues.push({
        code: "persisted_code_node",
        path: `nodes.${node.id}`,
        message: "Code-level nodes must remain runtime projections, not fixture nodes",
      });
    }
    if (node.parentId) {
      const parent = nodesById.get(node.parentId);
      if (!parent?.children?.includes(node.id)) {
        issues.push({
          code: "parent_child_drift",
          path: `nodes.${node.id}.parentId`,
          message: `Parent '${node.parentId}' does not reciprocate child '${node.id}'`,
        });
      }
    }
    for (const childId of children) {
      if (nodesById.get(childId)?.parentId !== node.id) {
        issues.push({
          code: "parent_child_drift",
          path: `nodes.${node.id}.children`,
          message: `Child '${childId}' does not reciprocate parent '${node.id}'`,
        });
      }
    }
  }

  const expectedMaxDepth = Math.max(0, ...depths.values());
  if (
    !graph.topology ||
    !arraysEqual(graph.topology.rootIds, expectedRootIds) ||
    graph.topology.maxDepth !== expectedMaxDepth ||
    graph.topology.totalNodes !== graph.nodes.length
  ) {
    issues.push({
      code: "topology_drift",
      path: "graph.json:topology",
      message: `Expected roots=${JSON.stringify(expectedRootIds)}, maxDepth=${expectedMaxDepth}, totalNodes=${graph.nodes.length}`,
    });
  }
}

function checkOwnership(
  graph: ProjectGraph,
  semanticTree: SemanticTree,
  issues: FixtureIssue[],
): void {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const indexedPaths = new Set(graph.fileIndex.map((file) => file.path));
  const linkedOwners = new Map<string, string[]>();
  const semanticOwners = new Map<string, string[]>();
  const semanticFeatureParentsByOwner = new Map<string, string[]>();
  const ownershipByPath = new Map<string, OwnershipSignature>();
  const semanticNodeIds = new Set<string>();
  const semanticPaths = new Set<string>();
  const missingSummaryKeys = new Set<string>();

  for (const node of graph.nodes) {
    const seenLinkedPaths = new Set<string>();
    for (const file of node.linkedFiles) {
      if (seenLinkedPaths.has(file.path)) {
        issues.push({
          code: "ownership_drift",
          path: `${node.id}:${file.path}`,
          message: "A graph node may link a workspace path only once",
        });
      }
      seenLinkedPaths.add(file.path);
      try {
        validateFixturePath(file.path);
      } catch (error) {
        issues.push({
          code: "unsafe_fixture_path",
          path: `${node.id}:${file.path}`,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (!indexedPaths.has(file.path)) {
        issues.push({
          code: "ownership_incomplete",
          path: `${node.id}:${file.path}`,
          message: "linkedFiles path is missing from graph.fileIndex",
        });
      }
      appendMapValue(linkedOwners, file.path, node.id);
      const summaryKey = `${node.id}:${file.path}`;
      if (
        !file.summary ||
        !CHINESE_TEXT.test(file.summary) ||
        PLACEHOLDER_TEXT.test(file.summary)
      ) {
        if (LEGACY_MISSING_CHINESE_SUMMARIES.has(summaryKey)) {
          missingSummaryKeys.add(summaryKey);
        } else {
          issues.push({
            code: "linked_summary_uncurated",
            path: summaryKey,
            message: "New linked files require reviewed non-placeholder Chinese copy",
          });
        }
      }
    }
  }
  const pendingSemanticNodes: Array<{
    node: SemanticTreeNode;
    parent?: SemanticTreeNode;
  }> = semanticTree.roots.map((node) => ({ node }));
  while (pendingSemanticNodes.length > 0) {
    const { node, parent } = pendingSemanticNodes.pop()!;
    if (semanticNodeIds.has(node.id)) {
      issues.push({
        code: "ownership_drift",
        path: node.id,
        message: "Semantic-tree node IDs must be globally unique",
      });
    }
    semanticNodeIds.add(node.id);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pendingSemanticNodes.push({ node: node.children[index]!, parent: node });
    }
    if (
      node.kind === "feature" &&
      node.path === undefined &&
      node.sourceNodeId
    ) {
      appendMapValue(
        semanticFeatureParentsByOwner,
        node.sourceNodeId,
        node.id,
      );
    }
    if (node.path === undefined) continue;
    if (node.children.length > 0) {
      issues.push({
        code: "ownership_drift",
        path: `${node.id}:${node.path}`,
        message: "Path-bearing semantic-tree nodes must be leaves",
      });
    }
    if (
      !parent ||
      parent.kind !== "feature" ||
      parent.path !== undefined ||
      !node.sourceNodeId ||
      parent.sourceNodeId !== node.sourceNodeId
    ) {
      issues.push({
        code: "ownership_drift",
        path: `${node.id}:${node.path}`,
        message: "Semantic leaves must sit directly under the pathless feature for their source owner",
      });
    }
    if (semanticPaths.has(node.path)) {
      issues.push({
        code: "ownership_drift",
        path: node.path,
        message: "A managed path may appear only once in the semantic tree",
      });
    }
    semanticPaths.add(node.path);
    try {
      validateFixturePath(node.path);
    } catch (error) {
      issues.push({
        code: "unsafe_fixture_path",
        path: `${node.id}:${node.path}`,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (!indexedPaths.has(node.path)) {
      issues.push({
        code: "ownership_incomplete",
        path: `${node.id}:${node.path}`,
        message: "Semantic-tree path is missing from graph.fileIndex",
      });
    }
    if (!node.sourceNodeId) {
      issues.push({
        code: "ownership_incomplete",
        path: `${node.id}:${node.path}`,
        message: "Semantic-tree file leaves require a sourceNodeId owner",
      });
      continue;
    }
    if (!nodesById.has(node.sourceNodeId)) {
      issues.push({
        code: "ownership_drift",
        path: `${node.id}:${node.path}`,
        message: `Semantic-tree leaf references unknown owner '${node.sourceNodeId}'`,
      });
    }
    appendMapValue(semanticOwners, node.path, node.sourceNodeId);
  }

  const indexedPrimaryOwners = uniqueSorted(
    graph.fileIndex.flatMap((file) => file.nodeIds),
  );
  for (const [ownerId, featureParents] of semanticFeatureParentsByOwner) {
    const uniqueFeatureParents = uniqueSorted(featureParents);
    if (uniqueFeatureParents.length > 1) {
      issues.push({
        code: "ownership_drift",
        path: ownerId,
        message: `Graph owners may have at most one pathless semantic feature parent; received ${JSON.stringify(uniqueFeatureParents)}`,
      });
    }
  }
  for (const ownerId of indexedPrimaryOwners) {
    const featureParents = uniqueSorted(
      semanticFeatureParentsByOwner.get(ownerId) ?? [],
    );
    if (featureParents.length !== 1) {
      issues.push({
        code: "ownership_drift",
        path: ownerId,
        message: `Indexed owner requires exactly one pathless semantic feature parent; received ${JSON.stringify(featureParents)}`,
      });
    }
  }

  for (const key of LEGACY_MISSING_CHINESE_SUMMARIES) {
    if (!missingSummaryKeys.has(key)) {
      issues.push({
        code: "legacy_exception_stale",
        path: key,
        message: "Remove the obsolete missing-Chinese-summary exception",
      });
    }
  }

  for (const file of graph.fileIndex) {
    if (new Set(file.nodeIds).size !== file.nodeIds.length) {
      issues.push({
        code: "ownership_drift",
        path: file.path,
        message: "fileIndex.nodeIds must be a duplicate-free deterministic array",
      });
    }
    const signature: OwnershipSignature = {
      index: uniqueSorted(file.nodeIds),
      linked: uniqueSorted(linkedOwners.get(file.path) ?? []),
      semantic: uniqueSorted(semanticOwners.get(file.path) ?? []),
    };
    ownershipByPath.set(file.path, signature);

    if (signature.linked.length === 0) {
      if (!LEGACY_LINKLESS_PATHS.has(file.path)) {
        issues.push({
          code: "ownership_incomplete",
          path: file.path,
          message: "Managed file is missing a graph linkedFiles owner",
        });
      }
    } else if (LEGACY_LINKLESS_PATHS.has(file.path)) {
      issues.push({
        code: "legacy_exception_stale",
        path: file.path,
        message: "Remove the obsolete linkless-path exception",
      });
    }

    if (signature.semantic.length === 0) {
      if (!LEGACY_TREELESS_PATHS.has(file.path)) {
        issues.push({
          code: "ownership_incomplete",
          path: file.path,
          message: "Managed file is missing a semantic-tree leaf owner",
        });
      }
    } else if (LEGACY_TREELESS_PATHS.has(file.path)) {
      issues.push({
        code: "legacy_exception_stale",
        path: file.path,
        message: "Remove the obsolete treeless-path exception",
      });
    }

    const legacySignature = LEGACY_OWNERSHIP_DIVERGENCES[file.path];
    if (legacySignature) {
      if (!ownershipSignaturesEqual(signature, legacySignature)) {
        issues.push({
          code: "ownership_drift",
          path: file.path,
          message: `Inherited ownership changed: expected ${JSON.stringify(legacySignature)}, received ${JSON.stringify(signature)}`,
        });
      }
    } else if (
      !LEGACY_LINKLESS_PATHS.has(file.path) &&
      !LEGACY_TREELESS_PATHS.has(file.path)
    ) {
      const primaryOwner = signature.index[0];
      if (
        signature.index.length !== 1 ||
        !arraysEqual(signature.index, signature.semantic) ||
        !primaryOwner ||
        !signature.linked.includes(primaryOwner)
      ) {
        issues.push({
          code: "ownership_drift",
          path: file.path,
          message: `New managed files require one indexed/semantic primary owner that is present among reviewed linked associations: ${JSON.stringify(signature)}`,
        });
      }
    }

    for (const nodeId of signature.index) {
      if (!nodesById.has(nodeId)) {
        issues.push({
          code: "ownership_drift",
          path: file.path,
          message: `fileIndex references unknown owner '${nodeId}'`,
        });
      }
    }
  }

  const editableCandidates: string[] = [];
  for (const owner of graph.nodes) {
    if (
      owner.level !== "component" ||
      owner.layer !== "application" ||
      owner.preview?.route !== PINNED_EDITOR_PREVIEW_ROUTE
    ) continue;
    const expectedOwners = [owner.id];
    for (const template of graph.fileIndex) {
      const templateOwnership = ownershipByPath.get(template.path);
      if (
        template.type !== "component" ||
        !templateOwnership ||
        !ownershipSignaturesEqual(templateOwnership, {
          index: expectedOwners,
          linked: expectedOwners,
          semantic: expectedOwners,
        })
      ) continue;
      for (const importedPath of template.imports) {
        const style = graph.fileIndex.find((file) =>
          file.path === importedPath &&
          file.type === "style" &&
          file.path.endsWith(".module.css"));
        const styleOwnership = style
          ? ownershipByPath.get(style.path)
          : undefined;
        if (
          style &&
          styleOwnership &&
          ownershipSignaturesEqual(styleOwnership, {
            index: expectedOwners,
            linked: expectedOwners,
            semantic: expectedOwners,
          })
        ) {
          editableCandidates.push(`${template.path}:${style.path}`);
        }
      }
    }
  }
  if (editableCandidates.length === 0) {
    issues.push({
      code: "editable_owner_invalid",
      path: PINNED_EDITOR_PREVIEW_ROUTE,
      message: "Pinned dashboard preview requires at least one uniquely owned component-to-CSS-module edit candidate",
    });
  }

  for (const path of LEGACY_LINKLESS_PATHS) {
    if (!graph.fileIndex.some((file) => file.path === path)) {
      issues.push({
        code: "legacy_exception_stale",
        path,
        message: "Remove the linkless-path exception for a deleted file",
      });
    }
  }
  for (const path of LEGACY_TREELESS_PATHS) {
    if (!graph.fileIndex.some((file) => file.path === path)) {
      issues.push({
        code: "legacy_exception_stale",
        path,
        message: "Remove the treeless-path exception for a deleted file",
      });
    }
  }
  for (const path of Object.keys(LEGACY_OWNERSHIP_DIVERGENCES)) {
    if (!graph.fileIndex.some((file) => file.path === path)) {
      issues.push({
        code: "legacy_exception_stale",
        path,
        message: "Remove the ownership-divergence exception for a deleted file",
      });
    }
  }
}

function checkSourceFacts(
  layout: FixtureLayout,
  graph: ProjectGraph,
  issues: FixtureIssue[],
  additionalAllowedLocalPaths: ReadonlySet<string> = new Set(),
): void {
  let compilerOptions: ts.CompilerOptions;
  try {
    compilerOptions = readWorkspaceCompilerOptions(layout.workspaceRoot);
  } catch (error) {
    issues.push({
      code: "source_facts_drift",
      path: "tsconfig.json",
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  const seenLegacyMissingFacts = new Set<string>();
  const allowedLocalPaths = new Set(
    [
      ...graph.fileIndex.map((file) => file.path),
      ...additionalAllowedLocalPaths,
    ],
  );
  for (const file of graph.fileIndex) {
    if (
      !SOURCE_FILE_EXTENSIONS.has(extname(file.path)) &&
      !STYLESHEET_FILE_EXTENSIONS.has(extname(file.path))
    ) continue;
    let absolutePath: string;
    try {
      absolutePath = resolveWorkspaceFile(layout.workspaceRoot, file.path);
    } catch {
      continue;
    }
    if (!existsSync(absolutePath) || !lstatSync(absolutePath).isFile()) continue;
    let facts: SourceFacts;
    try {
      facts = analyzeSourceFacts(
        layout.workspaceRoot,
        file.path,
        compilerOptions,
        allowedLocalPaths,
      );
    } catch (error) {
      issues.push({
        code: "source_facts_drift",
        path: file.path,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const storedFactsHaveDuplicates =
      new Set(file.imports).size !== file.imports.length ||
      new Set(file.exports).size !== file.exports.length;
    if (storedFactsHaveDuplicates) {
      issues.push({
        code: "source_facts_drift",
        path: file.path,
        message: "Stored imports and exports must be duplicate-free deterministic arrays",
      });
    }
    const missingFacts: MissingSourceFacts = {
      imports: facts.imports.filter((value) => !file.imports.includes(value)),
      exports: facts.exports.filter((value) => !file.exports.includes(value)),
    };
    const unexpectedStoredFacts: MissingSourceFacts = {
      imports: file.imports.filter((value) => !facts.imports.includes(value)),
      exports: file.exports.filter((value) => !facts.exports.includes(value)),
    };
    const legacyMissingFacts = LEGACY_MISSING_SOURCE_FACTS[file.path];
    if (legacyMissingFacts) {
      seenLegacyMissingFacts.add(file.path);
      if (
        unexpectedStoredFacts.imports.length > 0 ||
        unexpectedStoredFacts.exports.length > 0 ||
        !arraysEqual(missingFacts.imports, legacyMissingFacts.imports) ||
        !arraysEqual(missingFacts.exports, legacyMissingFacts.exports)
      ) {
        issues.push({
          code: "source_facts_drift",
          path: file.path,
          message: `Inherited source-fact debt changed: expected missing ${JSON.stringify(legacyMissingFacts)}, received ${JSON.stringify({ missing: missingFacts, unexpectedStored: unexpectedStoredFacts })}`,
        });
      }
      continue;
    }
    if (
      missingFacts.imports.length > 0 ||
      missingFacts.exports.length > 0 ||
      unexpectedStoredFacts.imports.length > 0 ||
      unexpectedStoredFacts.exports.length > 0
    ) {
      issues.push({
        code: "source_facts_drift",
        path: file.path,
        message: `Stored imports/exports differ from parsed source facts: ${JSON.stringify({ stored: { imports: file.imports, exports: file.exports }, observed: { imports: facts.imports, exports: facts.exports } })}`,
      });
    }
  }
  for (const path of Object.keys(LEGACY_MISSING_SOURCE_FACTS)) {
    if (!seenLegacyMissingFacts.has(path)) {
      issues.push({
        code: "legacy_exception_stale",
        path,
        message: "Remove the missing-source-facts exception for a deleted file",
      });
    }
  }
}

function readWorkspaceCompilerOptions(
  workspaceRoot: string,
): ts.CompilerOptions {
  const configPath = join(workspaceRoot, "tsconfig.json");
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) {
    throw new FixtureReconcilerError(
      `Could not parse sample tsconfig: ${formatDiagnostic(loaded.error)}`,
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    ts.sys,
    workspaceRoot,
    undefined,
    configPath,
  );
  if (parsed.errors.length > 0) {
    throw new FixtureReconcilerError(
      `Could not resolve sample tsconfig: ${parsed.errors.map(formatDiagnostic).join("; ")}`,
    );
  }
  return parsed.options;
}

function analyzeSourceFacts(
  workspaceRoot: string,
  filePath: string,
  compilerOptions: ts.CompilerOptions,
  allowedLocalPaths: ReadonlySet<string>,
): SourceFacts {
  if (STYLESHEET_FILE_EXTENSIONS.has(extname(filePath))) {
    const stylesheetText = readFileSync(
      resolveWorkspaceFile(workspaceRoot, filePath),
      "utf8",
    );
    const dependencyGraph = buildCssStylesheetDependencyGraph([{
      filePath,
      text: stylesheetText,
    }]);
    if (
      dependencyGraph.status !== "complete" ||
      [...dependencyGraph.inboundByTarget.values()].some((sources) =>
        sources.size > 0) ||
      !isCssModuleCompositionFree(stylesheetText) ||
      !hasBalancedStylesheetDelimiters(stylesheetText)
    ) {
      throw new FixtureReconcilerError(
        `Stylesheet dependency or composition syntax in '${filePath}' is not supported by the fixture reconciler`,
      );
    }
    return { imports: [], exports: [], importObservations: [] };
  }
  if (!SOURCE_FILE_EXTENSIONS.has(extname(filePath))) {
    return { imports: [], exports: [], importObservations: [] };
  }
  const absolutePath = resolveWorkspaceFile(workspaceRoot, filePath);
  const sourceText = readFileSync(absolutePath, "utf8");
  const { sourceFile, checker } = createBoundSourceAnalysis(
    absolutePath,
    sourceText,
    scriptKindForPath(filePath),
    compilerOptions,
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & {
      parseDiagnostics?: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) {
    throw new FixtureReconcilerError(
      `Could not parse '${filePath}': ${parseDiagnostics.map(formatDiagnostic).join("; ")}`,
    );
  }
  const imports: string[] = [];
  const exports: string[] = [];
  const importObservations: SourceFacts["importObservations"] = [];
  const usesNodeModule = sourceUsesNodeModule(sourceFile);
  const nodeModuleNamespaceBindings = collectNodeModuleNamespaceBindings(
    sourceFile,
  );
  const authorityRootBindings = collectAuthorityRootBindings(
    sourceFile,
    checker,
  );

  const addImport = (specifier: string, position: number): void => {
    const resolvedPath = resolveLocalModule(
      workspaceRoot,
      absolutePath,
      specifier,
      compilerOptions,
    );
    if (!resolvedPath) {
      if (isConfiguredLocalSpecifier(specifier, compilerOptions)) {
        throw new FixtureReconcilerError(
          `Local import '${specifier}' in '${filePath}' could not be resolved`,
        );
      }
      return;
    }
    if (!isManagedWorkspacePath(resolvedPath)) {
      throw new FixtureReconcilerError(
        `Local import '${specifier}' in '${filePath}' resolves to unmanaged path '${resolvedPath}'`,
      );
    }
    if (!allowedLocalPaths.has(resolvedPath)) {
      throw new FixtureReconcilerError(
        `Local import '${specifier}' in '${filePath}' resolves outside the authoritative index or explicit scaffold set: '${resolvedPath}'`,
      );
    }
    appendUnique(imports, resolvedPath);
    if (!importObservations.some((entry) =>
      entry.specifier === specifier &&
      entry.resolvedPath === resolvedPath &&
      entry.line === sourceFile.getLineAndCharacterOfPosition(position).line + 1)) {
      importObservations.push({
        specifier,
        resolvedPath,
        line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
      });
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      isDynamicEvaluatorReference(
        node,
        checker,
        sourceFile,
        authorityRootBindings,
      )
    ) {
      throw new FixtureReconcilerError(
        `Dynamic code evaluation in '${filePath}' is outside the deterministic source-fact grammar`,
      );
    }
    if (
      isProcessGetBuiltinModuleReference(
        node,
        checker,
        sourceFile,
        authorityRootBindings,
      )
    ) {
      throw new FixtureReconcilerError(
        `Captured or computed process.getBuiltinModule reference in '${filePath}' is outside the deterministic source-fact grammar`,
      );
    }
    const authorityBridge = authorityRootBridgeKind(
      node,
      checker,
      sourceFile,
      authorityRootBindings,
    );
    if (authorityBridge === "global-object") {
      throw new FixtureReconcilerError(
        `Opaque global evaluator authority in '${filePath}' is outside the deterministic source-fact grammar`,
      );
    }
    if (authorityBridge === "process") {
      throw new FixtureReconcilerError(
        `Captured or computed process.getBuiltinModule reference in '${filePath}' is outside the deterministic source-fact grammar`,
      );
    }
    const unsafeAuthorityRoot = unsafeAuthorityRootReferenceKind(
      node,
      checker,
      sourceFile,
      authorityRootBindings,
    );
    if (unsafeAuthorityRoot === "global-object") {
      throw new FixtureReconcilerError(
        `Opaque global evaluator authority in '${filePath}' is outside the deterministic source-fact grammar`,
      );
    }
    if (unsafeAuthorityRoot === "process") {
      throw new FixtureReconcilerError(
        `Captured or computed process.getBuiltinModule reference in '${filePath}' is outside the deterministic source-fact grammar`,
      );
    }
    if (
      usesNodeModule &&
      isCreateRequireReference(node, nodeModuleNamespaceBindings)
    ) {
      throw new FixtureReconcilerError(
        `createRequire loader aliases in '${filePath}' are outside the deterministic source-fact grammar`,
      );
    }
    if (
      ts.isIdentifier(node) &&
      ["exports", "module", "require"].includes(node.text)
    ) {
      const hasLocalBinding = identifierHasSourceLocalBinding(
        node,
        checker,
        sourceFile,
      );
      if (
        hasLocalBinding &&
        shadowedCommonJsBindingUsedAsAuthority(node)
      ) {
        throw new FixtureReconcilerError(
          `Local binding '${node.text}' in '${filePath}' shadows a reserved CommonJS identifier`,
        );
      }
      if (
        !hasLocalBinding &&
        !commonJsIdentifierUseIsAllowed(node)
      ) {
        throw new FixtureReconcilerError(
          `Bare CommonJS '${node.text}' reference in '${filePath}' is outside the deterministic source-fact grammar`,
        );
      }
    }
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      addImport(node.moduleSpecifier.text, node.moduleSpecifier.getStart(sourceFile));
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      addImport(
        node.moduleReference.expression.text,
        node.moduleReference.expression.getStart(sourceFile),
      );
    } else if (ts.isCallExpression(node)) {
      if (
        isProcessGetBuiltinModuleCallee(node.expression) &&
        (
          node.arguments.length !== 1 ||
          !ts.isStringLiteralLike(node.arguments[0]!)
        )
      ) {
        throw new FixtureReconcilerError(
          `Dynamic process.getBuiltinModule specifier in '${filePath}' cannot be reconciled deterministically`,
        );
      }
      const loaderKind = inspectModuleLoaderExpression(node.expression);
      if (
        loaderKind === "unsupported" ||
        loaderKind === "supported" && Boolean(node.questionDotToken) ||
        (
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "require"
        ) ||
        (
          ts.isPropertyAccessExpression(node.expression) &&
          inspectModuleLoaderExpression(node.expression.expression) ===
            "supported"
        )
      ) {
        throw new FixtureReconcilerError(
          `Aliased or computed CommonJS loader in '${filePath}' is outside the deterministic source-fact grammar`,
        );
      }
      if (
        loaderKind !== "supported" &&
        node.expression.kind !== ts.SyntaxKind.ImportKeyword
      ) {
        if (isCommonJsExportObject(node.arguments[0])) {
          throw new FixtureReconcilerError(
            `Call-based CommonJS export mutation in '${filePath}' is outside the deterministic source-fact grammar`,
          );
        }
        ts.forEachChild(node, visit);
        return;
      }
      if (
        node.arguments.length !== 1 ||
        !ts.isStringLiteralLike(node.arguments[0]!)
      ) {
        throw new FixtureReconcilerError(
          `Dynamic module specifier in '${filePath}' cannot be reconciled deterministically`,
        );
      }
      addImport(node.arguments[0]!.text, node.arguments[0]!.getStart(sourceFile));
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      (
        ts.isIdentifier(node.initializer) &&
        node.initializer.text === "require" ||
        inspectModuleLoaderExpression(node.initializer) !== "none"
      )
    ) {
      throw new FixtureReconcilerError(
        `Aliased CommonJS loader in '${filePath}' is outside the deterministic source-fact grammar`,
      );
    }
    if (ts.isBinaryExpression(node)) {
      const commonJsExport = commonJsExportName(node.left, filePath);
      if (commonJsExport) {
        if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
          throw new FixtureReconcilerError(
            `Compound CommonJS export mutation in '${filePath}' is outside the deterministic source-fact grammar`,
          );
        }
        appendUnique(exports, commonJsExport);
      }
    }
    const commonJsUnaryTarget =
      ts.isDeleteExpression(node)
        ? node.expression
        : ts.isPrefixUnaryExpression(node) ||
            ts.isPostfixUnaryExpression(node)
          ? node.operand
          : undefined;
    if (
      commonJsUnaryTarget &&
      commonJsExportName(commonJsUnaryTarget, filePath)
    ) {
      throw new FixtureReconcilerError(
        `Unary CommonJS export mutation in '${filePath}' is outside the deterministic source-fact grammar`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      appendUnique(exports, "default");
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause) {
        appendUnique(exports, "*");
      } else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          appendUnique(exports, element.name.text);
        }
      } else {
        appendUnique(exports, statement.exportClause.name.text);
      }
      continue;
    }
    const modifiers = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)
      : undefined;
    if (!modifiers?.some((modifier) =>
      modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      continue;
    }
    if (modifiers.some((modifier) =>
      modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      appendUnique(exports, "default");
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        appendBindingNames(exports, declaration.name);
      }
      continue;
    }
    if (ts.isImportEqualsDeclaration(statement)) {
      appendUnique(exports, statement.name.text);
      continue;
    }
    if (
      (
        ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)
      ) &&
      statement.name
    ) {
      appendUnique(exports, statement.name.text);
    }
  }

  return { imports, exports, importObservations };
}

function hasBalancedStylesheetDelimiters(sourceText: string): boolean {
  const expectedClosers: string[] = [];
  let offset = sourceText.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (offset < sourceText.length) {
    if (sourceText.startsWith("/*", offset)) {
      const close = sourceText.indexOf("*/", offset + 2);
      if (close < 0) return false;
      offset = close + 2;
      continue;
    }
    const character = sourceText[offset]!;
    if (character === "'" || character === '"') {
      const quote = character;
      offset += 1;
      let closed = false;
      while (offset < sourceText.length) {
        const stringCharacter = sourceText[offset]!;
        if (stringCharacter === "\\") {
          offset += 2;
          continue;
        }
        if (stringCharacter === quote) {
          offset += 1;
          closed = true;
          break;
        }
        offset += 1;
      }
      if (!closed) return false;
      continue;
    }
    if (character === "\\") {
      const nextOffset = skipStylesheetEscape(sourceText, offset);
      if (nextOffset < 0) return false;
      offset = nextOffset;
      continue;
    }
    const expectedCloser =
      character === "{" ? "}" :
      character === "(" ? ")" :
      character === "[" ? "]" :
      undefined;
    if (expectedCloser) {
      expectedClosers.push(expectedCloser);
      offset += 1;
      continue;
    }
    if (character === "}" || character === ")" || character === "]") {
      if (expectedClosers.pop() !== character) return false;
    }
    offset += 1;
  }
  return expectedClosers.length === 0;
}

function skipStylesheetEscape(
  sourceText: string,
  slashOffset: number,
): number {
  let offset = slashOffset + 1;
  if (offset >= sourceText.length) return -1;
  if (sourceText[offset] === "\r") {
    return sourceText[offset + 1] === "\n" ? offset + 2 : offset + 1;
  }
  if (sourceText[offset] === "\n" || sourceText[offset] === "\f") {
    return offset + 1;
  }
  let hexDigits = 0;
  while (
    offset < sourceText.length &&
    hexDigits < 6 &&
    /[0-9A-Fa-f]/u.test(sourceText[offset]!)
  ) {
    offset += 1;
    hexDigits += 1;
  }
  if (hexDigits > 0) {
    if (sourceText[offset] === "\r") {
      return sourceText[offset + 1] === "\n" ? offset + 2 : offset + 1;
    }
    if (
      sourceText[offset] === " " ||
      sourceText[offset] === "\t" ||
      sourceText[offset] === "\n" ||
      sourceText[offset] === "\f"
    ) return offset + 1;
    return offset;
  }
  const codePoint = sourceText.codePointAt(offset);
  return codePoint === undefined
    ? -1
    : offset + (codePoint > 0xffff ? 2 : 1);
}

function createBoundSourceAnalysis(
  absolutePath: string,
  sourceText: string,
  scriptKind: ts.ScriptKind,
  compilerOptions: ts.CompilerOptions,
): {
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
} {
  const analysisOptions: ts.CompilerOptions = {
    ...compilerOptions,
    noLib: true,
    noResolve: true,
    types: [],
  };
  const sourceFile = ts.createSourceFile(
    absolutePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const defaultHost = ts.createCompilerHost(analysisOptions, true);
  const normalizedPath = resolve(absolutePath);
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists: (fileName) => resolve(fileName) === normalizedPath,
    getSourceFile: (fileName) =>
      resolve(fileName) === normalizedPath ? sourceFile : undefined,
    readFile: (fileName) =>
      resolve(fileName) === normalizedPath ? sourceText : undefined,
  };
  const program = ts.createProgram({
    rootNames: [absolutePath],
    options: analysisOptions,
    host,
  });
  return {
    sourceFile: program.getSourceFile(absolutePath) ?? sourceFile,
    checker: program.getTypeChecker(),
  };
}

function identifierHasSourceLocalBinding(
  node: ts.Identifier,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
): boolean {
  const symbol = checker.getSymbolAtLocation(node);
  return symbol?.declarations?.some((declaration) =>
    declaration.getSourceFile() === sourceFile &&
    declarationIntroducesRuntimeBinding(declaration) &&
    !declarationIsUninitializedCommonJsRedeclaration(
      declaration,
      node.text,
    )) ?? false;
}

function declarationIntroducesRuntimeBinding(
  declaration: ts.Declaration,
): boolean {
  if (
    declaration.getSourceFile().isDeclarationFile ||
    (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Ambient) !== 0
  ) return false;
  if (
    ts.isInterfaceDeclaration(declaration) ||
    ts.isTypeAliasDeclaration(declaration) ||
    ts.isTypeParameterDeclaration(declaration)
  ) return false;
  if (
    ts.isImportClause(declaration) &&
    declaration.isTypeOnly
  ) return false;
  if (
    ts.isImportSpecifier(declaration) &&
    (
      declaration.isTypeOnly ||
      declaration.parent.parent.isTypeOnly
    )
  ) return false;
  if (
    ts.isNamespaceImport(declaration) &&
    declaration.parent.isTypeOnly
  ) return false;
  return (
    ts.isVariableDeclaration(declaration) ||
    ts.isParameter(declaration) ||
    ts.isBindingElement(declaration) ||
    ts.isFunctionDeclaration(declaration) ||
    ts.isFunctionExpression(declaration) ||
    ts.isClassDeclaration(declaration) ||
    ts.isClassExpression(declaration) ||
    ts.isEnumDeclaration(declaration) ||
    ts.isModuleDeclaration(declaration) ||
    ts.isImportClause(declaration) ||
    ts.isNamespaceImport(declaration) ||
    ts.isImportSpecifier(declaration) ||
    ts.isImportEqualsDeclaration(declaration)
  );
}

function declarationIsUninitializedCommonJsRedeclaration(
  declaration: ts.Declaration,
  identifierName: string,
): boolean {
  if (
    !["exports", "module", "require"].includes(identifierName) ||
    !ts.isVariableDeclaration(declaration) ||
    declaration.initializer ||
    !ts.isVariableDeclarationList(declaration.parent) ||
    (declaration.parent.flags & ts.NodeFlags.BlockScoped) !== 0
  ) return false;
  let scope: ts.Node | undefined = declaration.parent.parent;
  while (
    scope &&
    !ts.isSourceFile(scope) &&
    !ts.isFunctionLike(scope)
  ) scope = scope.parent;
  return Boolean(scope && ts.isSourceFile(scope));
}

function collectAuthorityRootBindings(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): AuthorityRootBindings {
  const bindings: AuthorityRootBindings = {
    globalObjectAliases: new Set(),
    processAliases: new Set(),
  };
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node): void => {
      if (
        (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        const rootKind = authorityRootKind(
          node.initializer,
          checker,
          sourceFile,
          bindings,
        );
        const symbol = rootKind
          ? checker.getSymbolAtLocation(node.name)
          : undefined;
        if (rootKind && symbol) {
          const target = rootKind === "global-object"
            ? bindings.globalObjectAliases
            : bindings.processAliases;
          if (!target.has(symbol)) {
            target.add(symbol);
            changed = true;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return bindings;
}

function authorityRootKind(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  bindings: AuthorityRootBindings,
): AuthorityRootKind | undefined {
  const unwrapped = unwrapTransparentExpression(expression);
  if (!ts.isIdentifier(unwrapped)) return undefined;
  if (
    [
      "frames",
      "global",
      "globalThis",
      "opener",
      "parent",
      "self",
      "top",
      "window",
    ].includes(unwrapped.text) &&
    !identifierHasSourceLocalBinding(unwrapped, checker, sourceFile)
  ) return "global-object";
  if (
    unwrapped.text === "process" &&
    !identifierHasSourceLocalBinding(unwrapped, checker, sourceFile)
  ) return "process";
  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (!symbol) return undefined;
  if (bindings.globalObjectAliases.has(symbol)) return "global-object";
  if (bindings.processAliases.has(symbol)) return "process";
  return undefined;
}

function sourceUsesNodeModule(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier) &&
      isNodeModuleSpecifier(node.moduleSpecifier.text)
    ) {
      found = true;
      return;
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression) &&
      isNodeModuleSpecifier(node.moduleReference.expression.text)
    ) {
      found = true;
      return;
    }
    if (ts.isCallExpression(node) && isNodeModuleAcquisitionCall(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function collectNodeModuleNamespaceBindings(
  sourceFile: ts.SourceFile,
): NodeModuleBindings {
  const bindings: NodeModuleBindings = {
    namespaceBindings: new Set<string>(),
    createRequireBindings: new Set<string>(),
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause &&
      ts.isStringLiteralLike(node.moduleSpecifier) &&
      isNodeModuleSpecifier(node.moduleSpecifier.text)
    ) {
      if (node.importClause.name) {
        bindings.namespaceBindings.add(node.importClause.name.text);
      }
      const namedBindings = node.importClause.namedBindings;
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        bindings.namespaceBindings.add(namedBindings.name.text);
      } else if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = element.propertyName?.text ??
            element.name.text;
          if (importedName === "createRequire") {
            bindings.createRequireBindings.add(element.name.text);
          }
        }
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression) &&
      isNodeModuleSpecifier(node.moduleReference.expression.text)
    ) {
      bindings.namespaceBindings.add(node.name.text);
    } else if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(unwrapTransparentExpression(node.initializer)) &&
      isNodeModuleAcquisitionCall(
        unwrapTransparentExpression(node.initializer) as ts.CallExpression,
      )
    ) {
      if (ts.isIdentifier(node.name)) {
        bindings.namespaceBindings.add(node.name.text);
      } else {
        for (const element of node.name.elements) {
          if (ts.isOmittedExpression(element)) continue;
          const propertyName = bindingElementPropertyName(element);
          if (
            propertyName !== undefined &&
            propertyName !== "createRequire"
          ) continue;
          const localNames: string[] = [];
          appendBindingNames(localNames, element.name);
          for (const localName of localNames) {
            bindings.createRequireBindings.add(localName);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function isCreateRequireReference(
  node: ts.Node,
  bindings: NodeModuleBindings,
): boolean {
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    isNodeModuleLoaderCall(node)
  ) return true;
  if (ts.isIdentifier(node)) {
    if (bindings.createRequireBindings.has(node.text)) return true;
    if (!bindings.namespaceBindings.has(node.text)) return false;
    const parent = node.parent;
    if (
      ts.isImportClause(parent) && parent.name === node ||
      ts.isNamespaceImport(parent) && parent.name === node ||
      ts.isImportEqualsDeclaration(parent) && parent.name === node ||
      ts.isVariableDeclaration(parent) && parent.name === node
    ) return false;
    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === node
    ) {
      return parent.name.text === "createRequire";
    }
    if (
      ts.isElementAccessExpression(parent) &&
      parent.expression === node
    ) {
      const propertyName = staticElementAccessName(parent);
      return propertyName === undefined || propertyName === "createRequire";
    }
    return true;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return (
      node.name.text === "createRequire" &&
      isNodeModuleNamespaceExpression(
        node.expression,
        bindings.namespaceBindings,
      )
    );
  }
  if (ts.isElementAccessExpression(node)) {
    const propertyName = staticElementAccessName(node);
    const namespaceExpression = isNodeModuleNamespaceExpression(
      node.expression,
      bindings.namespaceBindings,
    );
    return (
      namespaceExpression &&
      (propertyName === undefined || propertyName === "createRequire")
    );
  }
  return false;
}

function isNodeModuleNamespaceExpression(
  expression: ts.Expression,
  namespaceBindings: ReadonlySet<string>,
): boolean {
  const unwrapped = unwrapTransparentExpression(expression);
  return (
    ts.isIdentifier(unwrapped) &&
      namespaceBindings.has(unwrapped.text) ||
    ts.isCallExpression(unwrapped) &&
      isNodeModuleAcquisitionCall(unwrapped)
  );
}

function isNodeModuleAcquisitionCall(node: ts.CallExpression): boolean {
  return (
    isNodeModuleLoaderCall(node) ||
    isProcessGetBuiltinModuleCall(node)
  );
}

function isNodeModuleLoaderCall(node: ts.CallExpression): boolean {
  if (
    node.arguments.length !== 1 ||
    !ts.isStringLiteralLike(node.arguments[0]!) ||
    !isNodeModuleSpecifier(node.arguments[0]!.text)
  ) return false;
  return (
    node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    inspectModuleLoaderExpression(node.expression) === "supported"
  );
}

function isProcessGetBuiltinModuleCall(node: ts.CallExpression): boolean {
  return (
    isProcessGetBuiltinModuleCallee(node.expression) &&
    node.arguments.length === 1 &&
    ts.isStringLiteralLike(node.arguments[0]!) &&
    isNodeModuleSpecifier(node.arguments[0]!.text)
  );
}

function isProcessGetBuiltinModuleCallee(
  expression: ts.Expression,
): boolean {
  const unwrapped = unwrapTransparentExpression(expression);
  if (
    ts.isPropertyAccessExpression(unwrapped) &&
    ts.isIdentifier(unwrapped.expression) &&
    unwrapped.expression.text === "process"
  ) return unwrapped.name.text === "getBuiltinModule";
  return (
    ts.isElementAccessExpression(unwrapped) &&
    ts.isIdentifier(unwrapped.expression) &&
    unwrapped.expression.text === "process" &&
    staticElementAccessName(unwrapped) === "getBuiltinModule"
  );
}

function isNodeModuleSpecifier(specifier: string): boolean {
  return specifier === "module" || specifier === "node:module";
}

function bindingElementPropertyName(
  element: ts.BindingElement,
): string | undefined {
  if (!element.propertyName) {
    return ts.isIdentifier(element.name) ? element.name.text : undefined;
  }
  if (
    ts.isIdentifier(element.propertyName) ||
    ts.isStringLiteralLike(element.propertyName) ||
    ts.isNumericLiteral(element.propertyName)
  ) return element.propertyName.text;
  if (
    ts.isComputedPropertyName(element.propertyName) &&
    ts.isStringLiteralLike(element.propertyName.expression)
  ) return element.propertyName.expression.text;
  return undefined;
}

function isConfiguredLocalSpecifier(
  specifier: string,
  compilerOptions: ts.CompilerOptions,
): boolean {
  if (specifier.startsWith(".") || specifier.startsWith("@/")) return true;
  return Object.keys(compilerOptions.paths ?? {}).some((pattern) =>
    moduleSpecifierMatchesPattern(specifier, pattern));
}

function moduleSpecifierMatchesPattern(
  specifier: string,
  pattern: string,
): boolean {
  const wildcardIndex = pattern.indexOf("*");
  if (wildcardIndex < 0) return specifier === pattern;
  return specifier.startsWith(pattern.slice(0, wildcardIndex)) &&
    specifier.endsWith(pattern.slice(wildcardIndex + 1));
}

function inspectModuleLoaderExpression(
  expression: ts.Expression,
): "supported" | "unsupported" | "none" {
  const unwrapped = unwrapTransparentExpression(expression);
  if (unwrapped !== expression) {
    return inspectModuleLoaderExpression(unwrapped) === "none"
      ? "none"
      : "unsupported";
  }
  if (ts.isIdentifier(expression)) {
    return expression.text === "require" ? "supported" : "none";
  }
  if (ts.isPropertyAccessExpression(expression)) {
    if (
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === "module"
    ) {
      return expression.name.text === "require"
        ? expression.questionDotToken ? "unsupported" : "supported"
        : "none";
    }
    if (expression.name.text === "require") return "unsupported";
    return ts.isIdentifier(expression.expression) &&
        expression.expression.text === "require"
      ? "unsupported"
      : "none";
  }
  if (ts.isElementAccessExpression(expression)) {
    if (
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === "module"
    ) {
      const propertyName = staticElementAccessName(expression);
      return propertyName === "require" && !expression.questionDotToken
        ? "supported"
        : "unsupported";
    }
    if (
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === "require"
    ) return "unsupported";
    if (staticElementAccessName(expression) === "require") {
      return "unsupported";
    }
  }
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.CommaToken
  ) {
    const left = inspectModuleLoaderExpression(expression.left);
    const right = inspectModuleLoaderExpression(expression.right);
    return left === "none" && right === "none" ? "none" : "unsupported";
  }
  return "none";
}

function unwrapTransparentExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isPartiallyEmittedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isDynamicEvaluatorReference(
  node: ts.Node,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  bindings: AuthorityRootBindings,
): boolean {
  if (
    ts.isIdentifier(node) &&
    (node.text === "eval" || node.text === "Function") &&
    !identifierIsNonValueName(node) &&
    !identifierHasSourceLocalBinding(node, checker, sourceFile)
  ) return true;

  if (
    (ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) &&
    authorityRootKind(
      node.expression,
      checker,
      sourceFile,
      bindings,
    ) === "global-object"
  ) {
    const propertyName = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : staticElementAccessName(node);
    return (
      propertyName === undefined ||
      propertyName === "eval" ||
      propertyName === "Function"
    );
  }

  if (
    (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
    ts.isObjectBindingPattern(node.name) &&
    node.initializer &&
    authorityRootKind(
      node.initializer,
      checker,
      sourceFile,
      bindings,
    ) === "global-object"
  ) {
    return bindingPatternSelectsDynamicEvaluator(node.name);
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    authorityRootKind(
      node.right,
      checker,
      sourceFile,
      bindings,
    ) === "global-object"
  ) {
    return assignmentTargetSelectsDynamicEvaluator(node.left);
  }

  return false;
}

function bindingPatternSelectsDynamicEvaluator(
  pattern: ts.ObjectBindingPattern,
): boolean {
  return pattern.elements.some((element) => {
    if (element.dotDotDotToken) return true;
    const propertyName = bindingElementPropertyName(element);
    return (
      propertyName === undefined ||
      propertyName === "eval" ||
      propertyName === "Function"
    );
  });
}

function assignmentTargetSelectsDynamicEvaluator(
  expression: ts.Expression,
): boolean {
  const unwrapped = unwrapTransparentExpression(expression);
  if (!ts.isObjectLiteralExpression(unwrapped)) return false;
  return unwrapped.properties.some((property) => {
    if (ts.isSpreadAssignment(property)) return true;
    if (ts.isShorthandPropertyAssignment(property)) {
      return property.name.text === "eval" ||
        property.name.text === "Function";
    }
    if (!ts.isPropertyAssignment(property)) return false;
    if (ts.isComputedPropertyName(property.name)) {
      return !ts.isStringLiteralLike(property.name.expression) ||
        property.name.expression.text === "eval" ||
        property.name.expression.text === "Function";
    }
    return (
      (ts.isIdentifier(property.name) ||
        ts.isStringLiteralLike(property.name)) &&
      (property.name.text === "eval" || property.name.text === "Function")
    );
  });
}

function isProcessGetBuiltinModuleReference(
  node: ts.Node,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  bindings: AuthorityRootBindings,
): boolean {
  if (
    !ts.isPropertyAccessExpression(node) &&
    !ts.isElementAccessExpression(node)
  ) return false;
  if (
    authorityRootKind(
      node.expression,
      checker,
      sourceFile,
      bindings,
    ) !== "process"
  ) return false;
  const unwrappedBase = unwrapTransparentExpression(node.expression);
  const isDirectUnshadowedProcess = (
    ts.isIdentifier(unwrappedBase) &&
    unwrappedBase.text === "process" &&
    !identifierHasSourceLocalBinding(
      unwrappedBase,
      checker,
      sourceFile,
    )
  );

  const propertyName = ts.isPropertyAccessExpression(node)
    ? node.name.text
    : staticElementAccessName(node);
  if (propertyName !== undefined && propertyName !== "getBuiltinModule") {
    return false;
  }
  if (
    propertyName === undefined ||
    node.questionDotToken ||
    !isDirectUnshadowedProcess
  ) return true;

  const parent = node.parent;
  return !(
    ts.isCallExpression(parent) &&
    parent.expression === node &&
    !parent.questionDotToken
  );
}

function authorityRootBridgeKind(
  node: ts.Node,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  bindings: AuthorityRootBindings,
): AuthorityRootKind | undefined {
  if (
    !ts.isPropertyAccessExpression(node) &&
    !ts.isElementAccessExpression(node)
  ) return undefined;
  if (
    authorityRootKind(
      node.expression,
      checker,
      sourceFile,
      bindings,
    ) !== "global-object"
  ) return undefined;
  const propertyName = ts.isPropertyAccessExpression(node)
    ? node.name.text
    : staticElementAccessName(node);
  if (propertyName === "process") return "process";
  return (
    propertyName === "global" ||
    propertyName === "globalThis" ||
    propertyName === "window" ||
    propertyName === "self" ||
    propertyName === "frames" ||
    propertyName === "parent" ||
    propertyName === "top" ||
    propertyName === "opener"
  )
    ? "global-object"
    : undefined;
}

function unsafeAuthorityRootReferenceKind(
  node: ts.Node,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  bindings: AuthorityRootBindings,
): AuthorityRootKind | undefined {
  if (!ts.isIdentifier(node) || identifierIsBindingDeclarationName(node)) {
    return undefined;
  }
  const rootKind = authorityRootKind(
    node,
    checker,
    sourceFile,
    bindings,
  );
  if (!rootKind) return undefined;

  const expression = ascendTransparentExpression(node);
  const parent = expression.parent;
  if (
    (
      ts.isPropertyAccessExpression(parent) ||
      ts.isElementAccessExpression(parent)
    ) &&
    parent.expression === expression
  ) return undefined;
  if (ts.isTypeOfExpression(parent)) return undefined;

  if (
    (ts.isVariableDeclaration(parent) || ts.isParameter(parent)) &&
    parent.initializer === expression
  ) {
    if (ts.isIdentifier(parent.name)) {
      const targetSymbol = checker.getSymbolAtLocation(parent.name);
      const aliases = rootKind === "global-object"
        ? bindings.globalObjectAliases
        : bindings.processAliases;
      return targetSymbol && aliases.has(targetSymbol)
        ? undefined
        : rootKind;
    }
    if (ts.isObjectBindingPattern(parent.name)) {
      return rootKind;
    }
  }

  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    parent.right === expression
  ) {
    const target = unwrapTransparentExpression(parent.left);
    if (ts.isObjectLiteralExpression(target)) {
      return rootKind;
    }
  }

  return rootKind;
}

function ascendTransparentExpression(
  expression: ts.Expression,
): ts.Expression {
  let current = expression;
  while (
    (
      ts.isParenthesizedExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isTypeAssertionExpression(current.parent) ||
      ts.isNonNullExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent) ||
      ts.isPartiallyEmittedExpression(current.parent)
    ) &&
    current.parent.expression === current
  ) current = current.parent;
  return current;
}

function identifierIsBindingDeclarationName(
  node: ts.Identifier,
): boolean {
  const parent = node.parent;
  return (
    (
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isClassExpression(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isModuleDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent) ||
      ts.isImportClause(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isImportEqualsDeclaration(parent)
    ) &&
    parent.name === node
  );
}

function shadowedCommonJsBindingUsedAsAuthority(
  node: ts.Identifier,
): boolean {
  let expression: ts.Expression = node;
  while (
    (
      ts.isParenthesizedExpression(expression.parent) ||
      ts.isAsExpression(expression.parent) ||
      ts.isTypeAssertionExpression(expression.parent) ||
      ts.isNonNullExpression(expression.parent) ||
      ts.isSatisfiesExpression(expression.parent) ||
      ts.isPartiallyEmittedExpression(expression.parent)
    ) &&
    expression.parent.expression === expression
  ) {
    expression = expression.parent;
  }
  const parent = expression.parent;
  if (node.text === "require") {
    return (
      ts.isCallExpression(parent) && parent.expression === expression ||
      ts.isPropertyAccessExpression(parent) &&
        parent.expression === expression ||
      ts.isElementAccessExpression(parent) &&
        parent.expression === expression ||
      ts.isVariableDeclaration(parent) &&
        parent.initializer === expression
    );
  }
  if (node.text === "module") {
    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === expression
    ) {
      return (
        parent.name.text === "exports" ||
        parent.name.text === "require"
      );
    }
    if (
      ts.isElementAccessExpression(parent) &&
      parent.expression === expression
    ) {
      const propertyName = staticElementAccessName(parent);
      return (
        propertyName === undefined ||
        propertyName === "exports" ||
        propertyName === "require"
      );
    }
    return false;
  }
  return (
    ts.isPropertyAccessExpression(parent) &&
      parent.expression === expression ||
    ts.isElementAccessExpression(parent) &&
      parent.expression === expression ||
    ts.isCallExpression(parent) &&
      parent.arguments[0] === expression ||
    ts.isVariableDeclaration(parent) &&
      parent.initializer === expression ||
    ts.isBinaryExpression(parent) &&
      parent.left === expression
  );
}

function commonJsIdentifierUseIsAllowed(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (identifierIsNonValueName(node)) return true;
  if (
    ts.isCallExpression(parent) &&
    parent.expression === node &&
    node.text === "require" &&
    !parent.questionDotToken
  ) return true;
  if (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node
  ) {
    if (node.text === "module") {
      return (
        !parent.questionDotToken &&
        (parent.name.text === "exports" || parent.name.text === "require")
      );
    }
    return node.text === "exports";
  }
  if (
    ts.isElementAccessExpression(parent) &&
    parent.expression === node
  ) {
    if (node.text === "module") {
      const propertyName = staticElementAccessName(parent);
      return (
        !parent.questionDotToken &&
        (propertyName === "exports" || propertyName === "require")
      );
    }
    return node.text === "exports";
  }
  return false;
}

function identifierIsNonValueName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    ts.isPropertyAccessExpression(parent) && parent.name === node ||
    ts.isPropertyAssignment(parent) && parent.name === node ||
    ts.isMethodDeclaration(parent) && parent.name === node ||
    ts.isPropertyDeclaration(parent) && parent.name === node ||
    ts.isGetAccessorDeclaration(parent) && parent.name === node ||
    ts.isSetAccessorDeclaration(parent) && parent.name === node ||
    ts.isMethodSignature(parent) && parent.name === node ||
    ts.isPropertySignature(parent) && parent.name === node ||
    ts.isEnumMember(parent) && parent.name === node ||
    ts.isBindingElement(parent) && parent.propertyName === node ||
    ts.isImportSpecifier(parent) && parent.propertyName === node ||
    ts.isExportSpecifier(parent) &&
      parent.name === node &&
      parent.propertyName !== undefined ||
    ts.isQualifiedName(parent) && parent.right === node ||
    ts.isLabeledStatement(parent) && parent.label === node ||
    ts.isBreakStatement(parent) && parent.label === node ||
    ts.isContinueStatement(parent) && parent.label === node
  );
}

function commonJsExportName(
  node: ts.Expression,
  filePath: string,
): string | undefined {
  const unwrapped = unwrapTransparentExpression(node);
  if (unwrapped !== node) {
    if (commonJsExportName(unwrapped, filePath)) {
      throw new FixtureReconcilerError(
        `Wrapped CommonJS export in '${filePath}' is outside the deterministic source-fact grammar`,
      );
    }
    return undefined;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const unwrappedBase = unwrapTransparentExpression(node.expression);
    if (
      unwrappedBase !== node.expression &&
      isCommonJsExportObject(unwrappedBase)
    ) {
      throw new FixtureReconcilerError(
        `Wrapped CommonJS export in '${filePath}' is outside the deterministic source-fact grammar`,
      );
    }
    if (
      ts.isIdentifier(node.expression) &&
      node.expression.text === "module" &&
      node.name.text === "exports"
    ) return "default";
    if (
      ts.isIdentifier(node.expression) &&
      node.expression.text === "exports"
    ) return node.name.text;
    if (isCommonJsExportObject(node.expression)) return node.name.text;
    return undefined;
  }
  if (ts.isElementAccessExpression(node)) {
    const unwrappedBase = unwrapTransparentExpression(node.expression);
    if (
      unwrappedBase !== node.expression &&
      isCommonJsExportObject(unwrappedBase)
    ) {
      throw new FixtureReconcilerError(
        `Wrapped CommonJS export in '${filePath}' is outside the deterministic source-fact grammar`,
      );
    }
    if (
      ts.isIdentifier(node.expression) &&
      node.expression.text === "module"
    ) {
      const propertyName = staticElementAccessName(node);
      if (propertyName === "exports") return "default";
      if (propertyName === undefined) {
        throw new FixtureReconcilerError(
          `Computed CommonJS export in '${filePath}' is outside the deterministic source-fact grammar`,
        );
      }
      return undefined;
    }
    if (
      ts.isIdentifier(node.expression) &&
      node.expression.text === "exports" ||
      isCommonJsExportObject(node.expression)
    ) {
      const propertyName = staticElementAccessName(node);
      if (propertyName === undefined) {
        throw new FixtureReconcilerError(
          `Computed CommonJS export in '${filePath}' is outside the deterministic source-fact grammar`,
        );
      }
      return propertyName;
    }
  }
  return undefined;
}

function isCommonJsExportObject(
  expression: ts.Expression | undefined,
): boolean {
  if (!expression) return false;
  const unwrapped = unwrapTransparentExpression(expression);
  if (ts.isIdentifier(unwrapped) && unwrapped.text === "exports") {
    return true;
  }
  if (
    ts.isPropertyAccessExpression(unwrapped) &&
    ts.isIdentifier(unwrapped.expression) &&
    unwrapped.expression.text === "module" &&
    unwrapped.name.text === "exports"
  ) return true;
  return ts.isElementAccessExpression(unwrapped) &&
    ts.isIdentifier(unwrapped.expression) &&
    unwrapped.expression.text === "module" &&
    staticElementAccessName(unwrapped) === "exports";
}

function staticElementAccessName(
  expression: ts.ElementAccessExpression,
): string | undefined {
  const argument = expression.argumentExpression;
  if (ts.isStringLiteralLike(argument)) return argument.text;
  if (ts.isNumericLiteral(argument)) return argument.text;
  return undefined;
}

function resolveLocalModule(
  workspaceRoot: string,
  containingFile: string,
  specifier: string,
  compilerOptions: ts.CompilerOptions,
): string | undefined {
  const resolvedModule = ts.resolveModuleName(
    specifier,
    containingFile,
    compilerOptions,
    ts.sys,
  ).resolvedModule;
  if (resolvedModule) {
    const normalized = workspaceRelativePath(
      workspaceRoot,
      resolvedModule.resolvedFileName,
    );
    if (
      normalized &&
      !normalized.startsWith("node_modules/") &&
      !normalized.includes("/node_modules/") &&
      !normalized.endsWith(".d.ts") &&
      !normalized.endsWith(".d.mts") &&
      !normalized.endsWith(".d.cts")
    ) {
      return normalized;
    }
  }

  const unresolvedBase = specifier.startsWith("@/")
    ? resolve(workspaceRoot, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(containingFile), specifier)
      : undefined;
  if (!unresolvedBase) return undefined;

  const candidates = [
    unresolvedBase,
    ...MODULE_FILE_EXTENSIONS.map((extension) =>
      `${unresolvedBase}${extension}`),
    ...MODULE_FILE_EXTENSIONS.map((extension) =>
      join(unresolvedBase, `index${extension}`)),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate) || !lstatSync(candidate).isFile()) continue;
    const normalized = workspaceRelativePath(workspaceRoot, candidate);
    if (normalized) return normalized;
  }
  return undefined;
}

function workspaceRelativePath(
  workspaceRoot: string,
  absolutePath: string,
): string | undefined {
  const normalizedRoot = resolve(workspaceRoot);
  const normalizedPath = resolve(absolutePath);
  if (
    normalizedPath !== normalizedRoot &&
    !normalizedPath.startsWith(`${normalizedRoot}${sep}`)
  ) return undefined;
  return normalizePath(relative(normalizedRoot, normalizedPath));
}

function scriptKindForPath(filePath: string): ts.ScriptKind {
  switch (extname(filePath)) {
    case ".js":
    case ".cjs":
    case ".mjs":
      return ts.ScriptKind.JS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".json":
      return ts.ScriptKind.JSON;
    default:
      return ts.ScriptKind.TS;
  }
}

function appendBindingNames(target: string[], name: ts.BindingName): void {
  if (ts.isIdentifier(name)) {
    appendUnique(target, name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) appendBindingNames(target, element.name);
  }
}

function inferFileEntryType(filePath: string): FileEntryType {
  if (/^app\/api\/(?:.+\/)?route\.[cm]?[jt]sx?$/u.test(filePath)) return "api";
  if (/^app\/(?:.+\/)?page\.[cm]?[jt]sx?$/u.test(filePath)) return "page";
  if (/\.(?:css|less|sass|scss|styl|stylus)$/u.test(filePath)) return "style";
  if (filePath.startsWith("components/")) return "component";
  if (filePath.startsWith("lib/")) return "lib";
  if (/(?:^|\/)(?:__tests__\/.*|[^/]+\.(?:spec|test))\.[cm]?[jt]sx?$/u.test(filePath)) {
    return "test";
  }
  if (
    filePath === ".babelrc" ||
    filePath === "package.json" ||
    filePath === "tsconfig.json" ||
    filePath.endsWith(".toml") ||
    filePath.endsWith(".sql") ||
    filePath.endsWith(".prisma") ||
    /(?:^|\/)[^/]+\.config\.[cm]?[jt]s$/u.test(filePath)
  ) return "config";
  return "other";
}

function inferSemanticTreeKind(filePath: string): SemanticTreeNodeKind {
  if (/^app\/api\/(?:.+\/)?route\.[cm]?[jt]sx?$/u.test(filePath)) return "api";
  if (/^app\/(?:.+\/)?page\.[cm]?[jt]sx?$/u.test(filePath)) return "route";
  if (inferFileEntryType(filePath) === "test") return "test";
  if (inferFileEntryType(filePath) === "config") return "config";
  return "file";
}

function semanticLeafId(filePath: string): string {
  const slug = filePath
    .replace(/[^A-Za-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toLowerCase()
    .slice(0, 56);
  const digest = createHash("sha256")
    .update(filePath, "utf8")
    .digest("hex")
    .slice(0, 10);
  return `tree_file_${slug || "root"}_${digest}`;
}

function validateFixturePath(filePath: string): string {
  if (
    !filePath ||
    isAbsolute(filePath) ||
    filePath.includes("\\") ||
    filePath.includes("\0")
  ) {
    throw new FixtureReconcilerError(
      `Fixture path '${filePath}' must be a non-empty relative POSIX path`,
    );
  }
  const normalized = posix.normalize(filePath);
  if (
    normalized !== filePath ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new FixtureReconcilerError(
      `Fixture path '${filePath}' is not normalized inside the workspace`,
    );
  }
  return normalized;
}

function resolveWorkspaceFile(workspaceRoot: string, filePath: string): string {
  const normalizedPath = validateFixturePath(filePath);
  const normalizedRoot = resolve(workspaceRoot);
  const absolutePath = resolve(normalizedRoot, normalizedPath);
  if (!absolutePath.startsWith(`${normalizedRoot}${sep}`)) {
    throw new FixtureReconcilerError(
      `Fixture path '${filePath}' escapes the workspace`,
    );
  }
  return absolutePath;
}

function writeFileAtomically(
  targetPath: string,
  bytes: Uint8Array,
  parentIdentity: FileSystemIdentity,
  onRenamed?: (installedIdentity: FileSystemIdentity) => void,
  onVerified?: (installedIdentity: FileSystemIdentity) => void,
  afterRenameBeforeVerification?: () => void,
): void {
  const parentPath = dirname(targetPath);
  assertDirectoryIdentity(
    parentPath,
    parentIdentity,
    "Mirror write parent",
  );
  const temporaryPath = join(
    parentPath,
    `.${basename(targetPath)}.projectos-sync-${process.pid}-${randomUUID()}`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o644);
    writeFileSync(descriptor, bytes);
    closeSync(descriptor);
    descriptor = undefined;
    assertDirectoryIdentity(
      parentPath,
      parentIdentity,
      "Mirror write parent",
    );
    const temporaryIdentity = requireRegularSingleLinkFile(
      temporaryPath,
      "Temporary mirror target",
    );
    renameSync(temporaryPath, targetPath);
    const renamedIdentity: FileSystemIdentity = {
      dev: temporaryIdentity.dev,
      ino: temporaryIdentity.ino,
    };
    onRenamed?.(renamedIdentity);
    afterRenameBeforeVerification?.();
    const installedIdentity = requireRegularSingleLinkFile(
      targetPath,
      "Installed mirror target",
    );
    if (!sameFileSystemIdentity(renamedIdentity, installedIdentity)) {
      throw new FixtureReconcilerError(
        `Installed mirror target '${targetPath}' does not retain the renamed temporary file identity`,
      );
    }
    onVerified?.(installedIdentity);
    assertDirectoryIdentity(
      parentPath,
      parentIdentity,
      "Mirror write parent",
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function assertTargetMatchesPreflight(
  operation: MirrorSyncOperation,
): void {
  if (!operation.targetIdentity || !operation.targetBytes) {
    if (existsSync(operation.targetPath)) {
      throw new FixtureReconcilerError(
        `Mirror target '${operation.targetPath}' appeared after sync preflight`,
      );
    }
    return;
  }
  if (!existsSync(operation.targetPath)) {
    throw new FixtureReconcilerError(
      `Mirror target '${operation.targetPath}' disappeared after sync preflight`,
    );
  }
  const beforeIdentity = requireRegularSingleLinkFile(
    operation.targetPath,
    "Mirror target",
  );
  if (
    !sameFileSystemIdentity(beforeIdentity, operation.targetIdentity)
  ) {
    throw new FixtureReconcilerError(
      `Mirror target '${operation.targetPath}' changed identity after sync preflight`,
    );
  }
  const currentBytes = readFileSync(operation.targetPath, {
    encoding: null,
  });
  const afterIdentity = requireRegularSingleLinkFile(
    operation.targetPath,
    "Mirror target",
  );
  if (
    !sameFileSystemIdentity(beforeIdentity, afterIdentity) ||
    !bytesEqual(currentBytes, operation.targetBytes)
  ) {
    throw new FixtureReconcilerError(
      `Mirror target '${operation.targetPath}' changed after sync preflight`,
    );
  }
}

function assertSafeMirrorRoot(
  projectOSRoot: string,
  mirrorRoot: string,
): void {
  const normalizedProjectOSRoot = resolve(projectOSRoot);
  const normalizedMirrorRoot = resolve(mirrorRoot);
  if (
    normalizedMirrorRoot === normalizedProjectOSRoot ||
    !normalizedMirrorRoot.startsWith(`${normalizedProjectOSRoot}${sep}`)
  ) {
    throw new FixtureReconcilerError(
      `Mirror root '${mirrorRoot}' must be a child of the projectos package`,
    );
  }

  assertContainedNonSymlinkPath(
    normalizedProjectOSRoot,
    normalizedMirrorRoot,
    true,
    "Mirror root",
  );
  if (existsSync(normalizedMirrorRoot)) {
    requireCanonicalDirectory(normalizedMirrorRoot, "Mirror root");
  }
}

function assertMirrorTargetDisjointFromAuthority(
  layout: FixtureLayout,
  targetPath: string,
): void {
  const authoritativeRoot = resolve(layout.authoritativeRoot);
  const normalizedTarget = resolve(targetPath);
  if (
    normalizedTarget === authoritativeRoot ||
    normalizedTarget.startsWith(`${authoritativeRoot}${sep}`)
  ) {
    throw new FixtureReconcilerError(
      `Mirror target '${targetPath}' may not overlap the authoritative fixture root`,
    );
  }
}

function assertContainedNonSymlinkPath(
  rootPath: string,
  targetPath: string,
  allowMissing: boolean,
  description: string,
): void {
  const normalizedRoot = resolve(rootPath);
  const normalizedTarget = resolve(targetPath);
  if (
    normalizedTarget !== normalizedRoot &&
    !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)
  ) {
    throw new FixtureReconcilerError(
      `${description} '${targetPath}' must stay inside '${rootPath}'`,
    );
  }
  if (!existsSync(normalizedRoot)) {
    throw new FixtureReconcilerError(
      `${description} root '${rootPath}' does not exist`,
    );
  }
  const rootStatus = lstatSync(normalizedRoot);
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
    throw new FixtureReconcilerError(
      `${description} root '${rootPath}' must be a regular non-symlink directory`,
    );
  }
  if (realpathSync(normalizedRoot) !== normalizedRoot) {
    throw new FixtureReconcilerError(
      `${description} root '${rootPath}' may not traverse a symbolic-link ancestor`,
    );
  }

  const relativeTarget = relative(normalizedRoot, normalizedTarget);
  let current = normalizedRoot;
  const segments = relativeTarget ? relativeTarget.split(sep) : [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    current = join(current, segment);
    if (!existsSync(current)) {
      if (allowMissing) return;
      throw new FixtureReconcilerError(
        `${description} '${targetPath}' does not exist`,
      );
    }
    const status = lstatSync(current);
    if (status.isSymbolicLink()) {
      throw new FixtureReconcilerError(
        `${description} '${current}' may not traverse a symbolic link`,
      );
    }
    if (realpathSync(current) !== current) {
      throw new FixtureReconcilerError(
        `${description} '${current}' may not traverse a symbolic-link ancestor`,
      );
    }
    if (index < segments.length - 1 && !status.isDirectory()) {
      throw new FixtureReconcilerError(
        `${description} '${current}' must be a directory`,
      );
    }
  }
}

function requireCanonicalDirectory(
  directoryPath: string,
  description: string,
): FileSystemIdentity {
  const normalizedPath = resolve(directoryPath);
  const status = lstatSync(normalizedPath, { bigint: true });
  if (
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    realpathSync(normalizedPath) !== normalizedPath
  ) {
    throw new FixtureReconcilerError(
      `${description} '${directoryPath}' must be a canonical non-symlink directory`,
    );
  }
  return { dev: status.dev, ino: status.ino };
}

function requireRegularSingleLinkFile(
  filePath: string,
  description: string,
): FileSystemIdentity {
  const status = lstatSync(filePath, { bigint: true });
  if (
    !status.isFile() ||
    status.isSymbolicLink() ||
    status.nlink !== 1n ||
    realpathSync(filePath) !== resolve(filePath)
  ) {
    throw new FixtureReconcilerError(
      `${description} '${filePath}' must be a canonical single-link regular file`,
    );
  }
  return {
    dev: status.dev,
    ino: status.ino,
    ctimeNs: status.ctimeNs,
  };
}

function assertDirectoryIdentity(
  directoryPath: string,
  expected: FileSystemIdentity,
  description: string,
): void {
  const current = requireCanonicalDirectory(directoryPath, description);
  if (!sameFileSystemIdentity(current, expected)) {
    throw new FixtureReconcilerError(
      `${description} '${directoryPath}' changed after preflight`,
    );
  }
}

function sameFileSystemIdentity(
  left: FileSystemIdentity,
  right: FileSystemIdentity,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    (
      left.ctimeNs === undefined ||
      right.ctimeNs === undefined ||
      left.ctimeNs === right.ctimeNs
    )
  );
}

function fileSystemIdentityKey(identity: FileSystemIdentity): string {
  return `${identity.dev}:${identity.ino}`;
}

function flattenSemanticTree(roots: SemanticTreeNode[]): SemanticTreeNode[] {
  const flattened: SemanticTreeNode[] = [];
  const pending = [...roots].reverse();
  while (pending.length > 0) {
    const node = pending.pop()!;
    flattened.push(node);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push(node.children[index]!);
    }
  }
  return flattened;
}

function appendMapValue(
  map: Map<string, string[]>,
  key: string,
  value: string,
): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function appendUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function ownershipSignaturesEqual(
  left: OwnershipSignature,
  right: OwnershipSignature,
): boolean {
  return arraysEqual(left.index, right.index) &&
    arraysEqual(left.linked, right.linked) &&
    arraysEqual(left.semantic, right.semantic);
}

function normalizePath(filePath: string): string {
  return filePath.split(sep).join("/");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function formatReport(report: FixtureCheckReport): string {
  if (!report.ok) {
    return report.issues
      .map((issue) => `${issue.code} ${issue.path}: ${issue.message}`)
      .join("\n");
  }
  return [
    "Fixture check passed.",
    `Managed files: ${report.inventory.length}`,
    `Indexed files: ${report.indexedFileCount}`,
    `Graph nodes: ${report.graphNodeCount}`,
    `Mirror targets: ${report.mirrorCount}`,
  ].join("\n");
}

function parseScaffoldArguments(arguments_: string[]): FixtureScaffoldRequest {
  let ownerId: string | undefined;
  let treeParentId: string | undefined;
  const files: ScaffoldFileRequest[] = [];
  const roleByFlag: Readonly<Record<string, LinkedFileRole>> = {
    "--primary": "primary",
    "--supporting": "supporting",
    "--config": "config",
    "--test": "test",
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    const value = arguments_[index + 1];
    if (!value) {
      throw new FixtureReconcilerError(`Missing value for '${argument}'`);
    }
    if (argument === "--owner") {
      ownerId = value;
    } else if (argument === "--tree-parent") {
      treeParentId = value;
    } else if (roleByFlag[argument]) {
      files.push({ path: value, role: roleByFlag[argument] });
    } else {
      throw new FixtureReconcilerError(`Unknown scaffold option '${argument}'`);
    }
    index += 1;
  }

  if (!ownerId || !treeParentId) {
    throw new FixtureReconcilerError(
      "Scaffold requires --owner and --tree-parent",
    );
  }
  return { ownerId, treeParentId, files };
}

export async function runFixtureReconcilerCli(
  arguments_ = process.argv.slice(2),
): Promise<number> {
  const [command, ...commandArguments] = arguments_;
  try {
    if (command === "check") {
      const report = checkFixtures();
      const output = formatReport(report);
      (report.ok ? console.log : console.error)(output);
      return report.ok ? 0 : 1;
    }
    if (command === "scaffold") {
      const request = parseScaffoldArguments(commandArguments);
      console.log(`${JSON.stringify(scaffoldFixtures(request), null, 2)}\n`);
      return 0;
    }
    if (command === "sync") {
      const result = syncFixtureMirrors();
      console.log([
        formatReport(result.report),
        `Copied: ${result.copied.length > 0 ? result.copied.join(", ") : "(none)"}`,
        `Unchanged: ${result.unchanged.length > 0 ? result.unchanged.join(", ") : "(none)"}`,
      ].join("\n"));
      return 0;
    }
    console.error([
      "Usage:",
      "  sample-fixture-reconciler check",
      "  sample-fixture-reconciler sync",
      "  sample-fixture-reconciler scaffold --owner NODE --tree-parent TREE_NODE [--primary PATH] [--supporting PATH] [--config PATH] [--test PATH]",
    ].join("\n"));
    return 1;
  } catch (error) {
    if (error instanceof FixtureReconcilerError) {
      console.error(error.message);
      for (const issue of error.issues) {
        console.error(`${issue.code} ${issue.path}: ${issue.message}`);
      }
      return 1;
    }
    throw error;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await runFixtureReconcilerCli();
}
