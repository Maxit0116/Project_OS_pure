import { describe, expect, it } from "vitest";

import {
  mockAcceptLoopGraphEditOffer,
  mockCompileLoopGraph,
  mockCreateLoopGraph,
  mockDismissLoopGraphEditOffer,
  mockSendLoopAuthoringTurn,
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

describe("mock loop graph edit offer parity", () => {
  it("offers structural diff and blocks stale accept after revision drift", () => {
    const created = mockCreateLoopGraph("proj_edit", "Edit");
    let doc = mockSendLoopAuthoringTurn("proj_edit", created.id, {
      mode: "edit",
      text: "create skeleton graph for checkout",
    });
    expect(doc.pendingGraphEditOffer?.proposedDraft).toBeTruthy();
    expect(doc.pendingGraphEditOffer?.diff?.summaryLines?.length).toBeGreaterThan(0);
    expect(doc.draft.nodes).toHaveLength(0);

    doc = mockUpsertLoopGraph("proj_edit", {
      ...doc,
      draft: {
        ...doc.draft,
        revision: doc.draft.revision + 1,
        graphPrompt: "manual",
      },
    });
    expect(() => mockAcceptLoopGraphEditOffer("proj_edit", doc.id)).toThrow(/stale/i);
    doc = mockDismissLoopGraphEditOffer("proj_edit", doc.id);
    expect(doc.pendingGraphEditOffer).toBeUndefined();
  });

  it("accept without proposedDraft requires confirmed goal", () => {
    const created = mockCreateLoopGraph("proj_empty", "Empty");
    const doc = mockUpsertLoopGraph("proj_empty", {
      ...created,
      pendingGraphEditOffer: {
        reason: "Goal context confirmed. Generate a coarse draft graph?",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(() => mockAcceptLoopGraphEditOffer("proj_empty", doc.id)).toThrow(
      /Confirm a goal/i,
    );
  });
});
