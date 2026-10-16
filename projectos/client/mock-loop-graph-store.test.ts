import { describe, expect, it } from "vitest";

import {
  mockCompileLoopGraph,
  mockCreateLoopGraph,
  mockUpsertLoopGraph,
} from "./mock-loop-graph-store.js";

describe("mockCompileLoopGraph readiness", () => {
  it("rejects incomplete drafts and accepts ready ones", () => {
    const created = mockCreateLoopGraph("proj_ready", "Loop");
    const incomplete = mockUpsertLoopGraph("proj_ready", {
      ...created,
      draft: {
        revision: 1,
        graphPrompt: "Ship",
        nodes: [
          {
            id: "n1",
            title: "Untitled",
            prompt: "",
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
    });

    expect(() => mockCompileLoopGraph("proj_ready", incomplete.id)).toThrow(
      /description/i,
    );

    const ready = mockUpsertLoopGraph("proj_ready", {
      ...incomplete,
      draft: {
        revision: 2,
        graphPrompt: "Ship",
        nodes: [
          {
            id: "n1",
            title: "Implement",
            prompt: "Build login",
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
    });
    const result = mockCompileLoopGraph("proj_ready", ready.id);
    expect(result.specDraft.nodes).toHaveLength(1);
  });
});
