import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMockSampleWorkspace } from "../client/mock-project-os-api-client.js";
import {
  CreateFileContextBundleSchema,
  type CreateFileContextBundle,
} from "../contracts/create-file-context.js";
import type {
  FunctionalNode,
  LinkedFile,
  LinkedFileRole,
} from "../contracts/graph.js";
import {
  LocalContextBundleSchema,
  NodeContextBundleSchema,
  type LocalContextBundle,
} from "../contracts/local-context.js";
import type { LoadedProjectOSWorkspace } from "../persistence/workspace-store.js";
import {
  CONNECTED_CONTEXT_TOKEN_LIMIT,
  CONNECTED_FILE_LIMIT,
  CHILD_NODE_CONTEXT_TOKEN_LIMIT,
  CHILD_NODE_LIMIT,
  DefaultWorkspaceIgnorePolicy,
  LocalContextAssembler,
  computeCreateFileContextBundleHash,
  computeLocalContextBundleHash,
  verifyCreateFileContextBundleHash,
  verifyLocalContextBundleHash,
  verifyNodeContextBundleHash,
  type WorkspaceIgnorePolicy,
} from "./local-context-assembler.js";

const ASSEMBLED_AT = "2026-07-18T08:00:00.000Z";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("LocalContextAssembler", () => {
  it("includes direct hierarchy context in both node and file bundles", () => {
    const fixture = createFixture([linked("src/selected.ts", "primary")]);
    writeText(fixture.root, "src/selected.ts", "selected\n");
    const selected = fixture.workspace.graph.nodes.find(
      (node) => node.id === "node_selected",
    )!;
    const childA = hierarchyNode(selected, "node_child_a", "node_selected");
    const childB = hierarchyNode(selected, "node_child_b", "node_selected");
    selected.parentId = null;
    selected.children = [childB.id, childA.id];
    fixture.workspace.graph.nodes.push(childA, childB);

    const nodeBundle = assembleNode(fixture.workspace);
    const fileBundle = assemble(fixture.workspace);

    expect(nodeBundle.neighborhood.parent).toBeNull();
    expect(nodeBundle.neighborhood.children.map((node) => node.id)).toEqual([
      "node_child_b",
      "node_child_a",
    ]);
    expect(nodeBundle.neighborhood.childrenCoverage).toMatchObject({
      totalCount: 2,
      includedCount: 2,
      omittedCount: 0,
    });
    expect(fileBundle.neighborhood).toEqual(nodeBundle.neighborhood);
  });

  it("includes the direct parent for a middle node and empty children for a leaf", () => {
    const fixture = createFixture([]);
    const selected = fixture.workspace.graph.nodes.find(
      (node) => node.id === "node_selected",
    )!;
    const parent = hierarchyNode(selected, "node_parent", null, [selected.id]);
    const leaf = hierarchyNode(selected, "node_leaf", selected.id);
    selected.parentId = parent.id;
    selected.children = [leaf.id];
    fixture.workspace.graph.nodes.push(parent, leaf);
    const assembler = new LocalContextAssembler();

    const middleBundle = assembleNode(fixture.workspace, assembler);
    const leafBundle = assembler.assembleNode({
      workspace: fixture.workspace,
      nodeId: leaf.id,
      responseLanguage: "en",
      assembledAt: ASSEMBLED_AT,
    });

    expect(middleBundle.neighborhood.parent?.id).toBe(parent.id);
    expect(middleBundle.neighborhood.children.map((node) => node.id)).toEqual([
      leaf.id,
    ]);
    expect(leafBundle.neighborhood.parent?.id).toBe(selected.id);
    expect(leafBundle.neighborhood.children).toEqual([]);
    expect(leafBundle.neighborhood.childrenCoverage).toEqual({
      totalCount: 0,
      includedCount: 0,
      omittedCount: 0,
      estimatedTokensIncluded: 0,
    });
  });

  it("records direct children omitted by count and token budgets", () => {
    const countFixture = createFixture([]);
    const selected = countFixture.workspace.graph.nodes.find(
      (node) => node.id === "node_selected",
    )!;
    const children = Array.from({ length: CHILD_NODE_LIMIT + 2 }, (_, index) =>
      hierarchyNode(selected, `node_child_${index}`, selected.id));
    selected.children = children.map((child) => child.id);
    countFixture.workspace.graph.nodes.push(...children);

    const countCoverage = assembleNode(countFixture.workspace).neighborhood.childrenCoverage;
    expect(countCoverage).toMatchObject({
      totalCount: CHILD_NODE_LIMIT + 2,
      includedCount: CHILD_NODE_LIMIT,
      omittedCount: 2,
    });

    const tokenFixture = createFixture([]);
    const tokenSelected = tokenFixture.workspace.graph.nodes.find(
      (node) => node.id === "node_selected",
    )!;
    const oversizedChild = hierarchyNode(
      tokenSelected,
      "node_oversized_child",
      tokenSelected.id,
      [],
      "x".repeat(CHILD_NODE_CONTEXT_TOKEN_LIMIT * 4),
    );
    tokenSelected.children = [oversizedChild.id];
    tokenFixture.workspace.graph.nodes.push(oversizedChild);

    expect(assembleNode(tokenFixture.workspace).neighborhood.childrenCoverage)
      .toEqual({
        totalCount: 1,
        includedCount: 0,
        omittedCount: 1,
        estimatedTokensIncluded: 0,
      });
  });

  it("records unresolved hierarchy ids separately from budget omissions", () => {
    const fixture = createFixture([]);
    const selected = fixture.workspace.graph.nodes.find(
      (node) => node.id === "node_selected",
    )!;
    selected.parentId = "node_missing_parent";
    selected.children = ["node_missing_child"];

    const neighborhood = assembleNode(fixture.workspace).neighborhood;
    expect(neighborhood.parent).toBeNull();
    expect(neighborhood.children).toEqual([]);
    expect(neighborhood.childrenCoverage).toEqual({
      totalCount: 0,
      includedCount: 0,
      omittedCount: 0,
      estimatedTokensIncluded: 0,
    });
    expect(neighborhood.unresolvedNodeIds).toEqual([
      "node_missing_parent",
      "node_missing_child",
      "node_missing",
    ]);
  });

  it("assembles read-only node context with responsibility, neighborhood, files, omissions, and description", () => {
    const fixture = createFixture([
      linked("src/selected.ts", "primary"),
      linked("src/support.ts", "supporting"),
      linked(".env.local", "config"),
    ], ["src/semantic.ts"]);
    writeText(fixture.root, "src/selected.ts", "export const selected = true;\n");
    writeText(fixture.root, "src/support.ts", "export const support = true;\n");
    writeText(fixture.root, "src/semantic.ts", "export const semantic = true;\n");

    const bundle = assembleNode(fixture.workspace);

    expect(NodeContextBundleSchema.safeParse(bundle).success).toBe(true);
    expect(verifyNodeContextBundleHash(bundle)).toBe(true);
    expect(bundle.scope).toEqual({ kind: "node", nodeId: "node_selected" });
    expect(bundle.neighborhood.selected).toMatchObject({
      responsibility: "Plans changes across the selected capability files.",
    });
    expect(bundle.neighborhood.upstream.map((node) => node.id)).toEqual(["node_up"]);
    expect(bundle.neighborhood.downstream.map((node) => node.id)).toEqual(["node_down"]);
    expect(bundle.fileManifest.map((file) => file.path)).toEqual([
      "src/selected.ts",
      "src/semantic.ts",
      "src/support.ts",
      ".env.local",
    ]);
    expect(bundle.fileManifest.find((file) => file.path === ".env.local"))
      .toMatchObject({ disposition: "omitted", omissionReason: "sensitive_path" });
    expect(bundle.fileManifest.every((file) => file.relationship === "connected")).toBe(true);
    expect(bundle.project.description).toEqual({
      content: "A user-authored concise project description.",
      source: "user",
      estimatedTokens: 11,
    });
    expect(bundle.budget.descriptionEstimatedTokens).toBe(11);
    expect(bundle.allowedWritePaths).toEqual([]);
  });

  it("derives a deterministic synopsis and orders selected, role, then path", () => {
    const fixture = createFixture([
      linked("src/selected.ts", "supporting"),
      linked("test/z.test.ts", "test"),
      linked("src/z.ts", "supporting"),
      linked("src/a.ts", "supporting"),
      linked("config/app.json", "config"),
      linked("src/primary.ts", "primary"),
    ], ["src/semantic.ts"]);
    writeText(fixture.root, "src/selected.ts", "const selected = '✓';\n");
    writeText(fixture.root, "src/primary.ts", "export const primary = true;\n");
    writeText(fixture.root, "src/a.ts", "export const a = true;\n");
    writeText(fixture.root, "src/z.ts", "export const z = true;\n");
    writeText(fixture.root, "src/semantic.ts", "export const semantic = true;\n");
    writeText(fixture.root, "config/app.json", "{}\n");
    writeText(fixture.root, "test/z.test.ts", "export {};\n");

    const first = assemble(fixture.workspace);
    const second = assemble(fixture.workspace);

    expect(first.project.synopsis).toContain("Context Fixture is a node project");
    expect(first.project.synopsis).toContain("Primary capabilities:");
    expect(first.neighborhood.upstream.map((node) => node.id)).toEqual(["node_up"]);
    expect(first.neighborhood.downstream.map((node) => node.id)).toEqual(["node_down"]);
    expect(first.fileManifest.map((file) => file.path)).toEqual([
      "src/selected.ts",
      "src/primary.ts",
      "src/a.ts",
      "src/semantic.ts",
      "src/z.ts",
      "config/app.json",
      "test/z.test.ts",
    ]);
    expect(first.bundleHash).toBe(second.bundleHash);
    expect(first).toEqual(second);
  });

  it("scopes synopsis omissions separately from neighborhood coverage", () => {
    const fixture = createFixture([]);
    const selected = fixture.workspace.graph.nodes.find(
      (node) => node.id === "node_selected",
    )!;
    fixture.workspace.graph.nodes.push(
      ...Array.from({ length: 6 }, (_, index) =>
        hierarchyNode(selected, `node_top_level_${index}`, null)),
    );

    const bundle = assembleNode(fixture.workspace);

    expect(bundle.project.synopsisOmittedNodeCount).toBe(1);
    expect(bundle.project.synopsis).toContain(
      "1 top-level graph node is not listed in this concise project synopsis.",
    );
    expect(bundle.project.synopsis).toContain(
      "This does not describe coverage of the selected-node neighborhood or file context.",
    );
    expect(bundle.project.synopsis).not.toContain(
      "additional top-level capabilities omitted",
    );
  });

  it("includes selected content byte-exactly with the complete SHA-256", () => {
    const fixture = createFixture([linked("src/selected.ts", "primary")]);
    const content = "\ufeffconst greeting = '你好';\r\n";
    writeText(fixture.root, "src/selected.ts", content);

    const bundle = assemble(fixture.workspace);
    const selected = bundle.fileManifest[0]!;

    expect(selected).toMatchObject({
      path: "src/selected.ts",
      relationship: "selected",
      disposition: "exact",
      content,
      byteLength: new TextEncoder().encode(content).byteLength,
      includedByteLength: new TextEncoder().encode(content).byteLength,
    });
    expect(selected.sha256).toBe(
      "sha256:01e76edfbe5dccdb56c7343eafe410d75c5808ed0fec4b6b2375cc6c87124465",
    );
    expect(bundle.allowedWritePaths).toEqual(["src/selected.ts"]);
    expect(bundle.allowedReadPaths).toEqual(["src/selected.ts"]);
  });

  it("prefix-truncates connected files and honestly records token and count omissions", () => {
    const paths = Array.from({ length: 10 }, (_, index) =>
      `src/connected-${String(index).padStart(2, "0")}.ts`);
    const fixture = createFixture([
      linked("src/selected.ts", "primary"),
      ...paths.map((path) => linked(path, "supporting")),
    ]);
    writeText(fixture.root, "src/selected.ts", "selected\n");
    for (const path of paths) {
      writeText(fixture.root, path, "🙂".repeat(9_000));
    }

    const bundle = assemble(fixture.workspace);
    const connected = bundle.fileManifest.slice(1);

    expect(connected.slice(0, 4).every((entry) => entry.disposition === "truncated"))
      .toBe(true);
    expect(connected[0]).toMatchObject({
      disposition: "truncated",
      includedByteLength: 32_000,
      truncation: { strategy: "utf8_prefix", omittedByteLength: 4_000 },
    });
    expect(connected.slice(4).every((entry) =>
      entry.disposition === "omitted" && entry.omissionReason === "budget_exhausted"))
      .toBe(true);
    expect(bundle.budget.connectedEstimatedTokensIncluded).toBe(
      CONNECTED_CONTEXT_TOKEN_LIMIT,
    );

    const countFixture = createFixture([
      linked("src/selected.ts", "primary"),
      ...paths.map((path) => linked(path, "supporting")),
    ]);
    writeText(countFixture.root, "src/selected.ts", "selected\n");
    for (const path of paths) writeText(countFixture.root, path, "x");
    const countManifest = assemble(countFixture.workspace).fileManifest.slice(1);
    expect(countManifest.slice(0, CONNECTED_FILE_LIMIT).every(
      (entry) => entry.disposition === "exact"))
      .toBe(true);
    expect(countManifest.slice(CONNECTED_FILE_LIMIT).every(
      (entry) => entry.omissionReason === "connected_file_limit"))
      .toBe(true);
  });

  it("omits unsafe connected files with explicit reasons and never reads them into context", () => {
    const linkedFiles = [
      linked("src/selected.ts", "primary"),
      linked("../outside.ts", "supporting"),
      linked("/absolute.ts", "supporting"),
      linked(".git/config", "config"),
      linked("node_modules/pkg/index.js", "supporting"),
      linked(".env.local", "config"),
      linked("src/link.ts", "supporting"),
      linked("src/binary.bin", "supporting"),
      linked("src/invalid.ts", "supporting"),
      linked("src/secret.ts", "supporting"),
    ];
    const fixture = createFixture(linkedFiles);
    writeText(fixture.root, "src/selected.ts", "selected\n");
    writeText(fixture.root, "src/target.ts", "target\n");
    symlinkSync(join(fixture.root, "src/target.ts"), join(fixture.root, "src/link.ts"));
    writeBytes(fixture.root, "src/binary.bin", new Uint8Array([65, 0, 66]));
    writeBytes(fixture.root, "src/invalid.ts", new Uint8Array([0xc3, 0x28]));
    writeText(fixture.root, "src/secret.ts", "token = 'sk-abcdefghijklmnopqrstuvwxyz1234'\n");

    const manifest = assemble(fixture.workspace).fileManifest;
    const reasons = Object.fromEntries(
      manifest.slice(1).map((entry) => [entry.path, entry.omissionReason]),
    );

    expect(reasons).toMatchObject({
      "../outside.ts": "protected_path",
      "/absolute.ts": "protected_path",
      ".git/config": "protected_path",
      "node_modules/pkg/index.js": "ignored",
      ".env.local": "sensitive_path",
      "src/link.ts": "symlink",
      "src/binary.bin": "binary",
      "src/invalid.ts": "invalid_utf8",
      "src/secret.ts": "secret_risk",
    });
    expect(manifest.slice(1).every((entry) => entry.content === undefined)).toBe(true);
  });

  it("uses the injected ignore policy and the default denylist policy", () => {
    const fixture = createFixture([
      linked("src/selected.ts", "primary"),
      linked("src/generated.ts", "supporting"),
      linked("coverage/report.ts", "supporting"),
    ]);
    writeText(fixture.root, "src/selected.ts", "selected\n");
    writeText(fixture.root, "src/generated.ts", "generated\n");
    writeText(fixture.root, "coverage/report.ts", "coverage\n");
    const injectedPolicy: WorkspaceIgnorePolicy = {
      ignoredPaths: () => new Set(["src/generated.ts"]),
    };

    const injected = assemble(fixture.workspace, new LocalContextAssembler({
      ignorePolicy: injectedPolicy,
    }));
    expect(injected.fileManifest.find((entry) => entry.path === "src/generated.ts"))
      .toMatchObject({ disposition: "omitted", omissionReason: "ignored" });

    const defaultPolicy = new DefaultWorkspaceIgnorePolicy();
    expect(defaultPolicy.ignoredPaths(fixture.root, ["coverage/report.ts"]))
      .toEqual(new Set(["coverage/report.ts"]));
  });

  it("batches Git ignore decisions when the workspace is a repository", () => {
    const fixture = createFixture([
      linked("src/selected.ts", "primary"),
      linked("generated/output.ts", "supporting"),
      linked("src/kept.ts", "supporting"),
      linked("../outside.ts", "supporting"),
    ]);
    writeText(fixture.root, "src/selected.ts", "selected\n");
    writeText(fixture.root, "generated/output.ts", "ignored\n");
    writeText(fixture.root, "src/kept.ts", "kept\n");
    writeText(fixture.root, ".gitignore", "generated/\n");
    const initialized = spawnSync("git", ["init", "--quiet", fixture.root], {
      input: "",
      encoding: "utf8",
    });
    expect(initialized.status).toBe(0);

    const manifest = assemble(fixture.workspace).fileManifest;
    expect(manifest.find((entry) => entry.path === "generated/output.ts"))
      .toMatchObject({ disposition: "omitted", omissionReason: "ignored" });
    expect(manifest.find((entry) => entry.path === "src/kept.ts"))
      .toMatchObject({ disposition: "exact", content: "kept\n" });
    expect(manifest.find((entry) => entry.path === "../outside.ts"))
      .toMatchObject({ disposition: "omitted", omissionReason: "protected_path" });
  });

  it.each([
    ["traversal", "../selected.ts", "protected_path", undefined],
    ["sensitive path", ".env", "sensitive_path", "VALUE=public\n"],
    ["binary content", "src/selected.bin", "binary", new Uint8Array([1, 0, 2])],
    [
      "secret content",
      "src/selected.ts",
      "secret_risk",
      `token = 'sk-ant-api03-${"a".repeat(32)}'\n`,
    ],
    ["oversized content", "src/selected.ts", "selected_file_too_large", "x".repeat(12_001)],
  ])("fails closed when the selected file has %s", (_label, path, reason, content) => {
    const fixture = createFixture([linked(path, "primary")]);
    if (content instanceof Uint8Array) writeBytes(fixture.root, path, content);
    else if (content !== undefined) writeText(fixture.root, path, content);

    expect(() => assemble(fixture.workspace, undefined, path)).toThrowError(
      expect.objectContaining({ code: "local_context_unavailable", message: expect.stringContaining(reason) }),
    );
  });

  it("rejects a selected file that does not belong to the selected node", () => {
    const fixture = createFixture([linked("src/member.ts", "primary")]);
    writeText(fixture.root, "src/member.ts", "member\n");
    writeText(fixture.root, "src/not-member.ts", "not member\n");

    expect(() => assemble(fixture.workspace, undefined, "src/not-member.ts"))
      .toThrowError(expect.objectContaining({ code: "local_context_unavailable" }));
  });

  it("deduplicates canonical and hard-link aliases by file identity", () => {
    const fixture = createFixture([
      linked("src/selected.ts", "primary"),
      linked("src/alias-a.ts", "supporting"),
      linked("src/alias-b.ts", "supporting"),
    ]);
    writeText(fixture.root, "src/selected.ts", "selected\n");
    writeText(fixture.root, "src/alias-a.ts", "same inode\n");
    linkSync(join(fixture.root, "src/alias-a.ts"), join(fixture.root, "src/alias-b.ts"));

    expect(assemble(fixture.workspace).fileManifest.map((entry) => entry.path)).toEqual([
      "src/selected.ts",
      "src/alias-a.ts",
    ]);
  });

  it("hashes all canonical bundle fields, including assembledAt", () => {
    const fixture = createFixture([linked("src/selected.ts", "primary")]);
    writeText(fixture.root, "src/selected.ts", "selected\n");
    const bundle = assemble(fixture.workspace);
    const identical = assemble(fixture.workspace);

    expect(verifyLocalContextBundleHash(bundle)).toBe(true);
    expect(bundle.bundleHash).toBe(identical.bundleHash);
    expect(computeLocalContextBundleHash(bundle)).toBe(bundle.bundleHash);

    for (const mutate of hashCoveredMutations()) {
      const changed = structuredClone(bundle);
      mutate(changed);
      expect(LocalContextBundleSchema.safeParse(changed).success).toBe(true);
      expect(verifyLocalContextBundleHash(changed)).toBe(false);
    }

    const later = assemble(fixture.workspace, undefined, "src/selected.ts", "2026-07-18T08:00:01.000Z");
    expect(later.bundleHash).not.toBe(bundle.bundleHash);
  });

  it("assembles a distinct create context for one exact owned parent directory", () => {
    const fixture = createFixture([
      linked("src/component/existing.ts", "primary"),
      linked("tests/component.test.ts", "test"),
    ]);
    const selected = fixture.workspace.graph.nodes.find(
      (node) => node.id === "node_selected",
    )!;
    selected.level = "component";
    selected.elementType = "component";
    writeText(fixture.root, "src/component/existing.ts", "export {}\n");
    writeText(fixture.root, "tests/component.test.ts", "test('x', () => {})\n");
    const assembler = new LocalContextAssembler();
    const nodeContext = assembleNode(fixture.workspace, assembler);
    const bundle = assembler.assembleCreateFile({
      workspace: fixture.workspace,
      nodeContext,
      intendedFilePath: "src/component/new.ts",
      responsibility: "Implement the new component helper",
      assembledAt: ASSEMBLED_AT,
    });

    expect(CreateFileContextBundleSchema.parse(bundle)).toEqual(bundle);
    expect(bundle.scope).toMatchObject({
      kind: "leaf-create",
      nodeId: "node_selected",
      intendedFilePath: "src/component/new.ts",
      parentDirectoryPath: "src/component",
    });
    expect(bundle.nodeContext.fileManifest.every(
      (file) => file.relationship === "connected",
    )).toBe(true);
    expect(bundle.allowedWritePaths).toEqual(["src/component/new.ts"]);
    expect(verifyCreateFileContextBundleHash(bundle)).toBe(true);
    const tampered = structuredClone(bundle) as CreateFileContextBundle;
    tampered.scope.responsibility = "Tampered";
    expect(verifyCreateFileContextBundleHash(tampered)).toBe(false);
    expect(computeCreateFileContextBundleHash(bundle)).toBe(bundle.bundleHash);

    expect(() => assembler.assembleCreateFile({
      workspace: fixture.workspace,
      nodeContext,
      intendedFilePath: "src/new.ts",
      responsibility: "Too broad",
      assembledAt: ASSEMBLED_AT,
    })).toThrow(/outside the component's existing directory scope/u);
    expect(() => assembler.assembleCreateFile({
      workspace: fixture.workspace,
      nodeContext,
      intendedFilePath: "src/component/nested/new.ts",
      responsibility: "Nested parent is not authorized",
      assembledAt: ASSEMBLED_AT,
    })).toThrow(/outside the component's existing directory scope/u);
  });

  it("assembles a read-only prospective component context for a scaffold file", () => {
    const fixture = createFixture([linked("src/component/existing.ts", "primary")]);
    writeText(fixture.root, "src/component/existing.ts", "export {}\n");
    const assembler = new LocalContextAssembler();
    const parentContext = assembleNode(fixture.workspace, assembler);
    const bundle = assembler.assembleScaffoldFile({
      workspace: fixture.workspace,
      parentNodeContext: parentContext,
      prospectiveNode: {
        id: "node_server_new",
        name: "New product component",
        summary: "Own the new product behavior",
        responsibility: "Implement the new product behavior",
        status: "active",
      },
      intendedFilePath: "src/component/new.ts",
      responsibility: "Implement the scaffolded file",
      assembledAt: ASSEMBLED_AT,
    });

    expect(bundle.scope).toMatchObject({
      kind: "leaf-create",
      nodeId: "node_server_new",
      intendedFilePath: "src/component/new.ts",
    });
    expect(bundle.nodeContext.scope).toEqual({ kind: "node", nodeId: "node_server_new" });
    expect(bundle.nodeContext.neighborhood.parent?.id).toBe("node_selected");
    expect(bundle.nodeContext.allowedWritePaths).toEqual([]);
    expect(bundle.allowedWritePaths).toEqual(["src/component/new.ts"]);
    expect(verifyCreateFileContextBundleHash(bundle)).toBe(true);
  });
});

function createFixture(
  linkedFiles: LinkedFile[],
  semanticPaths: string[] = [],
): { root: string; workspace: LoadedProjectOSWorkspace } {
  const root = mkdtempSync(join(tmpdir(), "projectos-local-context-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, ".projectos"), { recursive: true });
  const workspace = createMockSampleWorkspace();
  const base = workspace.graph.nodes[0]!;
  const selectedNode = {
    ...base,
    id: "node_selected",
    name: "Selected capability",
    nameEn: "Selected capability",
    summary: "Owns the selected local feature.",
    responsibility: "Plans changes across the selected capability files.",
    linkedFiles,
    upstream: ["node_up", "node_missing"],
    downstream: ["node_down"],
  };
  const upstream = {
    ...base,
    id: "node_up",
    name: "Upstream",
    nameEn: "Upstream",
    summary: "Provides input.",
    linkedFiles: [],
    upstream: [],
    downstream: ["node_selected"],
  };
  const downstream = {
    ...base,
    id: "node_down",
    name: "Downstream",
    nameEn: "Downstream",
    summary: "Consumes output.",
    linkedFiles: [],
    upstream: ["node_selected"],
    downstream: [],
  };
  return {
    root,
    workspace: {
      ...workspace,
      workspaceRoot: root,
      projectOSRoot: join(root, ".projectos"),
      project: {
        ...workspace.project,
        projectId: "project_context_fixture",
        displayName: "Context Fixture",
        framework: "node",
        workspaceRoot: root,
      },
      projectDescription: {
        version: "0.1.0",
        projectId: "project_context_fixture",
        conciseDescription: "A user-authored concise project description.",
        source: "user",
        updatedAt: "2026-07-17T10:00:00.000Z",
      },
      graph: {
        ...workspace.graph,
        projectId: "project_context_fixture",
        projectName: "Context Fixture Graph",
        projectType: "node",
        analyzedAt: "2026-07-17T10:00:00.000Z",
        analysisStatus: "complete",
        nodes: [selectedNode, upstream, downstream],
        edges: [],
        fileIndex: [],
      },
      semanticTree: {
        version: "0.1.0",
        projectId: "project_context_fixture",
        generatedAt: "2026-07-17T10:00:00.000Z",
        roots: semanticPaths.map((path, index) => ({
          id: `semantic_${index}`,
          label: path,
          kind: "file" as const,
          path,
          sourceNodeId: "node_selected",
          status: "normal" as const,
          children: [],
        })),
      },
    },
  };
}

function linked(path: string, role: LinkedFileRole): LinkedFile {
  return { path, role };
}

function writeText(root: string, path: string, content: string): void {
  writeBytes(root, path, new TextEncoder().encode(content));
}

function writeBytes(root: string, path: string, content: Uint8Array): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function assemble(
  workspace: LoadedProjectOSWorkspace,
  assembler = new LocalContextAssembler(),
  selectedFilePath = "src/selected.ts",
  assembledAt = ASSEMBLED_AT,
): LocalContextBundle {
  return assembler.assemble({
    workspace,
    nodeId: "node_selected",
    selectedFilePath,
    responseLanguage: "en",
    assembledAt,
  });
}

function assembleNode(
  workspace: LoadedProjectOSWorkspace,
  assembler = new LocalContextAssembler(),
) {
  return assembler.assembleNode({
    workspace,
    nodeId: "node_selected",
    responseLanguage: "en",
    assembledAt: ASSEMBLED_AT,
  });
}

function hashCoveredMutations(): Array<(bundle: LocalContextBundle) => void> {
  return [
    (bundle) => { bundle.assembledAt = "2026-07-19T00:00:00.000Z"; },
    (bundle) => { bundle.responseLanguage = "zh"; },
    (bundle) => { bundle.project.synopsis += " Changed."; },
    (bundle) => { bundle.neighborhood.selected.summary += " Changed."; },
    (bundle) => { bundle.neighborhood.childrenCoverage.estimatedTokensIncluded += 1; },
    (bundle) => { bundle.fileManifest[0]!.sha256 = `sha256:${"f".repeat(64)}`; },
    (bundle) => {
      bundle.scope.selectedFilePath = "src/renamed.ts";
      bundle.fileManifest[0]!.path = "src/renamed.ts";
      bundle.allowedReadPaths = ["src/renamed.ts"];
      bundle.allowedWritePaths = ["src/renamed.ts"];
    },
    (bundle) => { bundle.budget.connectedTokenLimit += 1; },
  ];
}

function hierarchyNode(
  template: FunctionalNode,
  id: string,
  parentId: string | null,
  children: string[] = [],
  summary = `Summary for ${id}`,
): FunctionalNode {
  return {
    ...template,
    id,
    name: id,
    nameEn: id,
    summary,
    responsibility: `Responsibility for ${id}`,
    linkedFiles: [],
    upstream: [],
    downstream: [],
    parentId,
    children,
  };
}
