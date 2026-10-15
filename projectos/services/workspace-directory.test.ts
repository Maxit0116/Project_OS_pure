import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectOSLocalApi } from "./project-os-local-api.js";
import { ensureWorkspaceBootstrapped } from "./workspace-bootstrap.js";
import { listWorkspaceDirectoryEntries } from "./workspace-directory.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "projectos-directory-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "src", "nested"), { recursive: true });
  mkdirSync(join(root, "node_modules", "leftpad"), { recursive: true });
  mkdirSync(join(root, ".git"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), "export const value = 1\n");
  writeFileSync(join(root, "src", "nested", "util.ts"), "export const util = 1\n");
  writeFileSync(join(root, "notes.txt"), "hello\n");
  writeFileSync(join(root, "node_modules", "leftpad", "index.js"), "module.exports = {}\n");
  writeFileSync(join(root, ".git", "config"), "");
  return root;
}

describe("workspace directory listing", () => {
  it("lists folders before files and skips dependency and metadata directories", () => {
    const root = makeRepo();
    expect(listWorkspaceDirectoryEntries(root, "")).toEqual([
      { name: "src", path: "src", kind: "directory" },
      { name: "notes.txt", path: "notes.txt", kind: "file" },
    ]);
    expect(listWorkspaceDirectoryEntries(root, "src")).toEqual([
      { name: "nested", path: "src/nested", kind: "directory" },
      { name: "app.ts", path: "src/app.ts", kind: "file" },
    ]);
    expect(() => listWorkspaceDirectoryEntries(root, "../")).toThrow();
    expect(() => listWorkspaceDirectoryEntries(root, ".projectos")).toThrow();
  });

  it("shows module files in the semantic tree and opens unindexed files from the directory", async () => {
    const root = makeRepo();
    ensureWorkspaceBootstrapped(root);
    const api = new ProjectOSLocalApi();
    const project = await api.openWorkspace(root);

    const tree = await api.getSemanticTree(project.projectId);
    const paths: string[] = [];
    const walk = (nodes: typeof tree.roots): void => {
      for (const node of nodes) {
        if (node.path) paths.push(node.path);
        walk(node.children);
      }
    };
    walk(tree.roots);
    expect(paths).toContain("src/app.ts");
    expect(paths).toContain("src/nested/util.ts");
    expect(paths).not.toContain("notes.txt");

    expect(await api.listWorkspaceDirectory(project.projectId, "")).toEqual(
      expect.arrayContaining([
        { name: "src", path: "src", kind: "directory" },
        { name: "notes.txt", path: "notes.txt", kind: "file" },
      ]),
    );
    await expect(api.getFileContent(project.projectId, "notes.txt")).resolves.toBe("hello\n");
    await expect(api.getFileContext(project.projectId, "notes.txt")).resolves.toMatchObject({
      scope: "file",
      filePath: "notes.txt",
    });
  });
});
