import { describe, expect, it } from "vitest";

import { normalizeLoopGraphDocument, emptyIntentGraph } from "./loop-graph.js";
import {
  computeLoopWorkGroupFrameBounds,
  estimateWorkGroupMemberChipSize,
  expandWorkGroupInternalEdges,
  inferWorkGroupPort,
  isNestedWorkGroupInteriorNode,
  isWorkGroupInteriorNode,
  layoutWorkGroupMemberMatrix,
  LOOP_WORK_GROUP_MEMBER_CHIP_H,
  LOOP_WORK_GROUP_MEMBER_CHIP_MAX_H,
  LOOP_WORK_GROUP_MEMBER_CHIP_MAX_W,
  LOOP_WORK_GROUP_MEMBER_CHIP_MIN_W,
  LOOP_WORK_GROUP_MEMBER_VISIBLE_DUTIES,
  loopWorkGroupPortWorld,
  formatLoopWorkGroupDisplayTitle,
  resolveLoopWorkGroupTaskTitle,
  applyLoopWorkGroupTaskTitle,
  LOOP_WORK_GROUP_UNTITLED_TASK,
  nextLoopWorkGroupTitle,
  normalizeLoopWorkGroupPort,
  oppositeLoopWorkGroupPort,
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

  it("formats display titles from department + task", () => {
    expect(formatLoopWorkGroupDisplayTitle({})).toBe(LOOP_WORK_GROUP_UNTITLED_TASK);
    expect(
      formatLoopWorkGroupDisplayTitle({ taskTitle: "Fix payment timeout" }),
    ).toBe("Fix payment timeout");
    expect(
      formatLoopWorkGroupDisplayTitle({
        departmentName: "Software Development",
      }),
    ).toBe("Software Development");
    expect(
      formatLoopWorkGroupDisplayTitle({
        departmentName: "Software Development",
        taskTitle: "支付回调",
      }),
    ).toBe("Software Development · 支付回调");
  });

  it("resolves editable task from taskTitle or legacy title", () => {
    expect(
      resolveLoopWorkGroupTaskTitle({
        title: "Untitled task",
        taskTitle: "Ship login",
      }),
    ).toBe("Ship login");
    expect(
      resolveLoopWorkGroupTaskTitle(
        {
          title: "Software Development · 支付回调",
          departmentTemplateId: "workgroup.department.software-development",
        },
        "Software Development",
      ),
    ).toBe("支付回调");
    expect(
      resolveLoopWorkGroupTaskTitle({ title: "Workgroup 3" }),
    ).toBe("");
    expect(
      applyLoopWorkGroupTaskTitle(
        { departmentTemplateId: "workgroup.department.ai-engineering" },
        "RAG evals",
        "AI Engineering",
      ),
    ).toEqual({
      title: "AI Engineering · RAG evals",
      taskTitle: "RAG evals",
    });
  });

  it("normalizes legacy in/out ports to mid-side geometry", () => {
    expect(normalizeLoopWorkGroupPort("in")).toBe("w");
    expect(normalizeLoopWorkGroupPort("out")).toBe("e");
    expect(normalizeLoopWorkGroupPort("n")).toBe("n");
    expect(inferWorkGroupPort("source")).toBe("e");
    expect(inferWorkGroupPort("target")).toBe("w");
    expect(oppositeLoopWorkGroupPort("n")).toBe("s");
    expect(oppositeLoopWorkGroupPort("e")).toBe("w");
    const bounds = { x: 10, y: 20, width: 100, height: 80 };
    expect(loopWorkGroupPortWorld(bounds, "n")).toEqual({ x: 60, y: 20 });
    expect(loopWorkGroupPortWorld(bounds, "e")).toEqual({ x: 110, y: 60 });
    expect(loopWorkGroupPortWorld(bounds, "s")).toEqual({ x: 60, y: 100 });
    expect(loopWorkGroupPortWorld(bounds, "w")).toEqual({ x: 10, y: 60 });
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

  it("sizes member chips from title and description content", () => {
    const short = estimateWorkGroupMemberChipSize({ title: "QA", prompt: "Ship" });
    expect(short.width).toBeGreaterThanOrEqual(LOOP_WORK_GROUP_MEMBER_CHIP_MIN_W);
    expect(short.width).toBeLessThanOrEqual(LOOP_WORK_GROUP_MEMBER_CHIP_MAX_W);
    expect(short.height).toBeGreaterThanOrEqual(LOOP_WORK_GROUP_MEMBER_CHIP_H);

    const longTitle = estimateWorkGroupMemberChipSize({
      title: "Backend Engineer",
      showIncomplete: true,
    });
    expect(longTitle.width).toBeGreaterThan(200);
    expect(longTitle.height).toBeGreaterThan(LOOP_WORK_GROUP_MEMBER_CHIP_H);

    const legacy = estimateWorkGroupMemberChipSize("Agent");
    expect(legacy.width).toBeGreaterThanOrEqual(LOOP_WORK_GROUP_MEMBER_CHIP_MIN_W);
  });

  it("grows height for long descriptions and multi-item duty lists", () => {
    const oneDuty = estimateWorkGroupMemberChipSize({
      title: "QA",
      dutyItemCount: 1,
    });
    const fiveDuties = estimateWorkGroupMemberChipSize({
      title: "QA",
      dutyItemCount: LOOP_WORK_GROUP_MEMBER_VISIBLE_DUTIES,
    });
    expect(fiveDuties.height).toBeGreaterThan(oneDuty.height);
    // Must clear the old 120px cap so five checklist rows are not clipped.
    expect(fiveDuties.height).toBeGreaterThan(120);
    expect(fiveDuties.height).toBeLessThanOrEqual(LOOP_WORK_GROUP_MEMBER_CHIP_MAX_H);

    const longPrompt = estimateWorkGroupMemberChipSize({
      title: "Planner",
      prompt:
        "先梳理需求边界，再拆分验收标准，并同步给后端与客户端负责人确认依赖与排期风险。",
    });
    const shortPrompt = estimateWorkGroupMemberChipSize({
      title: "Planner",
      prompt: "Ship",
    });
    expect(longPrompt.height).toBeGreaterThan(shortPrompt.height);

    const manyDuties = estimateWorkGroupMemberChipSize({
      title: "QA",
      dutyItemCount: LOOP_WORK_GROUP_MEMBER_VISIBLE_DUTIES + 3,
    });
    // Extra items beyond the canvas cap only add a compact "+N more" line.
    expect(manyDuties.height).toBeGreaterThanOrEqual(fiveDuties.height);
    expect(manyDuties.height - fiveDuties.height).toBeLessThan(40);
    expect(fiveDuties.height).toBeLessThan(LOOP_WORK_GROUP_MEMBER_CHIP_MAX_H);
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
        { id: "a", width: 200, height: 64 },
        { id: "b", width: 200, height: 64 },
        { id: "c", width: 200, height: 64 },
      ],
      gapX: 12,
      gapY: 10,
    });
    expect(laidOut.columns).toBe(2);
    expect(laidOut.cellWidth).toBe(200);
    expect(laidOut.rowHeights).toEqual([64, 64]);
    expect(laidOut.positions).toEqual([
      { id: "a", x: 56, y: 64 },
      { id: "b", x: 268, y: 64 },
      { id: "c", x: 56, y: 138 },
    ]);
    expect(laidOut.contentSize).toEqual({ width: 412, height: 138 });

    // Rows use that row's tallest chip — short rows do not inherit empty space.
    const mixed = layoutWorkGroupMemberMatrix({
      frameOrigin: { x: 0, y: 0 },
      members: [
        { id: "tall", width: 180, height: 160 },
        { id: "short", width: 180, height: 64 },
        { id: "mid", width: 220, height: 90 },
      ],
      gapX: 12,
      gapY: 10,
    });
    expect(mixed.columns).toBe(2);
    expect(mixed.cellWidth).toBe(220);
    expect(mixed.rowHeights).toEqual([160, 90]);
    expect(mixed.positions[0]).toEqual({ id: "tall", x: 16, y: 28 + 16 });
    expect(mixed.positions[1]).toEqual({
      id: "short",
      x: 16 + 220 + 12,
      y: 28 + 16,
    });
    expect(mixed.positions[2]).toEqual({
      id: "mid",
      x: 16,
      y: 28 + 16 + 160 + 10,
    });
    expect(mixed.contentSize.height).toBe(160 + 10 + 90);
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
