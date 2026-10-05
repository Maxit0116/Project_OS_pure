import { describe, expect, it } from "vitest";

import type { MapArtifact, MapContentDocument } from "./map-content.js";
import {
  MapWorkGroupMutationInputSchema,
  applyMapWorkGroupMutation,
  arrangeWorkGroupMembersInColumn,
  buildAdjacencyGraph,
  collectCanvasUnitBounds,
  computeWorkGroupAppendAnchor,
  computeWorkGroupColumnPositions,
  computeWorkGroupFrameBounds,
  computeWorkGroupResizeDeltas,
  isValidWorkGroupLayout,
  nextWorkGroupTitle,
  orderNewWorkGroupMemberIdsBySelection,
  propagateWorkGroupMemberResize,
  resolveWorkGroupColumnOrigin,
  WORK_GROUP_MEMBER_GAP,
  WORK_GROUP_PADDING,
  WORK_GROUP_TITLE_BAR_HEIGHT,
  type BoundsRect,
} from "./map-work-group.js";

const base = {
  scope: "project" as const,
  position: { x: 0, y: 0 },
  size: { width: 100, height: 100 },
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
};

function noteArtifact(
  id: string,
  position: { x: number; y: number },
  workGroupId?: string,
): MapArtifact {
  return {
    ...base,
    id,
    type: "note",
    note: { body: id },
    position,
    workGroupId,
  };
}

function emptyDocument(artifacts: MapArtifact[] = []): MapContentDocument {
  return {
    version: "0.2.0",
    projectId: "proj_test",
    artifacts,
    workGroups: [],
    workGroupSeq: 0,
  };
}

describe("map-work-group", () => {
  it("builds adjacency for touching edges", () => {
    const bounds: BoundsRect[] = [
      { id: "a", x: 0, y: 0, width: 100, height: 100 },
      { id: "b", x: 100, y: 0, width: 100, height: 100 },
      { id: "c", x: 0, y: 200, width: 100, height: 100 },
    ];
    const graph = buildAdjacencyGraph(bounds);
    expect(graph.get("a")?.has("b")).toBe(true);
    expect(graph.get("a")?.has("c")).toBe(false);
    expect(graph.get("b")?.has("a")).toBe(true);
  });

  it("accepts L-shaped layouts", () => {
    const bounds: BoundsRect[] = [
      { id: "a", x: 0, y: 0, width: 100, height: 100 },
      { id: "b", x: 100, y: 0, width: 100, height: 100 },
      { id: "c", x: 0, y: 100, width: 100, height: 100 },
    ];
    expect(isValidWorkGroupLayout(bounds)).toBe(true);
  });

  it("rejects hollow square layouts", () => {
    const bounds: BoundsRect[] = [
      { id: "a", x: 0, y: 0, width: 100, height: 100 },
      { id: "b", x: 200, y: 0, width: 100, height: 100 },
      { id: "c", x: 200, y: 200, width: 100, height: 100 },
      { id: "d", x: 0, y: 200, width: 100, height: 100 },
    ];
    expect(isValidWorkGroupLayout(bounds)).toBe(false);
  });

  it("creates a workgroup on snap join", () => {
    const doc = emptyDocument([
      noteArtifact("art_a", { x: 0, y: 0 }),
      noteArtifact("art_b", { x: 140, y: 0 }),
    ]);
    const next = applyMapWorkGroupMutation(
      doc,
      {
        type: "snap_join",
        draggedMemberNodeId: "art_b",
        targetMemberNodeId: "art_a",
        position: { x: 100, y: 0 },
      },
      { createWorkGroupId: () => "wg_test" },
    );
    expect(next.workGroups).toHaveLength(1);
    expect(next.workGroups[0]?.memberNodeIds).toEqual(["art_b", "art_a"]);
    expect(next.workGroups[0]?.title).toBe(nextWorkGroupTitle(1));
    expect(next.artifacts.every((artifact) => artifact.workGroupId === "wg_test")).toBe(
      true,
    );
  });

  it("dissolves a workgroup when one member remains after detach", () => {
    const doc: MapContentDocument = {
      ...emptyDocument([
        noteArtifact("art_a", { x: 0, y: 0 }, "wg_test"),
        noteArtifact("art_b", { x: 100, y: 0 }, "wg_test"),
      ]),
      workGroups: [
        {
          id: "wg_test",
          title: "Workgroup 1",
          memberNodeIds: ["art_a", "art_b"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
      ],
      workGroupSeq: 1,
    };
    const next = applyMapWorkGroupMutation(doc, {
      type: "detach",
      memberNodeId: "art_b",
      position: { x: 260, y: 0 },
    });
    expect(next.workGroups).toHaveLength(0);
    expect(next.artifacts.find((artifact) => artifact.id === "art_a")?.workGroupId).toBe(
      undefined,
    );
  });

  it("splits into two workgroups when detach breaks connectivity with two clusters", () => {
    const doc: MapContentDocument = {
      ...emptyDocument([
        noteArtifact("art_a", { x: 0, y: 0 }, "wg_test"),
        noteArtifact("art_b", { x: 100, y: 0 }, "wg_test"),
        noteArtifact("art_c", { x: 0, y: 100 }, "wg_test"),
        noteArtifact("art_d", { x: 100, y: 100 }, "wg_test"),
      ]),
      workGroups: [
        {
          id: "wg_test",
          title: "Workgroup 1",
          memberNodeIds: ["art_a", "art_b", "art_c", "art_d"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
      ],
      workGroupSeq: 1,
    };
    let seq = 1;
    const next = applyMapWorkGroupMutation(
      doc,
      {
        type: "detach",
        memberNodeId: "art_b",
        position: { x: 300, y: 0 },
      },
      { createWorkGroupId: () => `wg_new_${++seq}` },
    );
    expect(next.workGroups.length).toBeGreaterThanOrEqual(1);
    const bounds = collectCanvasUnitBounds(next.artifacts, next.workGroups[0]!.memberNodeIds);
    expect(isValidWorkGroupLayout(bounds)).toBe(true);
  });

  it("creates a single-member workgroup via merge_or_create_group", () => {
    const doc = emptyDocument([noteArtifact("art_a", { x: 0, y: 0 })]);
    const next = applyMapWorkGroupMutation(
      doc,
      {
        type: "merge_or_create_group",
        items: [{ kind: "member", memberNodeId: "art_a" }],
      },
      { createWorkGroupId: () => "wg_single" },
    );
    expect(next.workGroups).toHaveLength(1);
    expect(next.workGroups[0]?.memberNodeIds).toEqual(["art_a"]);
    expect(next.artifacts[0]?.workGroupId).toBe("wg_single");
  });

  it("creates a workgroup from two loose members via merge_or_create_group", () => {
    const doc = emptyDocument([
      noteArtifact("art_a", { x: 0, y: 0 }),
      noteArtifact("art_b", { x: 100, y: 0 }),
    ]);
    const next = applyMapWorkGroupMutation(
      doc,
      {
        type: "merge_or_create_group",
        items: [
          { kind: "member", memberNodeId: "art_a" },
          { kind: "member", memberNodeId: "art_b" },
        ],
      },
      { createWorkGroupId: () => "wg_pair" },
    );
    expect(next.workGroups).toHaveLength(1);
    expect(next.workGroups[0]?.memberNodeIds.sort()).toEqual(["art_a", "art_b"]);
  });

  it("merges a loose member into an existing workgroup", () => {
    const doc: MapContentDocument = {
      ...emptyDocument([
        noteArtifact("art_a", { x: 0, y: 0 }, "wg_a"),
        noteArtifact("art_b", { x: 100, y: 0 }),
      ]),
      workGroups: [
        {
          id: "wg_a",
          title: "Group A",
          memberNodeIds: ["art_a"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
      ],
      workGroupSeq: 1,
    };
    const next = applyMapWorkGroupMutation(doc, {
      type: "merge_or_create_group",
      items: [
        { kind: "workgroup", workGroupId: "wg_a" },
        { kind: "member", memberNodeId: "art_b" },
      ],
    });
    expect(next.workGroups).toHaveLength(1);
    expect(next.workGroups[0]?.memberNodeIds.sort()).toEqual(["art_a", "art_b"]);
    expect(next.artifacts.find((artifact) => artifact.id === "art_b")?.workGroupId).toBe(
      "wg_a",
    );
  });

  it("appends distant loose members below an existing workgroup without moving anchored members", () => {
    const doc: MapContentDocument = {
      ...emptyDocument([
        noteArtifact("art_a", { x: 40, y: 20 }, "wg_a"),
        noteArtifact("art_b", { x: 140, y: 20 }, "wg_a"),
        noteArtifact("art_c", { x: 500, y: 300 }),
        noteArtifact("art_d", { x: 700, y: 500 }),
      ]),
      workGroups: [
        {
          id: "wg_a",
          title: "Group A",
          memberNodeIds: ["art_a", "art_b"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
      ],
      workGroupSeq: 1,
    };
    const next = applyMapWorkGroupMutation(doc, {
      type: "merge_or_create_group",
      items: [
        { kind: "workgroup", workGroupId: "wg_a" },
        { kind: "member", memberNodeId: "art_c" },
        { kind: "member", memberNodeId: "art_d" },
      ],
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_a")?.position).toEqual({
      x: 40,
      y: 20,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_b")?.position).toEqual({
      x: 140,
      y: 20,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_c")?.position).toEqual({
      x: 40,
      y: 120 + WORK_GROUP_MEMBER_GAP,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_d")?.position).toEqual({
      x: 40,
      y: 220 + WORK_GROUP_MEMBER_GAP * 2,
    });
    const bounds = collectCanvasUnitBounds(next.artifacts, next.workGroups[0]!.memberNodeIds);
    expect(isValidWorkGroupLayout(bounds)).toBe(true);
  });

  it("merges two workgroups using the first selected group as primary", () => {
    const doc: MapContentDocument = {
      ...emptyDocument([
        noteArtifact("art_a", { x: 0, y: 0 }, "wg_a"),
        noteArtifact("art_b", { x: 100, y: 0 }, "wg_a"),
        noteArtifact("art_c", { x: 500, y: 300 }, "wg_b"),
        noteArtifact("art_d", { x: 700, y: 400 }, "wg_b"),
      ]),
      workGroups: [
        {
          id: "wg_a",
          title: "Primary",
          memberNodeIds: ["art_a", "art_b"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
        {
          id: "wg_b",
          title: "Secondary",
          memberNodeIds: ["art_c", "art_d"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
      ],
      workGroupSeq: 2,
    };
    const next = applyMapWorkGroupMutation(doc, {
      type: "merge_or_create_group",
      items: [
        { kind: "workgroup", workGroupId: "wg_a" },
        { kind: "workgroup", workGroupId: "wg_b" },
      ],
    });
    expect(next.workGroups).toHaveLength(1);
    expect(next.workGroups[0]?.id).toBe("wg_a");
    expect(next.workGroups[0]?.title).toBe("Primary");
    expect(next.workGroups[0]?.memberNodeIds.sort()).toEqual([
      "art_a",
      "art_b",
      "art_c",
      "art_d",
    ]);
    expect(next.artifacts.find((artifact) => artifact.id === "art_a")?.position).toEqual({
      x: 0,
      y: 0,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_b")?.position).toEqual({
      x: 100,
      y: 0,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_c")?.position).toEqual({
      x: 0,
      y: 100 + WORK_GROUP_MEMBER_GAP,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_d")?.position).toEqual({
      x: 0,
      y: 200 + WORK_GROUP_MEMBER_GAP * 2,
    });
  });

  it("no-ops merge_or_create_group with empty items", () => {
    const doc = emptyDocument([noteArtifact("art_a", { x: 0, y: 0 })]);
    const next = applyMapWorkGroupMutation(doc, {
      type: "merge_or_create_group",
      items: [],
    });
    expect(next).toEqual(doc);
  });

  it("arranges members in a vertical column", () => {
    const doc = emptyDocument([
      noteArtifact("art_a", { x: 0, y: 0 }),
      noteArtifact("art_b", { x: 400, y: 0 }),
    ]);
    const next = arrangeWorkGroupMembersInColumn(doc.artifacts, ["art_a", "art_b"], {
      x: 50,
      y: 80,
    });
    expect(next.find((artifact) => artifact.id === "art_a")?.position).toEqual({
      x: 50,
      y: 80,
    });
    expect(next.find((artifact) => artifact.id === "art_b")?.position).toEqual({
      x: 50,
      y: 180 + WORK_GROUP_MEMBER_GAP,
    });
    const bounds = collectCanvasUnitBounds(next, ["art_a", "art_b"]);
    expect(isValidWorkGroupLayout(bounds)).toBe(true);
  });

  it("resolves column origin from member union bounds", () => {
    const doc = emptyDocument([
      noteArtifact("art_a", { x: 20, y: 30 }),
      noteArtifact("art_b", { x: 500, y: 700 }),
    ]);
    expect(resolveWorkGroupColumnOrigin(doc.artifacts, ["art_a", "art_b"])).toEqual({
      x: 20,
      y: 30,
    });
  });

  it("computes stacked column positions", () => {
    const doc = emptyDocument([
      noteArtifact("art_a", { x: 0, y: 0 }),
      noteArtifact("art_b", { x: 0, y: 0 }),
      noteArtifact("art_c", { x: 0, y: 0 }),
    ]);
    const positions = computeWorkGroupColumnPositions(doc.artifacts, ["art_a", "art_b", "art_c"], {
      x: 10,
      y: 20,
    });
    expect(positions.get("art_a")).toEqual({ x: 10, y: 20 });
    expect(positions.get("art_b")).toEqual({ x: 10, y: 120 + WORK_GROUP_MEMBER_GAP });
    expect(positions.get("art_c")).toEqual({
      x: 10,
      y: 220 + WORK_GROUP_MEMBER_GAP * 2,
    });
  });

  it("computes append anchor from anchored members", () => {
    const doc = emptyDocument([
      noteArtifact("art_a", { x: 40, y: 20 }),
      noteArtifact("art_b", { x: 140, y: 20 }),
    ]);
    expect(computeWorkGroupAppendAnchor(doc.artifacts, ["art_a", "art_b"])).toEqual({
      x: 40,
      y: 120 + WORK_GROUP_MEMBER_GAP,
    });
  });

  it("left-aligns append anchor to the bottommost member, not the group minX", () => {
    const doc = emptyDocument([
      {
        ...noteArtifact("art_a", { x: 0, y: 0 }),
        size: { width: 100, height: 100 },
      },
      {
        ...noteArtifact("art_b", { x: 100, y: 0 }),
        size: { width: 100, height: 200 },
      },
    ]);
    // Bottommost card is art_b (bottom=200); align to its left edge (100), not art_a's 0.
    expect(computeWorkGroupAppendAnchor(doc.artifacts, ["art_a", "art_b"])).toEqual({
      x: 100,
      y: 200 + WORK_GROUP_MEMBER_GAP,
    });
  });

  it("left-aligns an already-adjacent but offset member when merging into a workgroup", () => {
    const doc: MapContentDocument = {
      ...emptyDocument([
        noteArtifact("art_a", { x: 0, y: 0 }, "wg_a"),
        noteArtifact("art_b", { x: 100, y: 0 }, "wg_a"),
        // Already touching the group bottom, but horizontally offset (not left-aligned).
        noteArtifact("art_c", { x: 40, y: 100 }),
      ]),
      workGroups: [
        {
          id: "wg_a",
          title: "Group A",
          memberNodeIds: ["art_a", "art_b"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
      ],
      workGroupSeq: 1,
    };
    const next = applyMapWorkGroupMutation(doc, {
      type: "merge_or_create_group",
      items: [
        { kind: "workgroup", workGroupId: "wg_a" },
        { kind: "member", memberNodeId: "art_c" },
      ],
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_a")?.position).toEqual({
      x: 0,
      y: 0,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_b")?.position).toEqual({
      x: 100,
      y: 0,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_c")?.position).toEqual({
      x: 0,
      y: 100 + WORK_GROUP_MEMBER_GAP,
    });
  });

  it("orders newly appended members by selection", () => {
    const doc: MapContentDocument = {
      ...emptyDocument([
        noteArtifact("art_a", { x: 0, y: 0 }, "wg_a"),
        noteArtifact("art_b", { x: 100, y: 0 }, "wg_b"),
        noteArtifact("art_c", { x: 200, y: 0 }),
      ]),
      workGroups: [
        {
          id: "wg_a",
          title: "Primary",
          memberNodeIds: ["art_a"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
        {
          id: "wg_b",
          title: "Secondary",
          memberNodeIds: ["art_b"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
      ],
      workGroupSeq: 2,
    };
    expect(
      orderNewWorkGroupMemberIdsBySelection(
        doc,
        [
          { kind: "workgroup", workGroupId: "wg_a" },
          { kind: "member", memberNodeId: "art_c" },
          { kind: "workgroup", workGroupId: "wg_b" },
        ],
        "wg_a",
        ["art_b", "art_c"],
      ),
    ).toEqual(["art_c", "art_b"]);
  });

  it("auto-arranges non-adjacent members into a column on merge_or_create_group", () => {
    const doc = emptyDocument([
      noteArtifact("art_a", { x: 0, y: 0 }),
      noteArtifact("art_b", { x: 400, y: 0 }),
    ]);
    const next = applyMapWorkGroupMutation(doc, {
      type: "merge_or_create_group",
      items: [
        { kind: "member", memberNodeId: "art_a" },
        { kind: "member", memberNodeId: "art_b" },
      ],
    });
    expect(next.workGroups).toHaveLength(1);
    expect(next.artifacts.find((artifact) => artifact.id === "art_a")?.position).toEqual({
      x: 0,
      y: 0,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_b")?.position).toEqual({
      x: 0,
      y: 100 + WORK_GROUP_MEMBER_GAP,
    });
    const bounds = collectCanvasUnitBounds(next.artifacts, next.workGroups[0]!.memberNodeIds);
    expect(isValidWorkGroupLayout(bounds)).toBe(true);
  });

  it("places non-adjacent merge_or_create_group at provided origin", () => {
    const doc = emptyDocument([
      noteArtifact("art_a", { x: 0, y: 0 }),
      noteArtifact("art_b", { x: 400, y: 0 }),
    ]);
    const next = applyMapWorkGroupMutation(doc, {
      type: "merge_or_create_group",
      items: [
        { kind: "member", memberNodeId: "art_a" },
        { kind: "member", memberNodeId: "art_b" },
      ],
      origin: { x: 240, y: 360 },
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_a")?.position).toEqual({
      x: 240,
      y: 360,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_b")?.position).toEqual({
      x: 240,
      y: 460 + WORK_GROUP_MEMBER_GAP,
    });
  });

  it("computes resize edge deltas", () => {
    const prev: BoundsRect = { id: "a", x: 0, y: 0, width: 100, height: 100 };
    const next: BoundsRect = { id: "a", x: -20, y: 0, width: 150, height: 100 };
    expect(computeWorkGroupResizeDeltas(prev, next)).toEqual({
      left: -20,
      right: 30,
      top: 0,
      bottom: 0,
    });
  });

  it("pushes east neighbors when widening a horizontal workgroup member", () => {
    const doc: MapContentDocument = {
      ...emptyDocument([
        noteArtifact("art_a", { x: 0, y: 0 }, "wg_a"),
        noteArtifact("art_b", { x: 100, y: 0 }, "wg_a"),
        noteArtifact("art_c", { x: 200, y: 0 }, "wg_a"),
      ]),
      workGroups: [
        {
          id: "wg_a",
          title: "Row",
          memberNodeIds: ["art_a", "art_b", "art_c"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
      ],
      workGroupSeq: 1,
    };
    const next = applyMapWorkGroupMutation(doc, {
      type: "resize_member",
      memberNodeId: "art_a",
      size: { width: 140, height: 100 },
      position: { x: 0, y: 0 },
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_a")?.size).toEqual({
      width: 140,
      height: 100,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_b")?.position).toEqual({
      x: 140,
      y: 0,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_c")?.position).toEqual({
      x: 240,
      y: 0,
    });
    const bounds = collectCanvasUnitBounds(next.artifacts, ["art_a", "art_b", "art_c"]);
    expect(isValidWorkGroupLayout(bounds)).toBe(true);
  });

  it("pushes south neighbors when lengthening a vertical stack", () => {
    const doc: MapContentDocument = {
      ...emptyDocument([
        noteArtifact("art_a", { x: 0, y: 0 }, "wg_a"),
        noteArtifact("art_b", { x: 0, y: 100 }, "wg_a"),
      ]),
      workGroups: [
        {
          id: "wg_a",
          title: "Col",
          memberNodeIds: ["art_a", "art_b"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
      ],
      workGroupSeq: 1,
    };
    const next = applyMapWorkGroupMutation(doc, {
      type: "resize_member",
      memberNodeId: "art_a",
      size: { width: 100, height: 130 },
      position: { x: 0, y: 0 },
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_b")?.position).toEqual({
      x: 0,
      y: 130,
    });
  });

  it("pulls west neighbors when dragging the west edge", () => {
    const doc: MapContentDocument = {
      ...emptyDocument([
        noteArtifact("art_a", { x: 0, y: 0 }, "wg_a"),
        noteArtifact("art_b", { x: 100, y: 0 }, "wg_a"),
      ]),
      workGroups: [
        {
          id: "wg_a",
          title: "Row",
          memberNodeIds: ["art_a", "art_b"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
      ],
      workGroupSeq: 1,
    };
    const next = applyMapWorkGroupMutation(doc, {
      type: "resize_member",
      memberNodeId: "art_b",
      size: { width: 120, height: 100 },
      position: { x: 80, y: 0 },
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_a")?.position).toEqual({
      x: -20,
      y: 0,
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_b")?.position).toEqual({
      x: 80,
      y: 0,
    });
  });

  it("only pushes the east arm of an L-shaped layout", () => {
    const bounds: BoundsRect[] = [
      { id: "a", x: 0, y: 0, width: 100, height: 100 },
      { id: "b", x: 100, y: 0, width: 100, height: 100 },
      { id: "c", x: 0, y: 100, width: 100, height: 100 },
    ];
    const prev = bounds[0]!;
    const next = { ...prev, width: 140 };
    const positions = propagateWorkGroupMemberResize(bounds, "a", prev, next);
    expect(positions.get("b")).toEqual({ x: 140, y: 0 });
    expect(positions.get("c")).toEqual({ x: 0, y: 100 });
  });

  it("applies both axes for a corner-like resize", () => {
    const bounds: BoundsRect[] = [
      { id: "a", x: 0, y: 0, width: 100, height: 100 },
      { id: "b", x: 100, y: 0, width: 100, height: 100 },
      { id: "c", x: 0, y: 100, width: 100, height: 100 },
    ];
    const prev = bounds[0]!;
    const next = { id: "a", x: 0, y: 0, width: 130, height: 140 };
    const positions = propagateWorkGroupMemberResize(bounds, "a", prev, next);
    expect(positions.get("b")).toEqual({ x: 130, y: 0 });
    expect(positions.get("c")).toEqual({ x: 0, y: 140 });
  });

  it("pulls neighbors inward when shrinking", () => {
    const doc: MapContentDocument = {
      ...emptyDocument([
        noteArtifact("art_a", { x: 0, y: 0 }, "wg_a"),
        noteArtifact("art_b", { x: 100, y: 0 }, "wg_a"),
      ]),
      workGroups: [
        {
          id: "wg_a",
          title: "Row",
          memberNodeIds: ["art_a", "art_b"],
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
      ],
      workGroupSeq: 1,
    };
    const next = applyMapWorkGroupMutation(doc, {
      type: "resize_member",
      memberNodeId: "art_a",
      size: { width: 70, height: 100 },
      position: { x: 0, y: 0 },
    });
    expect(next.artifacts.find((artifact) => artifact.id === "art_b")?.position).toEqual({
      x: 70,
      y: 0,
    });
  });

  it("resizes a lone member without a workgroup", () => {
    const doc = emptyDocument([noteArtifact("art_a", { x: 10, y: 20 })]);
    const next = applyMapWorkGroupMutation(doc, {
      type: "resize_member",
      memberNodeId: "art_a",
      size: { width: 180, height: 120 },
      position: { x: 10, y: 20 },
    });
    expect(next.artifacts[0]?.size).toEqual({ width: 180, height: 120 });
    expect(next.workGroups).toHaveLength(0);
  });

  it.each([
    ["non-finite", Number.POSITIVE_INFINITY],
    ["oversized", 1_000_000_000],
  ])("rejects a %s resize at the contract boundary", (_label, width) => {
    const doc = emptyDocument([noteArtifact("art_a", { x: 10, y: 20 })]);
    const input = {
      type: "resize_member" as const,
      memberNodeId: "art_a",
      size: { width, height: 120 },
      position: { x: 10, y: 20 },
    };

    expect(MapWorkGroupMutationInputSchema.safeParse(input).success).toBe(false);
    expect(() => applyMapWorkGroupMutation(doc, input)).toThrow();
  });

  it("keeps a normal bounded resize valid", () => {
    const doc = emptyDocument([noteArtifact("art_a", { x: 10, y: 20 })]);
    const input = {
      type: "resize_member" as const,
      memberNodeId: "art_a",
      size: { width: 180, height: 120 },
      position: { x: 10, y: 20 },
    };

    expect(MapWorkGroupMutationInputSchema.safeParse(input).success).toBe(true);
    expect(applyMapWorkGroupMutation(doc, input).artifacts[0]?.size).toEqual({
      width: 180,
      height: 120,
    });
  });
});

describe("computeWorkGroupFrameBounds", () => {
  it("keeps a padding inset around the member union with title bar above", () => {
    const frame = computeWorkGroupFrameBounds([
      { id: "a", x: 40, y: 80, width: 100, height: 60 },
      { id: "b", x: 140, y: 100, width: 80, height: 50 },
    ]);
    expect(frame).toEqual({
      id: "frame",
      x: 40 - WORK_GROUP_PADDING,
      y: 80 - WORK_GROUP_PADDING - WORK_GROUP_TITLE_BAR_HEIGHT,
      width: 180 + WORK_GROUP_PADDING * 2,
      height: 70 + WORK_GROUP_PADDING * 2 + WORK_GROUP_TITLE_BAR_HEIGHT,
    });
  });

  it("shrinks with an edge member and grows when that member expands past the prior union", () => {
    const initial = collectCanvasUnitBounds(
      [
        noteArtifact("art_a", { x: 0, y: 0 }),
        noteArtifact("art_b", { x: 100, y: 0 }),
      ],
      ["art_a", "art_b"],
    );
    const before = computeWorkGroupFrameBounds(initial)!;
    expect(before.width).toBe(200 + WORK_GROUP_PADDING * 2);
    expect(before.height).toBe(100 + WORK_GROUP_PADDING * 2 + WORK_GROUP_TITLE_BAR_HEIGHT);

    const afterShrink = computeWorkGroupFrameBounds([
      { id: "art_a", x: 0, y: 0, width: 100, height: 100 },
      { id: "art_b", x: 100, y: 0, width: 60, height: 80 },
    ])!;
    expect(afterShrink.width).toBe(160 + WORK_GROUP_PADDING * 2);
    expect(afterShrink.height).toBe(100 + WORK_GROUP_PADDING * 2 + WORK_GROUP_TITLE_BAR_HEIGHT);
    expect(afterShrink.x).toBe(-WORK_GROUP_PADDING);
    expect(afterShrink.y).toBe(-WORK_GROUP_PADDING - WORK_GROUP_TITLE_BAR_HEIGHT);

    const afterGrow = computeWorkGroupFrameBounds([
      { id: "art_a", x: 0, y: 0, width: 100, height: 100 },
      { id: "art_b", x: 100, y: 0, width: 140, height: 130 },
    ])!;
    expect(afterGrow.width).toBe(240 + WORK_GROUP_PADDING * 2);
    expect(afterGrow.height).toBe(130 + WORK_GROUP_PADDING * 2 + WORK_GROUP_TITLE_BAR_HEIGHT);
  });
});
