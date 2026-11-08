import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ProjectGraphSchema, type ProjectGraph } from "../contracts/graph.js";
import { assignFileToNode } from "./file-owner-assignment.js";

const graph: ProjectGraph = ProjectGraphSchema.parse(
  JSON.parse(readFileSync(resolve("..", "sample-graph-saas", ".projectos", "graph.json"), "utf8")),
);
const teamNode = graph.nodes.find((node) => node.linkedFiles.some((file) => file.path === "lib/team.ts"))!;
const contextNode = graph.nodes.find((node) => node.level === "context")!;

describe("assignFileToNode", () => {
  it("makes an unowned file owned: linked on the node and indexed to it, and the graph stays valid", () => {
    // lib/validators.ts is one of the 16 files of the curated sample that no node owns.
    expect(graph.fileIndex.find((f) => f.path === "lib/validators.ts")?.nodeIds).toEqual([]);

    const next = assignFileToNode(graph, "lib/validators.ts", teamNode.id);

    expect(next.nodes.find((n) => n.id === teamNode.id)?.linkedFiles).toContainEqual({ path: "lib/validators.ts", role: "supporting" });
    expect(next.fileIndex.find((f) => f.path === "lib/validators.ts")?.nodeIds).toEqual([teamNode.id]);
    expect(() => ProjectGraphSchema.parse(next)).not.toThrow();
  });

  it("does not change the graph it was given", () => {
    const before = JSON.stringify(graph);
    assignFileToNode(graph, "lib/validators.ts", teamNode.id);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it("indexes a file the last scan did not know about", () => {
    const next = assignFileToNode(graph, "lib/brand-new.ts", teamNode.id);
    expect(next.fileIndex.find((f) => f.path === "lib/brand-new.ts")).toMatchObject({ nodeIds: [teamNode.id], type: "other" });
    expect(() => ProjectGraphSchema.parse(next)).not.toThrow();
  });

  it("refuses a file that already has an owner, naming it", () => {
    expect(() => assignFileToNode(graph, "lib/team.ts", teamNode.id)).toThrowError(
      expect.objectContaining({ code: "file_already_owned" }),
    );
  });

  it("refuses the whole-project node and an unknown node", () => {
    expect(() => assignFileToNode(graph, "lib/validators.ts", contextNode.id)).toThrowError(
      expect.objectContaining({ code: "invalid_file_owner" }),
    );
    expect(() => assignFileToNode(graph, "lib/validators.ts", "no_such_node")).toThrowError(
      expect.objectContaining({ code: "node_not_found" }),
    );
  });
});
