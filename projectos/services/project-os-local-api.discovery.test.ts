import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

describe("global agent discovery", () => {
  it("starts with system blocks and can inspect a deeper node without write authority", async () => {
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: resolve("..", "sample-graph-saas"),
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    const graph = await api.getProjectGraph(project.projectId);
    const global = await api.getGlobalAgentContext(project.projectId, "en");
    expect(global.immediateNodes?.some((node) => node.elementType === "software_system")).toBe(true);
    expect(global.immediateNodes?.some((node) => node.level === "container")).toBe(true);
    const immediateIds = new Set(global.immediateNodes?.map((node) => node.id));
    expect(global.immediateRelations?.every((edge) =>
      immediateIds.has(edge.sourceNodeId) && immediateIds.has(edge.targetNodeId)
    )).toBe(true);
    expect(global.allowedWritePaths).toEqual([]);

    const inspectable = graph.nodes.find((node) => node.linkedFiles.length > 0);
    expect(inspectable).toBeDefined();
    const inspected = await api.inspectAgentNode(project.projectId, inspectable!.id, "en");
    expect(inspected.scope).toEqual({ kind: "node", nodeId: inspectable!.id });
    expect(inspected.allowedWritePaths).toEqual([]);
    expect(inspected.fileManifest.length).toBeGreaterThan(0);
  });
});
