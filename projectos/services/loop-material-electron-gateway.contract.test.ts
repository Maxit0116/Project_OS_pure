/**
 * Offline Electron multi-type materials → node projection → ModelGateway payload.
 * Host parsers (ingest) + vision-safe contentRef + openai_chat images[] shape.
 * Not live / not paid — deterministic bytes only.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { LoopTaskMaterialSchema } from "../contracts/loop-task-materials.js";
import { buildOpenAiUserContent } from "./model-gateway/providers.js";
import { ingestLoopTaskMaterial } from "./loop-material-ingest.js";
import { projectMaterialsForNode } from "./loop-material-project.js";
import { assessMaterialChangeImpact } from "./loop-material-rereview.js";

const PNG_1X1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=";

function buildMinimalXlsx(dir: string): Uint8Array {
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
      `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2"><si><t>alpha</t></si><si><t>beta</t></si></sst>`,
    "xl/worksheets/sheet1.xml":
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>inline</t></is></c></row><row r="2"><c r="A2"><v>9</v></c></row></sheetData></worksheet>`,
  };
  const root = join(dir, "pkg");
  spawnSync("mkdir", ["-p", join(root, "xl/worksheets"), join(root, "xl/_rels"), join(root, "_rels")]);
  for (const [rel, body] of Object.entries(files)) {
    writeFileSync(join(root, rel), body);
  }
  const out = join(dir, "sample.xlsx");
  const zipped = spawnSync("bash", ["-lc", `cd "${root}" && zip -q -r "${out}" .`], {
    encoding: "utf8",
  });
  if (zipped.status !== 0) throw new Error(`zip failed: ${zipped.stderr}`);
  return new Uint8Array(readFileSync(out));
}

describe("Electron multi-type materials → ModelGateway offline contract", () => {
  it("ingests text+csv+xlsx+png, projects node payload, embeds openai images[]", () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-mat-e2e-"));
    try {
      const xlsxBytes = buildMinimalXlsx(dir);
      const text = ingestLoopTaskMaterial({
        fileName: "note.txt",
        mimeType: "text/plain",
        bytes: new TextEncoder().encode("requirement: ship materials"),
      });
      const csv = ingestLoopTaskMaterial({
        fileName: "rows.csv",
        mimeType: "text/csv",
        bytes: new TextEncoder().encode("name,score\nalice,1\nbob,2"),
      });
      const xlsx = ingestLoopTaskMaterial({
        fileName: "table.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes: xlsxBytes,
        xlsxSelection: { sheet: "Data", cellRange: "A1:B1" },
      });
      const png = ingestLoopTaskMaterial({
        fileName: "shot.png",
        mimeType: "image/png",
        bytes: Buffer.from(PNG_1X1_B64, "base64"),
      });

      expect(text.ok).toBe(true);
      expect(csv.ok).toBe(true);
      expect(xlsx.ok).toBe(true);
      expect(png.ok).toBe(true);
      if (!text.ok || !csv.ok || !xlsx.ok || !png.ok) return;

      expect(text.material.parseLevel).toBe("text_preview");
      expect(csv.material.parseLevel).toMatch(/text_preview|structured_selection/);
      expect(xlsx.material.parseLevel).toBe("structured_selection");
      expect(xlsx.material.textPreview).toMatch(/alpha/);
      expect(png.material.parseLevel).toBe("vision_attach");

      for (const material of [
        text.material,
        csv.material,
        xlsx.material,
        png.material,
      ]) {
        expect(() => LoopTaskMaterialSchema.parse(material)).not.toThrow();
      }

      const materials = [
        { ...text.material, bindingNodeIds: ["n_impl"] },
        { ...csv.material, bindingNodeIds: ["n_impl"] },
        { ...xlsx.material, bindingNodeIds: ["n_impl"] },
        { ...png.material, bindingNodeIds: ["n_impl"] },
      ];

      const projected = projectMaterialsForNode({
        nodeId: "n_impl",
        materials,
        modelProfile: {
          id: "p",
          name: "gpt",
          provider: "openai",
          model: "gpt-4o",
          apiKeyRef: "k",
        },
      });
      expect(projected.visionBlocked).toBe(false);
      expect(projected.images).toHaveLength(1);
      expect(projected.images[0]?.mimeType).toBe("image/png");
      expect(projected.textBundle).toMatch(/requirement: ship materials/);
      expect(projected.textBundle).toMatch(/alpha/);

      const content = buildOpenAiUserContent(
        `Node materials:\n${projected.textBundle}`,
        projected.images,
      );
      expect(Array.isArray(content)).toBe(true);
      const parts = content as Array<Record<string, unknown>>;
      expect(parts.some((p) => p.type === "text")).toBe(true);
      expect(
        parts.some(
          (p) =>
            p.type === "image_url" &&
            typeof (p.image_url as { url?: string })?.url === "string" &&
            String((p.image_url as { url: string }).url).startsWith(
              "data:image/png;base64,",
            ),
        ),
      ).toBe(true);

      // CRUD / replace impact → TM-8 re-review without mechanical full re-run
      const replaced = ingestLoopTaskMaterial({
        fileName: "note.txt",
        mimeType: "text/plain",
        bytes: new TextEncoder().encode("requirement: updated"),
        materialId: text.material.id,
      });
      expect(replaced.ok).toBe(true);
      if (!replaced.ok) return;
      const impact = assessMaterialChangeImpact({
        previous: materials,
        next: materials.map((m) =>
          m.id === text.material.id
            ? { ...replaced.material, bindingNodeIds: ["n_impl"] }
            : m,
        ),
      });
      expect(impact.requiresRereview).toBe(true);
      expect(impact.mechanicalFullRerun).toBe(false);
      expect(impact.affectedNodeIds).toContain("n_impl");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks vision attach for magic-mismatch / upload:// path contentRef", () => {
    const bad = ingestLoopTaskMaterial({
      fileName: "fake.png",
      mimeType: "image/png",
      bytes: new TextEncoder().encode("not-a-png"),
    });
    expect(bad.ok).toBe(false);
    if (bad.material) {
      expect(bad.material.parseLevel).toBe("unsupported");
    }
    const projected = projectMaterialsForNode({
      materials: [
        {
          id: "img",
          kind: "image",
          purpose: "error_screenshot",
          title: "x.png",
          source: "upload",
          parseStatus: "ok",
          parseLevel: "vision_attach",
          contentRef: "upload://x.png",
          createdAt: new Date().toISOString(),
        },
      ],
      modelProfile: {
        id: "p",
        name: "gpt",
        provider: "openai",
        model: "gpt-4o",
        apiKeyRef: "k",
      },
    });
    expect(projected.images).toEqual([]);
  });
});
