import { describe, expect, it } from "vitest";

import type { ProjectGraph } from "../../contracts/graph.js";
import { dropPlannersThatCannotDelegate, type HierarchyPlanTarget } from "./index.js";

// Shaped like the live sample: a database container with no components under it, whose schema file is
// owned by a component that sits under the web container.
const graph = {
  nodes: [
    { id: "system", level: "context", children: ["web", "db"], linkedFiles: [] },
    { id: "web", level: "container", children: ["feat_team", "feat_database", "feat_empty"], linkedFiles: [] },
    { id: "db", level: "container", children: [], linkedFiles: [{ path: "prisma/schema.prisma" }] },
    { id: "feat_team", level: "component", children: [], linkedFiles: [] },
    { id: "feat_database", level: "component", children: [], linkedFiles: [] },
    { id: "feat_empty", level: "component", children: [], linkedFiles: [] },
  ],
  fileIndex: [
    { path: "lib/team.ts", nodeIds: ["feat_team"] },
    { path: "prisma/schema.prisma", nodeIds: ["feat_database"] },
  ],
} as unknown as ProjectGraph;

const planner = (level: "context" | "container" | "component", allowedIds: string[]): HierarchyPlanTarget =>
  ({ kind: "planner", level, allowedIds });

describe("dropPlannersThatCannotDelegate", () => {
  it("does not offer a container that has no components, so its planner cannot be sent into a dead end", () => {
    expect(dropPlannersThatCannotDelegate(planner("container", ["web", "db"]), graph))
      .toEqual(planner("container", ["web"]));
  });

  it("does not offer a component that owns no file", () => {
    expect(dropPlannersThatCannotDelegate(planner("component", ["feat_team", "feat_database", "feat_empty"]), graph))
      .toEqual(planner("component", ["feat_team", "feat_database"]));
  });

  it("leaves the list alone when every candidate is a dead end, so the failure is not hidden", () => {
    const only = planner("container", ["db"]);
    expect(dropPlannersThatCannotDelegate(only, graph)).toBe(only);
  });

  it("leaves a list with nothing to drop, the top level, and file targets alone", () => {
    const fine = planner("container", ["web"]);
    expect(dropPlannersThatCannotDelegate(fine, graph)).toBe(fine);
    const top = planner("context", ["system"]);
    expect(dropPlannersThatCannotDelegate(top, graph)).toBe(top);
    const files: HierarchyPlanTarget = { kind: "leaf-file", allowedIds: ["lib/team.ts"] };
    expect(dropPlannersThatCannotDelegate(files, graph)).toBe(files);
  });

  it("keeps an id the graph does not know, for the later checks to refuse in their own words", () => {
    expect(dropPlannersThatCannotDelegate(planner("container", ["web", "ghost"]), graph))
      .toEqual(planner("container", ["web", "ghost"]));
  });
});
