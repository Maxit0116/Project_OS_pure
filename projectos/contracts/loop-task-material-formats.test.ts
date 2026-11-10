import { describe, expect, it } from "vitest";

import { classifyLoopMaterialFormat } from "./loop-task-material-formats.js";

describe("loop-task-material-formats (first-batch matrix)", () => {
  it("classifies plaintext/md/json/csv/log as text_preview only (not structured)", () => {
    const samples = [
      { mimeType: "text/plain", fileName: "note.txt", id: "plaintext" },
      { mimeType: "text/markdown", fileName: "req.md", id: "markdown" },
      { mimeType: "application/json", fileName: "payload.json", id: "json" },
      { mimeType: "text/csv", fileName: "rows.csv", id: "csv" },
      { mimeType: "", fileName: "app.log", id: "log" },
    ] as const;
    for (const sample of samples) {
      const result = classifyLoopMaterialFormat(sample);
      expect(result.support).toBe("text_preview");
      expect(result.parseLevel).toBe("text_preview");
      expect(result.formatId).toBe(sample.id);
      expect(result.reason).not.toMatch(/structured_selection|full_text_parse implemented/i);
      if (sample.id === "csv") {
        expect(result.reason).toMatch(/sheet\/column\/range selection NOT implemented/i);
      }
    }
  });

  it("marks image / xlsx / pdf explicitly unsupported (safety ≠ feature done)", () => {
    for (const sample of [
      { mimeType: "image/png", fileName: "shot.png", id: "image" },
      { mimeType: "image/jpeg", fileName: "photo.jpg", id: "image" },
      {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileName: "table.xlsx",
        id: "xlsx",
      },
      { mimeType: "application/pdf", fileName: "spec.pdf", id: "pdf" },
    ] as const) {
      const result = classifyLoopMaterialFormat(sample);
      expect(result.support).toBe("unsupported");
      expect(result.parseLevel).toBe("unsupported");
      expect(result.formatId).toBe(sample.id);
      expect(result.reason).toMatch(/unsupported/i);
    }
  });
});
