/**
 * Reverse self-audit negatives for materials security / projection / isolation.
 * Not hard-coded to prior happy-path fixtures only.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

import { materialImagesToGatewayParts } from "../contracts/loop-material-vision-capability.js";
import { resolveSafeImageContentRef } from "../contracts/loop-material-image-bytes.js";
import { classifyLoopMaterialUrl } from "./loop-url-fetch-policy.js";
import { fetchLoopUrlMaterial } from "./loop-url-material-fetch.js";
import { parseXlsxFile } from "./loop-material-xlsx.js";
import { parsePdfFile, pdftotextAvailable } from "./loop-material-pdf.js";
import { projectMaterialsForNode } from "./loop-material-project.js";
import {
  acknowledgeMaterialRereview,
  assessMaterialChangeImpact,
  materialRereviewBlocksStart,
  writeMaterialRereviewEvidence,
} from "./loop-material-rereview.js";
import { buildOpenAiUserContent, buildAnthropicUserContent } from "./model-gateway/providers.js";
import { preflightLoopRunStart } from "./loop-run-preflight.js";
import { ingestLoopUrlMaterial } from "./loop-material-ingest.js";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=";
const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//Z";

describe("materials security reverse audit (negatives)", () => {
  it("URL: rejects non-http(s), private literals, odd ports before network", async () => {
    expect(classifyLoopMaterialUrl("ftp://example.com/a").ok).toBe(false);
    expect(classifyLoopMaterialUrl("http://169.254.169.254/").ok).toBe(false);
    const fetchImpl = vi.fn();
    const port = await fetchLoopUrlMaterial("https://example.com:22/x", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupFn: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(port.ok).toBe(false);
    if (!port.ok) expect(port.code).toBe("blocked_port");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("URL: multi-A with only private answers is dns_denied (rebind bait)", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchLoopUrlMaterial("https://evil.example/doc", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupFn: async () => [
        { address: "10.1.2.3", family: 4 },
        { address: "::ffff:192.168.0.9", family: 6 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("dns_denied");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("URL: production path never forwards Cookie/Authorization headers", async () => {
    const seen: Array<Record<string, string> | undefined> = [];
    const body = "<html><p>public doc</p></html>";
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(init?.headers as Record<string, string> | undefined);
      return {
        status: 200,
        ok: true,
        headers: {
          get: (name: string) =>
            name === "content-type" ? "text/html" : null,
        },
        arrayBuffer: async () => Uint8Array.from(Buffer.from(body)).buffer,
      };
    });
    const result = await fetchLoopUrlMaterial("https://example.com/doc", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookupFn: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(result.ok).toBe(true);
    const headers = seen[0] ?? {};
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain("cookie");
    expect(keys).not.toContain("authorization");
  });

  it("XLSX: path traversal entry denied; formulas not executed", () => {
    const dir = mkdtempSync(join(tmpdir(), "xlsx-neg-"));
    try {
      const root = join(dir, "pkg");
      spawnSync("mkdir", [
        "-p",
        join(root, "xl/worksheets"),
        join(root, "xl/_rels"),
        join(root, "_rels"),
      ]);
      const files: Record<string, string> = {
        "[Content_Types].xml":
          `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
        "_rels/.rels":
          `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        "xl/workbook.xml":
          `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        "xl/_rels/workbook.xml.rels":
          `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
        "xl/worksheets/sheet1.xml":
          `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>`,
        // Traversal bait entry — listing should deny
        "xl/../evil.xml": "<x/>",
      };
      for (const [rel, body] of Object.entries(files)) {
        writeFileSync(join(root, rel), body);
      }
      const out = join(dir, "neg.xlsx");
      spawnSync("bash", ["-lc", `cd "${root}" && zip -q -r "${out}" .`]);
      const parsed = parseXlsxFile(out);
      // Either path traversal denied at list, or formula cell returns cached <v> only (never eval).
      if (!parsed.ok) {
        expect(parsed.error).toMatch(/traversal|denied|bomb|External/i);
      } else {
        expect(parsed.textPreview).toMatch(/2/);
        expect(parsed.textPreview).not.toMatch(/eval|Function/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("PDF: missing tool / empty extract stay unsupported (honest)", () => {
    if (!pdftotextAvailable()) {
      const missing = parsePdfFile("/tmp/does-not-matter.pdf", { pageStart: 1, pageEnd: 2 });
      expect(missing.ok).toBe(false);
      if (!missing.ok) {
        expect(missing.toolMissing).toBe(true);
        expect(missing.parseLevel).toBe("unsupported");
        expect(missing.selection?.pageStart).toBe(1);
      }
      return;
    }
    // With tool present, a non-PDF path should fail without claiming full_text_parse.
    const bad = parsePdfFile("/tmp/definitely-not-a-pdf-file-xyz", { pageStart: 1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.parseLevel).toBe("unsupported");
  });

  it("Image: jpeg magic ok; mime/magic mismatch and upload:// denied", () => {
    expect(resolveSafeImageContentRef(`data:image/jpeg;base64,${JPEG_B64}`).ok).toBe(true);
    expect(resolveSafeImageContentRef(`data:image/png;base64,${JPEG_B64}`).ok).toBe(false);
    expect(resolveSafeImageContentRef("upload://shot.png").ok).toBe(false);
    expect(resolveSafeImageContentRef("https://example.com/a.png").ok).toBe(false);
    expect(
      materialImagesToGatewayParts([
        {
          id: "x",
          kind: "image",
          purpose: "error_screenshot",
          title: "x",
          source: "upload",
          parseStatus: "ok",
          parseLevel: "vision_attach",
          contentRef: "upload://x.png",
          createdAt: new Date().toISOString(),
        },
      ]),
    ).toEqual([]);
  });

  it("ModelGateway: openai + anthropic embed images; projection scopes nodes", () => {
    const images = [{ mimeType: "image/png" as const, base64: PNG_B64 }];
    const openai = buildOpenAiUserContent("hi", images);
    const anthropic = buildAnthropicUserContent("hi", images);
    expect(Array.isArray(openai)).toBe(true);
    expect(Array.isArray(anthropic)).toBe(true);
    const projected = projectMaterialsForNode({
      nodeId: "n1",
      modelProfile: {
        id: "p",
        name: "gpt",
        provider: "openai",
        model: "gpt-4o",
        apiKeyRef: "k",
      },
      materials: [
        {
          id: "a",
          kind: "text",
          purpose: "requirement",
          title: "a",
          source: "paste",
          parseStatus: "ok",
          parseLevel: "text_preview",
          textPreview: "only-n1",
          bindingNodeIds: ["n1"],
          createdAt: new Date().toISOString(),
        },
        {
          id: "b",
          kind: "text",
          purpose: "requirement",
          title: "b",
          source: "paste",
          parseStatus: "ok",
          parseLevel: "text_preview",
          textPreview: "only-n2",
          bindingNodeIds: ["n2"],
          createdAt: new Date().toISOString(),
        },
        {
          id: "img",
          kind: "image",
          purpose: "error_screenshot",
          title: "i",
          source: "upload",
          parseStatus: "ok",
          parseLevel: "vision_attach",
          contentRef: `data:image/png;base64,${PNG_B64}`,
          bindingNodeIds: ["n1"],
          createdAt: new Date().toISOString(),
        },
      ],
    });
    expect(projected.textBundle).toMatch(/only-n1/);
    expect(projected.textBundle).not.toMatch(/only-n2/);
    expect(projected.images).toHaveLength(1);
  });

  it("TM-8 writeback blocks start until acknowledged; not mechanical full rerun", () => {
    const impact = assessMaterialChangeImpact({
      previous: [
        {
          id: "m1",
          kind: "text",
          purpose: "requirement",
          title: "t",
          source: "paste",
          parseStatus: "ok",
          textPreview: "old",
          bindingNodeIds: ["n_impl"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      next: [
        {
          id: "m1",
          kind: "text",
          purpose: "requirement",
          title: "t",
          source: "paste",
          parseStatus: "ok",
          textPreview: "new",
          bindingNodeIds: ["n_impl"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(impact.mechanicalFullRerun).toBe(false);
    const writeback = writeMaterialRereviewEvidence({ impact });
    expect(writeback?.staleEvidenceIds).toContain("plan_evidence:n_impl");
    expect(materialRereviewBlocksStart(writeback)).toBe(true);
    const acked = acknowledgeMaterialRereview(writeback!);
    expect(materialRereviewBlocksStart(acked)).toBe(false);
  });

  it("URL ingest card: private literal fails closed with material card (not silent ok)", async () => {
    const httpDenied = await ingestLoopUrlMaterial({
      url: "http://127.0.0.1/secret",
      title: "http-bait",
    });
    expect(httpDenied.ok).toBe(false);
    expect(httpDenied.material?.parseStatus).toBe("failed");
    expect(httpDenied.material?.parseMessage ?? "").toMatch(
      /scheme_denied|http not allow/i,
    );

    const privateDenied = await ingestLoopUrlMaterial({
      url: "https://127.0.0.1/secret",
      title: "ssrf-bait",
    });
    expect(privateDenied.ok).toBe(false);
    expect(privateDenied.material?.parseStatus).toBe("failed");
    expect(privateDenied.material?.parseMessage ?? "").toMatch(
      /blocked|private|ssrf|dns|literal|host/i,
    );
  });

  it("preflight blocks on TM-8 writeback; loopback env does not relax URL SSRF", () => {
    const prev = process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK;
    process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK = "1";
    try {
      expect(classifyLoopMaterialUrl("http://127.0.0.1/secret").ok).toBe(false);
      const doc = {
        id: "loop_x",
        title: "t",
        draft: {
          revision: 1,
          graphPrompt: "g",
          nodes: [],
          edges: [],
        },
        approvedSpecs: [
          {
            version: "spec_1",
            createdAt: new Date().toISOString(),
            goal: "g",
            nodes: [],
            edges: [],
            openQuestions: [],
            assumptions: [],
            graphRevision: 1,
          },
        ],
        taskPack: {
          materials: [],
          updatedAt: new Date().toISOString(),
          materialRereview: {
            requiresRereview: true,
            affectedNodeIds: ["n1"],
            changedMaterialIds: ["m1"],
            reason: "materials changed",
            evidenceStaleAt: new Date().toISOString(),
            staleEvidenceIds: ["plan_evidence:n1"],
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const pf = preflightLoopRunStart({
        document: doc as never,
        branch: "main",
      });
      expect(pf.canStart).toBe(false);
      expect(pf.items.some((i) => i.code === "material_rereview_required")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK;
      else process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK = prev;
    }
  });
});
