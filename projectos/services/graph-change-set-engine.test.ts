import { describe, expect, it } from "vitest";

import { GraphChangeSetSchema, type GraphChangeSet, type ProjectGraph } from "../contracts/index.js";
import { applyGraphChangeSet, computeProjectGraphHash } from "./graph-change-set-engine.js";

const existing = (nodeId: string) => ({ kind: "existing" as const, nodeId });
const temporary = (tempRef: string) => ({ kind: "temporary" as const, tempRef });
const ids = {
  nodeId: (ref: string) => `server_node_${ref}`,
  edgeId: (ref: string) => `server_edge_${ref}`,
};

describe("GraphChangeSet engine", () => {
  it("adds a new product file and component ownership as one semantic operation", async () => {
    const graph = makeGraph();
    const result = await apply(graph, [{
      kind: "addOwnedFile",
      owner: { kind: "existing", nodeId: "component_a" },
      path: "src/new.ts",
      fileType: "component",
      linkedRole: "supporting",
      responsibility: "Render the new product surface",
    }]);

    expect(result.graph.fileIndex.find((file) => file.path === "src/new.ts")).toEqual({
      path: "src/new.ts",
      type: "component",
      nodeIds: ["component_a"],
      imports: [],
      exports: [],
      status: "changed",
    });
    expect(result.graph.nodes.find((node) => node.id === "component_a")?.linkedFiles)
      .toContainEqual({
        path: "src/new.ts",
        role: "supporting",
        summary: "Render the new product surface",
      });
  });

  it("removes a product file, complete ownership, and cached file relations semantically", async () => {
    const graph = makeGraph();
    graph.fileIndex[0]!.nodeIds.push("component_a");
    graph.nodes.find((node) => node.id === "component_a")!.linkedFiles.push({
      path: "src/a.ts", role: "supporting",
    });
    graph.fileIndex.push(makeFile("src/importer.ts", ["component_a"]));
    graph.fileIndex[1]!.imports = ["src/a.ts"];
    graph.nodes.find((node) => node.id === "component_a")!.linkedFiles.push({
      path: "src/importer.ts", role: "supporting",
    });
    graph.fileRelations = [{
      id: "imports-a", sourcePath: "src/importer.ts", targetPath: "src/a.ts",
      relation: "imports", label: "imports", confidence: 1, evidence: "cached analysis",
    }];
    const result = await apply(graph, [{
      kind: "removeOwnedFile",
      path: "src/a.ts",
      expectedOwnerNodeIds: ["code_a", "component_a"],
    }]);
    expect(result.graph.fileIndex.map((file) => file.path)).toEqual(["src/importer.ts"]);
    expect(result.graph.fileIndex[0]?.imports).toEqual([]);
    expect(result.graph.nodes.find((node) => node.id === "code_a")?.linkedFiles).toEqual([]);
    expect(result.graph.nodes.find((node) => node.id === "component_a")?.linkedFiles)
      .toEqual([{ path: "src/importer.ts", role: "supporting" }]);
    expect(result.graph.fileRelations).toEqual([]);
  });

  it("rejects incomplete, duplicate, missing, and unsafe file-removal ownership", async () => {
    await expect(apply(makeGraph(), [{
      kind: "removeOwnedFile", path: "src/a.ts", expectedOwnerNodeIds: ["component_a"],
    }])).rejects.toMatchObject({ code: "ownership_mismatch" });
    await expect(apply(makeGraph(), [{
      kind: "removeOwnedFile", path: "src/a.ts", expectedOwnerNodeIds: ["code_a", "code_a"],
    }])).rejects.toMatchObject({ code: "ownership_mismatch" });
    await expect(apply(makeGraph(), [{
      kind: "removeOwnedFile", path: "src/missing.ts", expectedOwnerNodeIds: ["code_a"],
    }])).rejects.toMatchObject({ code: "ownership_mismatch" });
    await expect(apply(makeGraph(), [{
      kind: "removeOwnedFile", path: ".projectos/graph.json", expectedOwnerNodeIds: ["code_a"],
    }])).rejects.toMatchObject({ code: "ownership_mismatch" });

    const unlinked = makeGraph();
    unlinked.nodes.find((node) => node.id === "code_a")!.linkedFiles = [];
    await expect(apply(unlinked, [{
      kind: "removeOwnedFile", path: "src/a.ts", expectedOwnerNodeIds: ["code_a"],
    }])).rejects.toMatchObject({ code: "ownership_mismatch" });
  });

  it("rejects unsafe, duplicate, and non-component product-file ownership", async () => {
    const graph = makeGraph();
    const operation = {
      kind: "addOwnedFile" as const,
      owner: { kind: "existing" as const, nodeId: "component_a" },
      path: "src/new.ts",
      fileType: "component" as const,
      linkedRole: "supporting" as const,
      responsibility: "New surface",
    };
    graph.fileIndex.push(makeFile("src/new.ts", []));
    await expect(apply(graph, [operation])).rejects.toMatchObject({ code: "ownership_mismatch" });

    const unsafe = makeGraph();
    await expect(apply(unsafe, [{ ...operation, path: ".projectos/owned.ts" }]))
      .rejects.toMatchObject({ code: "ownership_mismatch" });
    for (const path of [
      "C:\\outside.ts",
      "src//duplicate-separator.ts",
      "src/./dot-segment.ts",
      "src/newline\n.ts",
    ]) {
      await expect(apply(makeGraph(), [{ ...operation, path }]))
        .rejects.toMatchObject({ code: "ownership_mismatch" });
    }

    const wrongOwner = makeGraph();
    await expect(apply(wrongOwner, [{
      ...operation,
      owner: { kind: "existing", nodeId: "container_a" },
    }])).rejects.toMatchObject({ code: "ownership_mismatch" });
  });
  it("adds nodes through server IDs and maintains both hierarchy sides", async () => {
    const graph = makeGraph();
    graph.fileIndex.push(makeFile("src/new.ts", []));
    const result = await apply(graph, [{
      kind: "addNode",
      tempRef: "new_code",
      parent: existing("component_a"),
      node: {
        type: "capability",
        name: "New code",
        status: "active",
        description: "new",
        summary: "new",
        responsibility: "Own new code",
        elementType: "code_element",
        level: "code",
        layer: "code",
        linkedFiles: [{ path: "src/new.ts", role: "primary" }],
        tags: [],
      },
    }]);
    expect(result.resolvedNodeIds).toEqual({ new_code: "server_node_new_code" });
    expect(result.graph.nodes.find((node) => node.id === "component_a")?.children).toContain("server_node_new_code");
    expect(result.graph.fileIndex.find((file) => file.path === "src/new.ts")?.nodeIds).toEqual(["server_node_new_code"]);
  });

  it("attaches a newly created file to a server-identified temporary component", async () => {
    const result = await apply(makeGraph(), [{
      kind: "addNode",
      tempRef: "new_component",
      parent: existing("container_a"),
      node: {
        type: "capability",
        name: "New component",
        status: "active",
        description: "new",
        summary: "new",
        responsibility: "Own the scaffolded file",
        elementType: "component",
        level: "component",
        layer: "component",
        linkedFiles: [],
        tags: ["product-authored"],
      },
    }, {
      kind: "addOwnedFile",
      owner: temporary("new_component"),
      path: "src/new-component.ts",
      fileType: "component",
      linkedRole: "primary",
      responsibility: "Implement the scaffolded component",
    }]);
    expect(result.graph.fileIndex.find((file) => file.path === "src/new-component.ts")?.nodeIds)
      .toEqual(["server_node_new_component"]);
    expect(result.graph.nodes.find((node) => node.id === "server_node_new_component")?.linkedFiles)
      .toContainEqual(expect.objectContaining({ path: "src/new-component.ts" }));
  });

  it("updates only product fields and rejects topology fields at the contract", async () => {
    const result = await apply(makeGraph(), [{
      kind: "updateNodeFields",
      node: existing("component_a"),
      fields: { name: "Renamed", summary: "Updated" },
    }]);
    expect(result.graph.nodes.find((node) => node.id === "component_a")).toMatchObject({ name: "Renamed", summary: "Updated" });
    expect(GraphChangeSetSchema.safeParse({
      version: "0.1.0",
      projectId: "project",
      baseGraphHash: `sha256:${"0".repeat(64)}`,
      operations: [{ kind: "updateNodeFields", node: existing("component_a"), fields: { children: [] } }],
    }).success).toBe(false);
  });

  it("moves a node and recomputes roots and depth", async () => {
    const graph = makeGraph();
    graph.nodes.push(makeNode("container_b", "container", "container", "root", []));
    graph.nodes.find((node) => node.id === "root")!.children!.push("container_b");
    const result = await apply(graph, [{ kind: "moveNode", node: existing("component_a"), newParent: existing("container_b") }]);
    expect(result.graph.nodes.find((node) => node.id === "container_a")?.children).toEqual([]);
    expect(result.graph.nodes.find((node) => node.id === "container_b")?.children).toEqual(["component_a"]);
    expect(result.graph.nodes.find((node) => node.id === "component_a")?.depth).toBe(2);
    expect(result.graph.topology).toMatchObject({ rootIds: ["root"], maxDepth: 3, totalNodes: 5 });
  });

  it("adds and removes edges with server-owned IDs", async () => {
    const added = await apply(makeGraph(), [{
      kind: "addEdge",
      tempRef: "dependency",
      source: existing("component_a"),
      target: existing("code_a"),
      relation: "uses",
      label: "uses",
      evidence: "declared by test",
    }]);
    expect(added.graph.edges[0]?.id).toBe("server_edge_dependency");
    const removed = await apply(added.graph, [{ kind: "removeEdge", edgeId: "server_edge_dependency" }]);
    expect(removed.graph.edges).toEqual([]);
  });

  it("deletes a fully-declared leaf and removes its owned file", async () => {
    const result = await apply(makeGraph(), [{
      kind: "deleteNode",
      node: existing("code_a"),
      expectedChildren: [],
      expectedIncidentEdgeIds: [],
      ownershipImpact: [{ path: "src/a.ts", disposition: "remove", expectedRemainingNodeIds: [] }],
    }]);
    expect(result.graph.nodes.some((node) => node.id === "code_a")).toBe(false);
    expect(result.graph.fileIndex).toEqual([]);
    expect(result.graph.nodes.find((node) => node.id === "component_a")?.children).toEqual([]);
  });

  it("rejects stale hashes", async () => {
    const graph = makeGraph();
    const changeSet = await makeChangeSet(graph, [{ kind: "updateNodeFields", node: existing("component_a"), fields: { name: "x" } }]);
    graph.projectName = "concurrent edit";
    await expect(applyGraphChangeSet({ graph, changeSet, idFactory: ids })).rejects.toMatchObject({ code: "stale_graph" });
  });

  it("rejects hierarchy cycles and illegal level transitions", async () => {
    await expect(apply(makeGraph(), [{ kind: "moveNode", node: existing("root"), newParent: existing("code_a") }])).rejects.toMatchObject({ code: "hierarchy_cycle" });
    await expect(apply(makeGraph(), [{ kind: "moveNode", node: existing("code_a"), newParent: existing("container_a") }])).rejects.toMatchObject({ code: "illegal_hierarchy" });
  });

  it("rejects dangling and duplicate edges", async () => {
    const dangling = makeGraph();
    dangling.edges.push(makeEdge("bad", "component_a", "missing"));
    await expect(apply(dangling, [{ kind: "updateNodeFields", node: existing("component_a"), fields: { name: "x" } }])).rejects.toMatchObject({ code: "dangling_edge" });

    const duplicate = makeGraph();
    duplicate.edges.push(makeEdge("one", "component_a", "code_a"));
    await expect(apply(duplicate, [{
      kind: "addEdge", tempRef: "two", source: existing("component_a"), target: existing("code_a"), relation: "uses", label: "uses", evidence: "test",
    }])).rejects.toMatchObject({ code: "duplicate_edge" });
  });

  it("rejects linked-file and file-index ownership inconsistencies", async () => {
    const unknownOwner = makeGraph();
    unknownOwner.fileIndex[0]!.nodeIds = ["missing"];
    await expect(apply(unknownOwner, [{ kind: "updateNodeFields", node: existing("component_a"), fields: { name: "x" } }])).rejects.toMatchObject({ code: "ownership_mismatch" });

    const graph = makeGraph();
    graph.fileIndex.push(makeFile("src/new.ts", []));
    await expect(apply(graph, [{
      kind: "addNode", tempRef: "bad", parent: existing("component_a"),
      node: { type: "capability", name: "Bad", status: "active", description: "", summary: "", responsibility: "bad", elementType: "code_element", level: "code", layer: "code", linkedFiles: [{ path: "missing.ts", role: "primary" }], tags: [] },
    }])).rejects.toMatchObject({ code: "ownership_mismatch" });
  });

  it("rejects under-specified deletion closure and ownership impact", async () => {
    await expect(apply(makeGraph(), [{
      kind: "deleteNode", node: existing("component_a"), expectedChildren: [], expectedIncidentEdgeIds: [], ownershipImpact: [],
    }])).rejects.toMatchObject({ code: "incomplete_delete" });
    await expect(apply(makeGraph(), [{
      kind: "deleteNode", node: existing("code_a"), expectedChildren: [], expectedIncidentEdgeIds: [], ownershipImpact: [],
    }])).rejects.toMatchObject({ code: "incomplete_delete" });
  });

  it("rejects deleting nodes still referenced by the semantic tree", async () => {
    const graph = makeGraph();
    const changeSet = await makeChangeSet(graph, [{
      kind: "deleteNode", node: existing("code_a"), expectedChildren: [], expectedIncidentEdgeIds: [],
      ownershipImpact: [{ path: "src/a.ts", disposition: "remove", expectedRemainingNodeIds: [] }],
    }]);
    await expect(applyGraphChangeSet({
      graph, changeSet, idFactory: ids,
      references: { semanticTree: { version: "0.1.0", projectId: "project", generatedAt: "2026-01-01", roots: [{ id: "tree", label: "a", kind: "file", path: "src/a.ts", sourceNodeId: "code_a", status: "normal", children: [] }] } },
    })).rejects.toMatchObject({ code: "dangling_external_reference" });
  });

  it("rejects duplicate temp refs and colliding server IDs", async () => {
    const graph = makeGraph();
    graph.fileIndex.push(makeFile("src/new.ts", []), makeFile("src/new2.ts", []));
    const node = (tempRef: string, path: string) => ({
      kind: "addNode" as const, tempRef, parent: existing("component_a"),
      node: { type: "capability" as const, name: "New", status: "active" as const, description: "", summary: "", responsibility: "new", elementType: "code_element" as const, level: "code" as const, layer: "code", linkedFiles: [{ path, role: "primary" as const }], tags: [] },
    });
    await expect(apply(graph, [node("same", "src/new.ts"), node("same", "src/new2.ts")])).rejects.toMatchObject({ code: "server_id_collision" });
    const changeSet = await makeChangeSet(graph, [node("collision", "src/new.ts")]);
    await expect(applyGraphChangeSet({ graph, changeSet, idFactory: { ...ids, nodeId: () => "root" } })).rejects.toMatchObject({ code: "server_id_collision" });
  });

  it("resolves temporary references within the same change set", async () => {
    const graph = makeGraph();
    graph.fileIndex.push(makeFile("src/new.ts", []));
    const result = await apply(graph, [{
      kind: "addNode", tempRef: "new_code", parent: existing("component_a"),
      node: { type: "capability", name: "New", status: "active", description: "", summary: "", responsibility: "new", elementType: "code_element", level: "code", layer: "code", linkedFiles: [{ path: "src/new.ts", role: "primary" }], tags: [] },
    }, {
      kind: "addEdge", tempRef: "new_edge", source: existing("code_a"), target: temporary("new_code"), relation: "uses", label: "uses", evidence: "test",
    }]);
    expect(result.graph.edges[0]?.target).toBe("server_node_new_code");
  });

  it("resolves temporary parent references without trusting operation order", async () => {
    const result = await apply(makeGraph(), [{
      kind: "addNode", tempRef: "new_component", parent: temporary("new_container"),
      node: { type: "capability", name: "Component", status: "active", description: "", summary: "", responsibility: "component", elementType: "component", level: "component", layer: "component", linkedFiles: [], tags: [] },
    }, {
      kind: "addNode", tempRef: "new_container", parent: existing("root"),
      node: { type: "capability", name: "Container", status: "active", description: "", summary: "", responsibility: "container", elementType: "container", level: "container", layer: "container", linkedFiles: [], tags: [] },
    }]);
    expect(result.graph.nodes.find((node) => node.id === "server_node_new_component")?.parentId).toBe("server_node_new_container");
  });

  it("requires every incident edge in a deletion declaration", async () => {
    const graph = makeGraph();
    graph.edges.push(makeEdge("incident", "component_a", "code_a"));
    await expect(apply(graph, [{
      kind: "deleteNode", node: existing("code_a"), expectedChildren: [], expectedIncidentEdgeIds: [],
      ownershipImpact: [{ path: "src/a.ts", disposition: "remove", expectedRemainingNodeIds: [] }],
    }])).rejects.toMatchObject({ code: "incomplete_delete" });
  });

  it("includes newly-added incident edges in the deletion declaration check", async () => {
    await expect(apply(makeGraph(), [{
      kind: "addEdge",
      tempRef: "late_incident",
      source: existing("component_a"),
      target: existing("code_a"),
      relation: "uses",
      label: "late incident",
      evidence: "test",
    }, {
      kind: "deleteNode",
      node: existing("code_a"),
      expectedChildren: [],
      expectedIncidentEdgeIds: [],
      ownershipImpact: [{
        path: "src/a.ts",
        disposition: "remove",
        expectedRemainingNodeIds: [],
      }],
    }])).rejects.toMatchObject({ code: "incomplete_delete" });
  });

  it("rejects deleting nodes still referenced by map content", async () => {
    const graph = makeGraph();
    const changeSet = await makeChangeSet(graph, [{
      kind: "deleteNode", node: existing("code_a"), expectedChildren: [], expectedIncidentEdgeIds: [],
      ownershipImpact: [{ path: "src/a.ts", disposition: "remove", expectedRemainingNodeIds: [] }],
    }]);
    await expect(applyGraphChangeSet({
      graph, changeSet, idFactory: ids,
      references: { mapContent: {
        version: "0.2.0", projectId: "project", workGroups: [], workGroupSeq: 0,
        artifacts: [{ id: "note", type: "note", scope: "node", nodeId: "code_a", position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, note: { body: "note" }, createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
      } },
    })).rejects.toMatchObject({ code: "dangling_external_reference" });
  });

  it("produces stable content hashes that change with graph content", async () => {
    const graph = makeGraph();
    expect(await computeProjectGraphHash(graph)).toBe(await computeProjectGraphHash(structuredClone(graph)));
    const changed = structuredClone(graph);
    changed.nodes[0]!.summary = "tampered";
    expect(await computeProjectGraphHash(changed)).not.toBe(await computeProjectGraphHash(graph));
  });
});

async function apply(graph: ProjectGraph, operations: GraphChangeSet["operations"]) {
  return applyGraphChangeSet({ graph, changeSet: await makeChangeSet(graph, operations), idFactory: ids });
}

async function makeChangeSet(graph: ProjectGraph, operations: GraphChangeSet["operations"]): Promise<GraphChangeSet> {
  return { version: "0.1.0", projectId: graph.projectId, baseGraphHash: await computeProjectGraphHash(graph), operations };
}

function makeGraph(): ProjectGraph {
  return {
    version: "0.3.0", projectId: "project", projectName: "Project", projectType: "nextjs-app", analyzedAt: "2026-01-01", analysisStatus: "complete",
    architecture: { notation: "c4", defaultLevel: "component", layers: [
      { id: "context", label: "Context", order: 0, description: "context" },
      { id: "container", label: "Container", order: 1, description: "container" },
      { id: "component", label: "Component", order: 2, description: "component" },
      { id: "code", label: "Code", order: 3, description: "code" },
    ] },
    nodes: [
      makeNode("root", "context", "software_system", null, ["container_a"]),
      makeNode("container_a", "container", "container", "root", ["component_a"]),
      makeNode("component_a", "component", "component", "container_a", ["code_a"]),
      { ...makeNode("code_a", "code", "code_element", "component_a", []), linkedFiles: [{ path: "src/a.ts", role: "primary" }] },
    ],
    edges: [], fileRelations: [], fileIndex: [makeFile("src/a.ts", ["code_a"])],
    topology: { rootIds: ["root"], maxDepth: 3, totalNodes: 4 },
  };
}

function makeNode(id: string, level: "context" | "container" | "component" | "code", elementType: "software_system" | "container" | "component" | "code_element", parentId: string | null, children: string[]) {
  return { id, type: "capability" as const, name: id, status: "active" as const, description: id, summary: id, responsibility: id, elementType, level, layer: level, linkedFiles: [], upstream: [], downstream: [], confidence: 1, tags: [], parentId, children, refs: [], depth: 0 };
}

function makeFile(path: string, nodeIds: string[]) {
  return { path, type: "component" as const, nodeIds, imports: [], exports: [], status: "normal" as const };
}

function makeEdge(id: string, source: string, target: string) {
  return { id, source, target, relation: "uses" as const, label: "uses", confidence: 1, evidence: "test" };
}
