import { describe, expect, it } from "vitest";

import type { MapArtifact } from "./map-content.js";
import {
  applyStackActiveMember,
  deleteStackMember,
  getActiveStackMember,
  getStackMembers,
  getStackNodeId,
  groupArtifactsForCanvas,
  maintainStackAfterMemberLeaves,
  nextStackOrder,
  reorderStackTabOrder,
  syncStackGeometry,
  withoutStackFields,
} from "./map-artifact-stack.js";

const base = {
  scope: "project" as const,
  position: { x: 10, y: 20 },
  size: { width: 280, height: 160 },
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
};

function noteArtifact(
  id: string,
  stack?: { stackId: string; stackOrder: number; stackActive?: boolean },
): MapArtifact {
  return {
    ...base,
    id,
    type: "note",
    note: { body: id },
    ...(stack ?? {}),
  };
}

describe("map-artifact-stack", () => {
  it("groups solo and stacked artifacts for canvas", () => {
    const artifacts = [
      noteArtifact("art_solo"),
      noteArtifact("art_a", { stackId: "stack_1", stackOrder: 0 }),
      noteArtifact("art_b", { stackId: "stack_1", stackOrder: 2 }),
      noteArtifact("art_c", { stackId: "stack_1", stackOrder: 1 }),
    ];

    const groups = groupArtifactsForCanvas(artifacts);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.nodeId === "art_solo")?.members).toHaveLength(1);
    const stack = groups.find((group) => group.nodeId === "stack_1");
    expect(stack?.members).toHaveLength(3);
    expect(stack?.active.id).toBe("art_b");
  });

  it("prefers stackActive over legacy max stackOrder", () => {
    const members = [
      noteArtifact("art_a", { stackId: "stack_1", stackOrder: 0 }),
      noteArtifact("art_b", { stackId: "stack_1", stackOrder: 5, stackActive: false }),
      noteArtifact("art_c", { stackId: "stack_1", stackOrder: 1, stackActive: true }),
    ];
    expect(getActiveStackMember(members).id).toBe("art_c");
  });

  it("reorders tab order without changing active member", () => {
    const artifacts = [
      noteArtifact("art_a", { stackId: "stack_1", stackOrder: 0, stackActive: true }),
      noteArtifact("art_b", { stackId: "stack_1", stackOrder: 1 }),
      noteArtifact("art_c", { stackId: "stack_1", stackOrder: 2 }),
    ];
    const next = reorderStackTabOrder(artifacts, "stack_1", [
      "art_c",
      "art_a",
      "art_b",
    ]);
    const members = getStackMembers(next, "stack_1");
    expect(members.map((member) => member.id)).toEqual(["art_c", "art_a", "art_b"]);
    expect(getActiveStackMember(members).id).toBe("art_a");
  });

  it("sets a single stackActive member in a stack", () => {
    const artifacts = [
      noteArtifact("art_a", { stackId: "stack_1", stackOrder: 0, stackActive: true }),
      noteArtifact("art_b", { stackId: "stack_1", stackOrder: 1 }),
      noteArtifact("art_solo"),
    ];
    const next = applyStackActiveMember(artifacts, "stack_1", "art_b");
    expect(next.find((artifact) => artifact.id === "art_a")?.stackActive).toBe(false);
    expect(next.find((artifact) => artifact.id === "art_b")?.stackActive).toBe(true);
    expect(next.find((artifact) => artifact.id === "art_solo")?.stackActive).toBeUndefined();
  });

  it("resolves stack node id and active member", () => {
    const member = noteArtifact("art_b", { stackId: "stack_1", stackOrder: 1 });
    expect(getStackNodeId(member)).toBe("stack_1");
    expect(getActiveStackMember([noteArtifact("art_a", { stackId: "stack_1", stackOrder: 0 }), member]).id).toBe(
      "art_b",
    );
  });

  it("computes next stack order", () => {
    const members = [
      noteArtifact("art_a", { stackId: "stack_1", stackOrder: 0 }),
      noteArtifact("art_b", { stackId: "stack_1", stackOrder: 3 }),
    ];
    expect(nextStackOrder(members)).toBe(4);
  });

  it("dissolves stack when one member remains after delete", () => {
    const artifacts = [
      noteArtifact("art_a", { stackId: "stack_1", stackOrder: 0 }),
      noteArtifact("art_b", { stackId: "stack_1", stackOrder: 1 }),
    ];
    const next = deleteStackMember(artifacts, "stack_1", "art_b");
    const survivor = next.find((artifact) => artifact.id === "art_a");
    expect(survivor?.stackId).toBeUndefined();
    expect(survivor?.stackOrder).toBeUndefined();
    expect(survivor?.stackActive).toBeUndefined();
  });

  it("maintains stack after detach without removing member", () => {
    const artifacts = [
      noteArtifact("art_a", { stackId: "stack_1", stackOrder: 0 }),
      noteArtifact("art_b", { stackId: "stack_1", stackOrder: 1 }),
    ];
    const next = maintainStackAfterMemberLeaves(artifacts, "stack_1", "art_b");
    expect(next).toHaveLength(2);
    expect(next.find((artifact) => artifact.id === "art_b")?.stackId).toBe("stack_1");
  });

  it("syncs geometry across stack members", () => {
    const artifacts = [
      noteArtifact("art_a", { stackId: "stack_1", stackOrder: 0 }),
      noteArtifact("art_b", { stackId: "stack_1", stackOrder: 1 }),
    ];
    const next = syncStackGeometry(artifacts, "stack_1", {
      position: { x: 99, y: 88 },
      size: { width: 400, height: 300 },
    });
    for (const member of getStackMembers(next, "stack_1")) {
      expect(member.position).toEqual({ x: 99, y: 88 });
      expect(member.size).toEqual({ width: 400, height: 300 });
    }
  });

  it("clears a work group from every stack member", () => {
    const artifacts = [
      { ...noteArtifact("art_a", { stackId: "stack_1", stackOrder: 0 }), workGroupId: "wg_1" },
      { ...noteArtifact("art_b", { stackId: "stack_1", stackOrder: 1 }), workGroupId: "wg_1" },
    ];

    const next = syncStackGeometry(artifacts, "stack_1", { workGroupId: null });

    expect(getStackMembers(next, "stack_1").every((member) => member.workGroupId === undefined)).toBe(true);
  });

  it("strips stack fields for solo promotion", () => {
    const solo = withoutStackFields(
      noteArtifact("art_a", { stackId: "stack_1", stackOrder: 0, stackActive: true }),
    );
    expect(solo.stackId).toBeUndefined();
    expect(solo.stackOrder).toBeUndefined();
    expect(solo.stackActive).toBeUndefined();
  });
});
