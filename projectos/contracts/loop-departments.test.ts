import { describe, expect, it } from "vitest";

import {
  LOOP_DEPARTMENT_TEMPLATES,
  getLoopDepartmentTemplate,
  isLoopDepartmentPaletteItem,
  listLoopDepartmentTemplates,
} from "./loop-departments.js";
import { getLoopPaletteItem } from "./loop-presets.js";

describe("loop department templates", () => {
  it("exposes four built-in departments with valid curated members", () => {
    expect(LOOP_DEPARTMENT_TEMPLATES).toHaveLength(4);
    for (const template of LOOP_DEPARTMENT_TEMPLATES) {
      expect(isLoopDepartmentPaletteItem(template.id)).toBe(true);
      expect(getLoopPaletteItem(template.id)?.category).toBe("workgroup");
      for (const memberId of template.memberPaletteIds) {
        expect(getLoopPaletteItem(memberId)?.category).toBe("agent");
      }
      expect(template.coordinatorMemberIndex).toBeLessThan(
        template.memberPaletteIds.length,
      );
    }
  });

  it("looks up templates by palette id and department", () => {
    expect(
      getLoopDepartmentTemplate("workgroup.department.software-development")
        ?.title,
    ).toBe("Software Development");
    expect(
      listLoopDepartmentTemplates("ai_engineering").map((entry) => entry.id),
    ).toEqual(["workgroup.department.ai-engineering"]);
    expect(isLoopDepartmentPaletteItem("workgroup.create")).toBe(false);
  });
});
