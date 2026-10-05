import { describe, expect, it } from "vitest";

import type { SemanticTree } from "../contracts/index.js";
import {
  appendProductNodeToSemanticTree,
  appendOwnedFileToSemanticTree,
  removeOwnedFileFromSemanticTree,
  removeProductNodesFromSemanticTree,
} from "./semantic-tree-mutations.js";

describe("appendProductNodeToSemanticTree", () => {
  it("adds one product feature with all scaffolded files atomically", () => {
    const result = appendProductNodeToSemanticTree(makeTree(), {
      projectId: "project",
      nodeId: "new_component",
      label: "New component",
      entryId: "tree_new_component",
      generatedAt: "2026-07-19T00:00:00.000Z",
      files: [{ path: "src/new.ts", entryId: "tree_new_file", kind: "file" }],
    });
    expect(result.roots.at(-1)).toMatchObject({
      sourceNodeId: "new_component",
      children: [{ path: "src/new.ts", sourceNodeId: "new_component" }],
    });
  });

  it("rejects duplicate paths and pre-existing node ownership", () => {
    const tree = makeTree();
    expect(() => appendProductNodeToSemanticTree(tree, {
      projectId: "project",
      nodeId: "component",
      label: "Duplicate",
      entryId: "tree_new",
      generatedAt: "2026-07-19T00:00:00.000Z",
      files: [],
    })).toThrow(/already exist/u);
  });
});

describe("appendOwnedFileToSemanticTree", () => {
  it("adds one server-identified file beneath its unique component owner", () => {
    const result = appendOwnedFileToSemanticTree(makeTree(), {
      projectId: "project",
      ownerNodeId: "component",
      path: "src/new.ts",
      entryId: "tree_server_new",
      generatedAt: "2026-07-19T12:00:00.000Z",
      kind: "file",
    });
    expect(result.generatedAt).toBe("2026-07-19T12:00:00.000Z");
    expect(result.roots[0]?.children).toContainEqual({
      id: "tree_server_new",
      label: "src/new.ts",
      kind: "file",
      path: "src/new.ts",
      sourceNodeId: "component",
      status: "normal",
      children: [],
    });
  });

  it("fails closed for duplicate paths and missing or ambiguous owners", () => {
    const duplicate = makeTree();
    duplicate.roots[0]!.children.push({
      id: "existing",
      label: "src/new.ts",
      kind: "file",
      path: "src/new.ts",
      sourceNodeId: "component",
      status: "normal",
      children: [],
    });
    expect(() => appendOwnedFileToSemanticTree(duplicate, input()))
      .toThrow(/path already exists/u);

    const missing = makeTree();
    missing.roots[0]!.sourceNodeId = "other";
    expect(() => appendOwnedFileToSemanticTree(missing, input()))
      .toThrow(/exactly one component owner/u);

    const ambiguous = makeTree();
    ambiguous.roots.push(structuredClone(ambiguous.roots[0]!));
    ambiguous.roots[1]!.id = "second_owner";
    expect(() => appendOwnedFileToSemanticTree(ambiguous, input()))
      .toThrow(/exactly one component owner/u);
  });
});

describe("removeOwnedFileFromSemanticTree", () => {
  it("removes every nested entry for the declared owned path and preserves ordering", () => {
    const tree = makeTree();
    tree.roots[0]!.children.push(
      {
        id: "before", label: "Before", kind: "file", path: "src/before.ts",
        sourceNodeId: "component", status: "normal", children: [],
      },
      {
        id: "folder", label: "Folder", kind: "folder", status: "normal", children: [{
          id: "target", label: "Target", kind: "file", path: "src/target.ts",
          sourceNodeId: "component", status: "normal", children: [],
        }],
      },
      {
        id: "after", label: "After", kind: "file", path: "src/after.ts",
        sourceNodeId: "component", status: "normal", children: [],
      },
    );
    const result = removeOwnedFileFromSemanticTree(tree, {
      projectId: "project",
      ownerNodeIds: ["component"],
      path: "src/target.ts",
      generatedAt: "2026-07-20T00:00:00.000Z",
    });
    expect(result.generatedAt).toBe("2026-07-20T00:00:00.000Z");
    expect(result.roots[0]?.children.map((node) => node.id)).toEqual(["before", "folder", "after"]);
    expect(result.roots[0]?.children[1]?.children).toEqual([]);
  });

  it("fails closed for project mismatch, missing paths, or undeclared ownership", () => {
    const tree = makeTree();
    tree.roots[0]!.children.push({
      id: "target", label: "Target", kind: "file", path: "src/target.ts",
      sourceNodeId: "component", status: "normal", children: [],
    });
    const base = {
      projectId: "project", ownerNodeIds: ["component"], path: "src/target.ts",
      generatedAt: "2026-07-20T00:00:00.000Z",
    };
    expect(() => removeOwnedFileFromSemanticTree(tree, { ...base, projectId: "other" }))
      .toThrow(/another project/u);
    expect(() => removeOwnedFileFromSemanticTree(tree, { ...base, path: "src/missing.ts" }))
      .toThrow(/does not exist/u);
    expect(() => removeOwnedFileFromSemanticTree(tree, { ...base, ownerNodeIds: ["other"] }))
      .toThrow(/ownership/u);
  });
});

describe("removeProductNodesFromSemanticTree", () => {
  it("removes a server-derived node set and all of its owned file entries", () => {
    const tree = makeTree();
    tree.roots[0]!.children.push({
      id: "target", label: "Target", kind: "file", path: "src/target.ts",
      sourceNodeId: "component", status: "normal", children: [],
    });
    const result = removeProductNodesFromSemanticTree(tree, {
      projectId: "project",
      nodeIds: ["component"],
      ownedFilePaths: ["src/target.ts"],
      generatedAt: "2026-07-20T00:00:00.000Z",
    });
    expect(result.roots).toEqual([]);
  });

  it("blocks when a deleted node references a file outside the declared closure", () => {
    const tree = makeTree();
    tree.roots[0]!.children.push({
      id: "target", label: "Target", kind: "file", path: "src/target.ts",
      sourceNodeId: "component", status: "normal", children: [],
    });
    expect(() => removeProductNodesFromSemanticTree(tree, {
      projectId: "project",
      nodeIds: ["component"],
      ownedFilePaths: [],
      generatedAt: "2026-07-20T00:00:00.000Z",
    })).toThrow(/membership changed/u);
    expect(() => removeProductNodesFromSemanticTree(makeTree(), {
      projectId: "project",
      nodeIds: ["component"],
      ownedFilePaths: ["src/missing.ts"],
      generatedAt: "2026-07-20T00:00:00.000Z",
    })).toThrow(/membership changed/u);
  });

  it("preserves and promotes nested descendants owned by nodes outside the deletion set", () => {
    const tree = makeTree();
    tree.roots[0]!.children.push(
      {
        id: "target",
        label: "Target",
        kind: "file",
        path: "src/target.ts",
        sourceNodeId: "component",
        status: "normal",
        children: [],
      },
      {
        id: "foreign_component",
        label: "Foreign component",
        kind: "feature",
        sourceNodeId: "foreign",
        status: "active",
        children: [{
          id: "foreign_file",
          label: "src/foreign.ts",
          kind: "file",
          path: "src/foreign.ts",
          sourceNodeId: "foreign",
          status: "normal",
          children: [],
        }],
      },
    );

    const result = removeProductNodesFromSemanticTree(tree, {
      projectId: "project",
      nodeIds: ["component"],
      ownedFilePaths: ["src/target.ts"],
      generatedAt: "2026-07-20T00:00:00.000Z",
    });

    expect(result.roots).toEqual([expect.objectContaining({
      id: "foreign_component",
      sourceNodeId: "foreign",
      children: [expect.objectContaining({
        id: "foreign_file",
        path: "src/foreign.ts",
        sourceNodeId: "foreign",
      })],
    })]);
  });
});

function input() {
  return {
    projectId: "project",
    ownerNodeId: "component",
    path: "src/new.ts",
    entryId: "tree_server_new",
    generatedAt: "2026-07-19T12:00:00.000Z",
    kind: "file" as const,
  };
}

function makeTree(): SemanticTree {
  return {
    version: "0.1.0",
    projectId: "project",
    generatedAt: "2026-07-19T10:00:00.000Z",
    roots: [{
      id: "component_owner",
      label: "Component",
      kind: "feature",
      sourceNodeId: "component",
      status: "active",
      children: [],
    }],
  };
}
