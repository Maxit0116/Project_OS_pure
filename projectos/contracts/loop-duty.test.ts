import { describe, expect, it } from "vitest";

import {
  areRequiredDutiesComplete,
  dutyItemsFromDevPlanTasks,
  dutyItemsFromPrompt,
  dutyItemsToAcceptance,
  dutyProgressCounts,
  hasDutyAssignment,
  initDutyProgress,
  mutateDutyItems,
  resolveDutyItems,
  seedDutyItemsFromCapabilityPrompt,
  splitPromptIntoDutyTexts,
  syncDutyProgressWithItems,
  toggleDutyProgressItem,
} from "./loop-duty.js";

describe("loop-duty", () => {
  it("splits prompt lines into duty texts", () => {
    expect(splitPromptIntoDutyTexts("a\nb\nc")).toEqual(["a", "b", "c"]);
    expect(splitPromptIntoDutyTexts("1. First\n2. Second")).toEqual([
      "First",
      "Second",
    ]);
    expect(splitPromptIntoDutyTexts("one; two; three")).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("builds duty items and acceptance from prompt", () => {
    const items = dutyItemsFromPrompt("Ship UI\nWrite tests", {
      kind: "machine",
      source: "user",
    });
    expect(items).toHaveLength(2);
    expect(items[0]?.text).toBe("Ship UI");
    const acceptance = dutyItemsToAcceptance(items);
    expect(acceptance[0]?.description).toBe("Ship UI");
    expect(acceptance[0]?.kind).toBe("machine");
  });

  it("tracks assignment and progress completion", () => {
    expect(hasDutyAssignment({ dutyItems: [] })).toBe(false);
    expect(hasDutyAssignment({ dutyEdited: true })).toBe(true);
    const items = resolveDutyItems({
      id: "n1",
      title: "Coder",
      prompt: "",
      dutyItems: [
        { id: "d1", text: "A", kind: "machine", required: true },
        { id: "d2", text: "B", kind: "machine", required: false },
      ],
    });
    let progress = initDutyProgress(items, "t0");
    expect(areRequiredDutiesComplete(items, progress)).toBe(false);
    progress = toggleDutyProgressItem(progress, "d1", "done", "t1");
    expect(areRequiredDutiesComplete(items, progress)).toBe(true);
    expect(dutyProgressCounts(items, progress)).toEqual({ done: 1, total: 1 });
  });

  it("seeds palette duties and mutates runtime checklist", () => {
    const seeded = seedDutyItemsFromCapabilityPrompt(
      "Clarify goals\nWrite acceptance criteria",
      { kind: "machine", title: "Planner" },
    );
    expect(seeded).toHaveLength(2);
    expect(seeded[0]?.source).toBe("palette");

    let items = mutateDutyItems(seeded, {
      op: "add",
      text: "Review risks",
      kind: "machine",
    });
    expect(items).toHaveLength(3);
    items = mutateDutyItems(items, {
      op: "update",
      itemId: items[2]!.id,
      text: "Review risks carefully",
    });
    expect(items[2]?.text).toBe("Review risks carefully");
    const progress = syncDutyProgressWithItems(items, undefined, "t0");
    expect(progress).toHaveLength(3);

    const fromPlan = dutyItemsFromDevPlanTasks([
      { id: "T1", title: "Implement API" },
      { id: "T2", title: "Add tests" },
    ]);
    expect(fromPlan[0]?.id).toBe("duty_plan_T1");
  });
});
