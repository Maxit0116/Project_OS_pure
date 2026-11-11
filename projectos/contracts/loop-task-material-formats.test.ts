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
      if (sample.id === "csv") {
        expect(result.reason).toMatch(/structured_selection after column\/row apply/i);
      }
    }
  });

  it("marks png/jpeg/xlsx/pdf as first-batch usable levels (not blanket unsupported)", () => {
    expect(
      classifyLoopMaterialFormat({ mimeType: "image/png", fileName: "shot.png" }),
    ).toMatchObject({ formatId: "image", parseLevel: "vision_attach" });
    expect(
      classifyLoopMaterialFormat({ mimeType: "image/jpeg", fileName: "photo.jpg" }),
    ).toMatchObject({ formatId: "image", parseLevel: "vision_attach" });
    expect(
      classifyLoopMaterialFormat({
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileName: "table.xlsx",
      }),
    ).toMatchObject({ formatId: "xlsx", parseLevel: "structured_selection" });
    expect(
      classifyLoopMaterialFormat({ mimeType: "application/pdf", fileName: "spec.pdf" }),
    ).toMatchObject({ formatId: "pdf", parseLevel: "full_text_parse" });
  });

  it("keeps gif/webp/docx deferred unsupported", () => {
    for (const sample of [
      { mimeType: "image/gif", fileName: "a.gif" },
      { mimeType: "image/webp", fileName: "a.webp" },
      {
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileName: "a.docx",
      },
    ]) {
      const result = classifyLoopMaterialFormat(sample);
      expect(result.parseLevel).toBe("unsupported");
    }
  });
});
