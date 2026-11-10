import { describe, expect, it } from "vitest";

import { classifyLoopMaterialFormat } from "./loop-task-material-formats.js";

describe("loop-task-material-formats (first-batch matrix)", () => {
  it("supports plaintext / markdown / json / csv / log preview", () => {
    for (const sample of [
      { mimeType: "text/plain", fileName: "note.txt" },
      { mimeType: "text/markdown", fileName: "req.md" },
      { mimeType: "application/json", fileName: "payload.json" },
      { mimeType: "text/csv", fileName: "rows.csv" },
      { mimeType: "", fileName: "app.log" },
    ]) {
      expect(classifyLoopMaterialFormat(sample).support).toBe("supported_preview");
    }
  });

  it("marks image / xlsx / pdf explicitly unsupported (not ok)", () => {
    for (const sample of [
      { mimeType: "image/png", fileName: "shot.png" },
      { mimeType: "image/jpeg", fileName: "photo.jpg" },
      {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileName: "table.xlsx",
      },
      { mimeType: "application/pdf", fileName: "spec.pdf" },
    ]) {
      const result = classifyLoopMaterialFormat(sample);
      expect(result.support).toBe("unsupported");
      expect(result.reason).toMatch(/deferred|plaintext/i);
    }
  });
});
