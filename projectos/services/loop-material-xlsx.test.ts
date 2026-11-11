import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { parseXlsxFile } from "./loop-material-xlsx.js";

function buildMinimalXlsx(dir: string): string {
  // Minimal OOXML package with one sheet and shared string.
  const files: Record<string, string> = {
    "[Content_Types].xml":
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    "_rels/.rels":
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":
      `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/sharedStrings.xml":
      `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2"><si><t>hello</t></si><si><t>world</t></si></sst>`,
    "xl/worksheets/sheet1.xml":
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>3</v></c><c r="B2"><v>4</v></c></row></sheetData></worksheet>`,
  };
  const root = join(dir, "pkg");
  spawnSync("mkdir", ["-p", join(root, "xl/worksheets"), join(root, "xl/_rels"), join(root, "_rels")]);
  for (const [rel, body] of Object.entries(files)) {
    writeFileSync(join(root, rel), body);
  }
  const out = join(dir, "sample.xlsx");
  const zipped = spawnSync(
    "bash",
    ["-lc", `cd "${root}" && zip -q -r "${out}" .`],
    { encoding: "utf8" },
  );
  if (zipped.status !== 0) {
    throw new Error(`zip failed: ${zipped.stderr}`);
  }
  return out;
}

describe("loop-material-xlsx", () => {
  it("extracts sheet text and applies A1 range into structured_selection preview", () => {
    const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
    try {
      const path = buildMinimalXlsx(dir);
      const all = parseXlsxFile(path);
      expect(all.ok).toBe(true);
      if (!all.ok) return;
      expect(all.sheets).toContain("Data");
      expect(all.textPreview).toMatch(/hello/);

      const ranged = parseXlsxFile(path, {
        sheet: "Data",
        cellRange: "A1:A2",
      });
      expect(ranged.ok).toBe(true);
      if (!ranged.ok) return;
      expect(ranged.parseLevel).toBe("structured_selection");
      expect(ranged.textPreview).toMatch(/hello/);
      expect(ranged.textPreview.split("\n")[0]?.split("\t")).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("denies external relationship targets", () => {
    const dir = mkdtempSync(join(tmpdir(), "xlsx-ext-"));
    try {
      const files: Record<string, string> = {
        "[Content_Types].xml":
          `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
        "_rels/.rels":
          `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        "xl/workbook.xml":
          `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        "xl/_rels/workbook.xml.rels":
          `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="https://evil.example/sheet.xml"/></Relationships>`,
        "xl/worksheets/sheet1.xml":
          `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
      };
      const root = join(dir, "pkg");
      spawnSync("mkdir", [
        "-p",
        join(root, "xl/worksheets"),
        join(root, "xl/_rels"),
        join(root, "_rels"),
      ]);
      for (const [rel, body] of Object.entries(files)) {
        writeFileSync(join(root, rel), body);
      }
      const out = join(dir, "evil.xlsx");
      spawnSync("bash", ["-lc", `cd "${root}" && zip -q -r "${out}" .`]);
      const parsed = parseXlsxFile(out);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.error).toMatch(/External\/unsafe relationship/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
