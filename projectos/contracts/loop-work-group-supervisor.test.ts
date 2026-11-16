import { describe, expect, it } from "vitest";

import {
  LOOP_WORK_GROUP_SUPERVISOR_DUTIES,
  LOOP_WORK_GROUP_SUPERVISOR_DUTY_IDS,
  LOOP_WORK_GROUP_SUPERVISOR_PALETTE_ID,
  listStaffableCuratedPaletteIds,
  mergeSupervisorDuties,
  nodeHasSupervisorDuties,
  suggestSpecialistPaletteFromNeed,
} from "./loop-work-group-supervisor.js";
import { LOOP_PALETTE_ITEMS, getLoopPaletteItem } from "./loop-presets.js";

describe("loop-work-group-supervisor", () => {
  it("exposes a curated Supervisor palette seed with staffing duties", () => {
    const item = getLoopPaletteItem(LOOP_WORK_GROUP_SUPERVISOR_PALETTE_ID);
    expect(item?.title).toBe("Supervisor");
    expect(item?.seed.dutyItems?.length).toBeGreaterThanOrEqual(5);
    expect(
      item?.seed.dutyItems?.some(
        (duty) => duty.id === LOOP_WORK_GROUP_SUPERVISOR_DUTY_IDS.propose,
      ),
    ).toBe(true);
  });

  it("merges supervisor duties without duplicating stable ids", () => {
    const once = mergeSupervisorDuties(undefined);
    expect(once).toHaveLength(LOOP_WORK_GROUP_SUPERVISOR_DUTIES.length);
    const twice = mergeSupervisorDuties(once);
    expect(twice).toHaveLength(LOOP_WORK_GROUP_SUPERVISOR_DUTIES.length);
    expect(nodeHasSupervisorDuties({ dutyItems: twice })).toBe(true);
  });

  it("suggests curated specialists from capability need text", () => {
    expect(suggestSpecialistPaletteFromNeed("Need frontend React UI")).toBe(
      "agent.curated.frontend-engineer",
    );
    expect(suggestSpecialistPaletteFromNeed("安全测试与 QA")).toBe(
      "agent.curated.qa-security",
    );
    expect(suggestSpecialistPaletteFromNeed("")).toBeUndefined();
  });

  it("lists staffable curated agents excluding the Supervisor seat", () => {
    const ids = listStaffableCuratedPaletteIds(
      LOOP_PALETTE_ITEMS.map((item) => item.id),
    );
    expect(ids).not.toContain(LOOP_WORK_GROUP_SUPERVISOR_PALETTE_ID);
    expect(ids).toContain("agent.curated.frontend-engineer");
  });
});
