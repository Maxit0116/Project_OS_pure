import { describe, expect, it } from "vitest";

import type { FileEntry } from "../contracts/graph.js";
import type { SemanticTree } from "../contracts/semantic-tree.js";
import {
  attachIndexedFilesToSemanticTree,
  semanticKindForIndexedFile,
} from "./semantic-tree-files.js";

function file(path: string, type: FileEntry["type"], nodeIds: string[]): FileEntry {
  return {
    path,
    type,
    nodeIds,
    imports: [],
    exports: [],
    status: "normal",
  };
}

function tree(): SemanticTree {
  return {
    version: "0.1.0",
    projectId: "project",
    generatedAt: "2026-01-01T00:00:00.000Z",
    roots: [
      {
        id: "tree_container",
        label: "src",
        kind: "folder",
        sourceNodeId: "container_src",
        status: "normal",
        children: [
          {
            id: "tree_feature",
            label: "src module",
            kind: "feature",
            sourceNodeId: "component_src",
            status: "normal",
            children: [],
          },
        ],
      },
    ],
  };
}

describe("attachIndexedFilesToSemanticTree", () => {
  it("maps indexed file types onto semantic leaves", () => {
    expect(semanticKindForIndexedFile(file("app/page.tsx", "page", []))).toBe("route");
    expect(semanticKindForIndexedFile(file("app/api/route.ts", "api", []))).toBe("api");
    expect(semanticKindForIndexedFile(file("package.json", "config", []))).toBe("config");
    expect(semanticKindForIndexedFile(file("src/app.test.ts", "test", []))).toBe("test");
    expect(semanticKindForIndexedFile(file("src/app.ts", "lib", []))).toBe("file");
  });

  it("hangs owned files under the matching feature and keeps existing leaves", () => {
    const current = tree();
    current.roots[0]!.children[0]!.children.push({
      id: "tree_existing",
      label: "kept.ts",
      kind: "file",
      path: "src/kept.ts",
      sourceNodeId: "component_src",
      status: "normal",
      children: [],
    });

    const attached = attachIndexedFilesToSemanticTree(current, [
      file("src/kept.ts", "lib", ["component_src"]),
      file("src/app.ts", "lib", ["component_src"]),
      file("src/app.test.ts", "test", ["component_src"]),
      file("notes.txt", "other", []),
    ]);

    const feature = attached.roots[0]!.children[0]!;
    expect(feature.children.map((child) => child.path)).toEqual([
      "src/kept.ts",
      "src/app.test.ts",
      "src/app.ts",
    ]);
    expect(feature.children.map((child) => child.kind)).toEqual(["file", "test", "file"]);
    expect(feature.children.map((child) => child.label)).toEqual([
      "kept.ts",
      "app.test.ts",
      "app.ts",
    ]);
    expect(current.roots[0]!.children[0]!.children).toHaveLength(1);
  });
});
