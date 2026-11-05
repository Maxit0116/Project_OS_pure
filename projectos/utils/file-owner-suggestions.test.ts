import { describe, expect, it } from "vitest";

import { suggestOwnersForFile } from "./file-owner-suggestions.js";

const node = (id: string, level: "context" | "container" | "component", paths: string[]) => ({
  id,
  level,
  linkedFiles: paths.map((path) => ({ path, role: "supporting" as const })),
});

const graph = {
  nodes: [
    node("system", "context", ["README.md"]),
    node("ui_kit", "component", ["components/ui/Button.tsx", "components/ui/Card.tsx"]),
    node("layout", "component", ["components/Footer.tsx", "components/Nav.tsx", "components/Sidebar.tsx"]),
    node("team", "component", ["lib/team.ts", "lib/team-roles.ts", "app/team/page.tsx"]),
    node("data", "container", ["lib/db.ts"]),
    node("tooling", "component", ["next.config.js", ".eslintrc.json"]),
  ],
};

describe("suggestOwnersForFile", () => {
  it("prefers the node that owns files in the same folder, deepest folder first", () => {
    // components/ui/Modal.tsx sits next to the UI kit's files and one level above nothing else.
    const result = suggestOwnersForFile(graph, "components/ui/Modal.tsx");
    expect(result.map((s) => s.nodeId)).toEqual(["ui_kit", "layout"]);
    expect(result[0]).toEqual({ nodeId: "ui_kit", sharedDirectory: "components/ui", filesInSharedDirectory: 2 });
    expect(result[1]).toEqual({ nodeId: "layout", sharedDirectory: "components", filesInSharedDirectory: 3 });
  });

  it("breaks a tie on folder depth by how many files sit there, then component before container", () => {
    const result = suggestOwnersForFile(graph, "lib/validators.ts");
    // team has two files in lib/, data has one (and is a container).
    expect(result.map((s) => s.nodeId)).toEqual(["team", "data"]);
  });

  it("matches a top-level file only with nodes that own other top-level files", () => {
    expect(suggestOwnersForFile(graph, "tsconfig.json").map((s) => s.nodeId)).toEqual(["tooling"]);
    expect(suggestOwnersForFile(graph, "tsconfig.json")[0]?.sharedDirectory).toBe("");
  });

  it("never suggests the project context node", () => {
    expect(suggestOwnersForFile(graph, "README2.md").map((s) => s.nodeId)).not.toContain("system");
  });

  it("offers nothing when no node owns anything near the file", () => {
    expect(suggestOwnersForFile(graph, "scripts/deploy/release.sh")).toEqual([]);
  });

  it("returns at most the requested number of suggestions", () => {
    expect(suggestOwnersForFile(graph, "components/ui/Modal.tsx", 1)).toHaveLength(1);
  });
});
