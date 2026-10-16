import { describe, expect, it } from "vitest";
import type { FunctionalEdge, FunctionalNode } from "../../contracts/graph.js";
import {
  liftRelationshipsToVisibleAncestors,
  mergeArchitectureViews,
  synthesizeDefaultArchitectureViews,
} from "./index.js";

function node(
  id: string,
  level: FunctionalNode["level"],
  parentId?: string,
  elementType?: FunctionalNode["elementType"],
): FunctionalNode {
  return {
    id,
    type: "capability",
    name: id,
    status: "active",
    description: id,
    summary: id,
    responsibility: id,
    elementType:
      elementType ??
      (level === "context" ? "software_system" : level === "code" ? "code_element" : level),
    level,
    layer: "application",
    linkedFiles:
      level === "component"
        ? [{ path: `${id}.ts`, role: "primary" }]
        : [],
    upstream: [],
    downstream: [],
    confidence: 1,
    tags: [],
    parentId,
  };
}

describe("c4-architecture-views", () => {
  it("synthesizes stable default views", () => {
    const views = synthesizeDefaultArchitectureViews([
      node("system", "context", undefined, "software_system"),
      node("web", "container", "system", "container"),
      node("identity", "component", "web", "component"),
    ]);
    expect(views.map((view) => view.key)).toEqual([
      "view_context",
      "view_container_system",
      "view_component_web",
      "view_code_identity",
    ]);
  });

  it("preserves locked views on regenerate", () => {
    const generated = synthesizeDefaultArchitectureViews([
      node("system", "context", undefined, "software_system"),
    ]);
    const merged = mergeArchitectureViews({
      existing: [
        {
          key: "custom",
          title: "Custom",
          level: "context",
          locked: true,
          sourceKind: "authored",
        },
      ],
      generated,
      mode: "regenerate",
    });
    expect(merged.some((view) => view.key === "custom")).toBe(true);
    expect(merged.some((view) => view.key === "view_context")).toBe(true);
  });

  it("lifts relationships to visible ancestors", () => {
    const nodes = [
      node("system", "context", undefined, "software_system"),
      node("ext", "context", undefined, "external_system"),
      node("web", "container", "system", "container"),
    ];
    const edges: FunctionalEdge[] = [
      {
        id: "e1",
        source: "web",
        target: "ext",
        relation: "uses",
        label: "Calls",
        confidence: 1,
      },
    ];
    const lifted = liftRelationshipsToVisibleAncestors(
      nodes,
      edges,
      new Set(["system", "ext"]),
    );
    expect(lifted).toHaveLength(1);
    expect(lifted[0]?.source).toBe("system");
    expect(lifted[0]?.target).toBe("ext");
  });
});
