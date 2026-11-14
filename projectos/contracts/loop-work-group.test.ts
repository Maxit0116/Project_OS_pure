import { describe, expect, it } from "vitest";

import { normalizeLoopGraphDocument, emptyIntentGraph } from "./loop-graph.js";
import {
  computeLoopWorkGroupFrameBounds,
  expandWorkGroupInternalEdges,
  isNestedWorkGroupInteriorNode,
  isWorkGroupInteriorNode,
  layoutWorkGroupMemberMatrix,
  nextLoopWorkGroupTitle,
  resolveWorkGroupEntryNodeId,
  resolveWorkGroupExitNodeIds,
  validateLoopWorkGroups,
  workGroupMatrixColumnCount,
  type LoopWorkGroup,
} from "./loop-work-group.js";

function group(
  partial: Partial<LoopWorkGroup> & Pick<LoopWorkGroup, "id" | "memberNodeIds">,
): LoopWorkGroup {
  return {
    title: partial.title ?? "Squad",
    collaborationMode: partial.collaborationMode ?? "coordinator",
    coordinatorNodeId: partial.coordinatorNodeId,
    createdAt: "2026-11-13T00:00:00.000Z",
    updatedAt: "2026-11-13T00:00:00.000Z",
    ...partial,
  };
}

describe("loop-work-group", () => {
  it("nextLoopWorkGroupTitle increments", () => {
    expect(nextLoopWorkGroupTitle(1)).toBe("Workgroup 1");
  });

  it("interior helpers: type vs nested membership", () => {
    const standalone = { id: "act", type: "action", title: "GitHub" };
    const nested = {
      id: "act2",
      type: "action",
      title: "GitHub",
      workGroupId: "wg1",
    };
    expect(isWorkGroupInteriorNode(standalone)).toBe(true);
    expect(isNestedWorkGroupInteriorNode(standalone)).toBe(false);
    expect(isNestedWorkGroupInteriorNode(nested)).toBe(true);
    expect(
      isNestedWorkGroupInteriorNode({
        id: "a1",
        type: "agent",
        workGroupId: "wg1",
      }),
    ).toBe(false);
  });

  it("computeLoopWorkGroupFrameBounds pads AABB + title bar", () => {
    const frame = computeLoopWorkGroupFrameBounds([
      { id: "a", x: 100, y: 100, width: 80, height: 40 },
      { id: "b", x: 200, y: 120, width: 80, height: 40 },
    ]);
    expect(frame).toEqual({
      x: 84,
      y: 56,
      width: 212,
      height: 120,
    });
  });

  it("packs surface agents into a rectangular matrix under the frame origin", () => {
    expect(workGroupMatrixColumnCount(1)).toBe(1);
    expect(workGroupMatrixColumnCount(2)).toBe(2);
    expect(workGroupMatrixColumnCount(3)).toBe(2);
    expect(workGroupMatrixColumnCount(4)).toBe(2);
    expect(workGroupMatrixColumnCount(9)).toBe(3);

    const laidOut = layoutWorkGroupMemberMatrix({
      frameOrigin: { x: 40, y: 20 },
      members: [
        { id: "a", width: 100, height: 28 },
        { id: "b", width: 120, height: 28 },
        { id: "c", width: 110, height: 28 },
      ],
      gapX: 10,
      gapY: 8,
    });
    expect(laidOut.columns).toBe(2);
    expect(laidOut.cellWidth).toBe(120);
    expect(laidOut.positions).toEqual([
      { id: "a", x: 56, y: 64 },
      { id: "b", x: 186, y: 64 },
      { id: "c", x: 56, y: 100 },
    ]);
    expect(laidOut.contentSize).toEqual({ width: 250, height: 64 });
  });

  it("validate allows empty group in Draw but fails at compile", () => {
    const draft = {
      nodes: [],
      workGroups: [group({ id: "wg1", memberNodeIds: [] })],
    };
    expect(validateLoopWorkGroups(draft)).toEqual([]);
    expect(validateLoopWorkGroups(draft, { forCompile: true })[0]?.code).toBe(
      "work_group_empty",
    );
  });

  it("allows interior Action nodes but rejects General Agents at compile", () => {
    const draft = {
      nodes: [
        {
          id: "a1",
          type: "agent",
          title: "General",
          agentDefinitionId: null,
          workGroupId: "wg1",
        },
        {
          id: "act",
          type: "action",
          title: "GitHub",
          workGroupId: "wg1",
        },
      ],
      workGroups: [
        group({
          id: "wg1",
          memberNodeIds: ["a1", "act"],
          coordinatorNodeId: "a1",
        }),
      ],
    };
    const codes = validateLoopWorkGroups(draft, { forCompile: true }).map(
      (issue) => issue.code,
    );
    expect(codes).toContain("work_group_member_not_specialist");
    expect(codes).not.toContain("work_group_member_invalid_type");
  });

  it("requires coordinator in members for coordinator mode", () => {
    const draft = {
      nodes: [
        {
          id: "a1",
          type: "agent",
          agentDefinitionId: "agent_x",
          workGroupId: "wg1",
        },
      ],
      workGroups: [
        group({
          id: "wg1",
          memberNodeIds: ["a1"],
          collaborationMode: "coordinator",
        }),
      ],
    };
    expect(
      validateLoopWorkGroups(draft, { forCompile: true })[0]?.code,
    ).toBe("work_group_coordinator_invalid");
  });

  it("expandWorkGroupInternalEdges covers modes", () => {
    const serial = expandWorkGroupInternalEdges(
      group({
        id: "wg",
        memberNodeIds: ["a", "b", "c"],
        collaborationMode: "serial",
      }),
    );
    expect(serial.map((e) => `${e.from}->${e.to}`)).toEqual([
      "a->b",
      "b->c",
    ]);

    const coord = expandWorkGroupInternalEdges(
      group({
        id: "wg",
        memberNodeIds: ["c", "a", "b"],
        collaborationMode: "coordinator",
        coordinatorNodeId: "c",
      }),
    );
    expect(coord.map((e) => `${e.from}->${e.to}`).sort()).toEqual([
      "c->a",
      "c->b",
    ]);

    expect(
      expandWorkGroupInternalEdges(
        group({
          id: "wg",
          memberNodeIds: ["a", "b"],
          collaborationMode: "parallel_join",
        }),
      ),
    ).toEqual([]);
  });

  it("resolve entry/exit node ids", () => {
    const g = group({
      id: "wg",
      memberNodeIds: ["c", "a", "b"],
      collaborationMode: "coordinator",
      coordinatorNodeId: "c",
    });
    expect(resolveWorkGroupEntryNodeId(g)).toBe("c");
    expect(resolveWorkGroupExitNodeIds(g).sort()).toEqual(["a", "b"]);

    const serial = group({
      id: "wg",
      memberNodeIds: ["a", "b", "c"],
      collaborationMode: "serial",
    });
    expect(resolveWorkGroupEntryNodeId(serial)).toBe("a");
    expect(resolveWorkGroupExitNodeIds(serial)).toEqual(["c"]);
  });

  it("normalizeLoopGraphDocument fills missing workGroups", () => {
    const doc = normalizeLoopGraphDocument({
      version: "0.1.0",
      id: "loop_1",
      projectId: "proj",
      title: "T",
      draft: {
        revision: 0,
        graphPrompt: "",
        nodes: [],
        edges: [],
      },
      approvedSpecs: [],
      instances: [],
      linkedSessionIds: [],
      createdAt: "2026-11-13T00:00:00.000Z",
      updatedAt: "2026-11-13T00:00:00.000Z",
    });
    expect(doc.draft.workGroups).toEqual([]);
    expect(doc.draft.workGroupSeq).toBe(0);
  });

  it("emptyIntentGraph includes work group fields", () => {
    expect(emptyIntentGraph()).toMatchObject({
      workGroups: [],
      workGroupSeq: 0,
    });
  });
});
