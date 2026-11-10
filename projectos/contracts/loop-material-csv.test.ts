import { describe, expect, it } from "vitest";

import { parseAndSelectCsv } from "./loop-material-csv.js";

describe("loop-material-csv structured selection", () => {
  const raw = "name,role,score\nalice,req,1\nbob,test,2\ncarol,biz,3\n";

  it("defaults to text_preview without selection", () => {
    const result = parseAndSelectCsv(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parseLevel).toBe("text_preview");
    expect(result.textPreview).toMatch(/alice/);
  });

  it("applies column + row range into preview (run snapshot input)", () => {
    const result = parseAndSelectCsv(raw, {
      columns: ["name", "score"],
      rowStart: 2,
      rowEnd: 3,
      role: "test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parseLevel).toBe("structured_selection");
    expect(result.textPreview).toBe("name,score\nbob,2\ncarol,3");
    expect(result.table.headers).toEqual(["name", "score"]);
    expect(result.table.rows).toHaveLength(2);
  });
});
