import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectOSLocalApi } from "./project-os-local-api.js";
import { copySampleTree } from "../test-support/copy-sample.js";

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function copyOfSample(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "projectos-owner-"));
  roots.push(tempRoot);
  const workspaceRoot = join(tempRoot, "sample-graph-saas");
  copySampleTree(resolve("..", "sample-graph-saas"), workspaceRoot);
  rmSync(join(workspaceRoot, ".projectos", "settings.json"), { force: true });
  return workspaceRoot;
}

describe("assignFileOwner", () => {
  it("lets Agent change a file that no node owned: the graph, the file index and the tree all say so", async () => {
    const workspaceRoot = copyOfSample();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot, runEventPersistence: "memory" });
    const project = await api.openSampleWorkspace();
    const before = await api.getProjectGraph(project.projectId);
    const owner = before.nodes.find((node) => node.linkedFiles.some((file) => file.path === "lib/team.ts"))!;
    expect(before.fileIndex.find((f) => f.path === "lib/validators.ts")?.nodeIds).toEqual([]);

    const after = await api.assignFileOwner(project.projectId, "lib/validators.ts", owner.id);

    expect(after.fileIndex.find((f) => f.path === "lib/validators.ts")?.nodeIds).toEqual([owner.id]);
    // What a person gets back when they select the file: one owner, so no choice and no dead end.
    const context = await api.getFileContext(project.projectId, "lib/validators.ts");
    expect(context.nodeId).toBe(owner.id);
    // It survives a reload: it is on disk, not only in memory.
    const onDisk = JSON.parse(readFileSync(join(workspaceRoot, ".projectos", "graph.json"), "utf8")) as { fileIndex: Array<{ path: string; nodeIds: string[] }> };
    expect(onDisk.fileIndex.find((f) => f.path === "lib/validators.ts")?.nodeIds).toEqual([owner.id]);
    const tree = await api.getSemanticTree(project.projectId);
    expect(JSON.stringify(tree)).toContain("lib/validators.ts");
  });

  it("refuses a path that is not a file of the project, and leaves the graph as it was", async () => {
    const workspaceRoot = copyOfSample();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot, runEventPersistence: "memory" });
    const project = await api.openSampleWorkspace();
    const before = JSON.stringify(await api.getProjectGraph(project.projectId));
    const owner = (await api.getProjectGraph(project.projectId)).nodes.find((n) => n.level === "component")!;

    await expect(api.assignFileOwner(project.projectId, "lib/does-not-exist.ts", owner.id))
      .rejects.toMatchObject({ code: "file_not_found" });
    await expect(api.assignFileOwner(project.projectId, "../outside.ts", owner.id))
      .rejects.toMatchObject({ code: "file_not_found" });
    expect(JSON.stringify(await api.getProjectGraph(project.projectId))).toBe(before);
  });
});
