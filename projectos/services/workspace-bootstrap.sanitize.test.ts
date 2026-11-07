import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  FileEntrySchema,
  FileRelationSchema,
  FunctionalEdgeSchema,
  FunctionalNodeSchema,
  ProjectGraphSchema,
  type ProjectGraph,
} from "../contracts/graph.js";
import { sanitizeLegacyProjectGraph } from "./workspace-bootstrap.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");
const committedGraph = ProjectGraphSchema.parse(
  JSON.parse(
    readFileSync(resolve("client", "sample-projectos-fixtures", "graph.json"), "utf8"),
  ),
);
const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** The curated sample graph with every optional field the schema defines switched on. */
function fullyPopulatedGraph(): ProjectGraph {
  const graph = structuredClone(committedGraph);
  const [firstNode, secondNode] = graph.nodes;
  if (!firstNode || !secondNode) throw new Error("sample graph is expected to have nodes");
  graph.authored = true;
  graph.version = "0.4.0";
  graph.nodes = graph.nodes.map((node, index) =>
    index === 0
      ? {
          ...node,
          standalone: true,
          owners: ["platform-team"],
          notes: "Hand-written note.",
          openQuestions: ["Who owns billing?"],
          sourceKind: "authored" as const,
        }
      : node);
  graph.edges = graph.edges.map((edge, index) =>
    index === 0 ? { ...edge, sourceKind: "authored" as const } : edge);
  graph.views = [
    {
      key: "authored-overview",
      title: "Authored overview",
      level: "container",
      parentId: firstNode.id,
      focusNodeId: secondNode.id,
      includeNodeIds: [firstNode.id, secondNode.id],
      excludeNodeIds: [],
      locked: true,
      sourceKind: "authored",
    },
  ];
  return ProjectGraphSchema.parse(graph);
}

describe("sanitizeLegacyProjectGraph", () => {
  it("passes a valid, fully populated graph through unchanged", () => {
    const graph = fullyPopulatedGraph();
    const sanitized = sanitizeLegacyProjectGraph(structuredClone(graph), {
      workspaceRoot: sampleWorkspaceRoot,
      projectId: graph.projectId,
    });
    // Authored content (the lock flag, views, owners, notes, questions, provenance)
    // is exactly what a repair must never destroy.
    expect(sanitized).toEqual(graph);
  });

  it("knows every field of the schemas it filters, so a new schema field cannot be silently dropped", () => {
    const graph = fullyPopulatedGraph();
    const sanitized = sanitizeLegacyProjectGraph(structuredClone(graph), {
      workspaceRoot: sampleWorkspaceRoot,
      projectId: graph.projectId,
    });
    const keysOf = (records: Array<Record<string, unknown>> | undefined) =>
      new Set((records ?? []).flatMap((record) => Object.keys(record)));
    const kept = {
      node: keysOf(sanitized?.nodes),
      edge: keysOf(sanitized?.edges),
      file: keysOf(sanitized?.fileIndex),
      relation: keysOf(sanitized?.fileRelations),
    };
    const authoredNode = sanitized?.nodes[0];
    expect(Object.keys(authoredNode ?? {})).toEqual(
      expect.arrayContaining(["standalone", "owners", "notes", "openQuestions", "sourceKind"]),
    );
    for (const key of ["id", "source", "target", "relation", "confidence", "sourceKind"]) {
      expect(kept.edge.has(key)).toBe(true);
    }
    // Everything the sample uses from each schema survives.
    for (const [used, schema] of [
      [kept.node, FunctionalNodeSchema],
      [kept.edge, FunctionalEdgeSchema],
      [kept.file, FileEntrySchema],
      [kept.relation, FileRelationSchema],
    ] as const) {
      for (const key of used) expect(Object.keys(schema.shape)).toContain(key);
    }
  });

  it("strips keys the strict schema does not know, at every level", () => {
    const graph = fullyPopulatedGraph();
    const foreign = structuredClone(graph) as unknown as Record<string, unknown> & {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
      views: Array<Record<string, unknown>>;
      fileIndex: Array<Record<string, unknown>>;
    };
    foreign.legacyAnalyzer = { v: 1 };
    foreign.nodes[0]!.coordinates = [1, 2];
    foreign.edges[0]!.weight = 3;
    foreign.views[0]!.color = "red";
    foreign.fileIndex[0]!.hash = "abc";
    const sanitized = sanitizeLegacyProjectGraph(foreign, {
      workspaceRoot: sampleWorkspaceRoot,
      projectId: graph.projectId,
    });
    expect(sanitized).toEqual(graph);
  });

  it("drops a view that points at a node that is not in the graph, keeping the rest", () => {
    const graph = fullyPopulatedGraph();
    const withBadView = structuredClone(graph);
    withBadView.views = [
      ...(graph.views ?? []),
      { key: "ghost", title: "Ghost", level: "container", focusNodeId: "node_that_never_existed" },
    ];
    const sanitized = sanitizeLegacyProjectGraph(withBadView, {
      workspaceRoot: sampleWorkspaceRoot,
      projectId: graph.projectId,
    });
    expect(sanitized?.views?.map((view) => view.key)).toEqual(["authored-overview"]);
    expect(sanitized?.authored).toBe(true);
  });

  it("keeps the graph when files disappear, dropping only the relations that pointed at them", () => {
    const graph = fullyPopulatedGraph();
    expect(graph.fileRelations?.length ?? 0).toBeGreaterThan(0);
    const emptyWorkspace = mkdtempSync(join(tmpdir(), "projectos-sanitize-"));
    temporaryRoots.push(emptyWorkspace);
    const sanitized = sanitizeLegacyProjectGraph(structuredClone(graph), {
      workspaceRoot: emptyWorkspace,
      projectId: graph.projectId,
    });
    expect(sanitized).not.toBeNull();
    expect(sanitized?.fileIndex).toEqual([]);
    expect(sanitized?.fileRelations ?? []).toEqual([]);
    // Nothing else about the authored model is lost with the files.
    expect(sanitized?.nodes.map((node) => node.id)).toEqual(graph.nodes.map((node) => node.id));
    expect(sanitized?.authored).toBe(true);
    expect(sanitized?.views).toEqual(graph.views);
  });

  it("rejects input that is not a graph object", () => {
    for (const input of [null, "graph", 3, []]) {
      expect(sanitizeLegacyProjectGraph(input, { workspaceRoot: sampleWorkspaceRoot, projectId: "p" })).toBeNull();
    }
  });
});
