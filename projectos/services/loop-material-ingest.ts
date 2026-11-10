/**
 * Multi-type Loop task material ingest (Electron / LocalApi host).
 * Turns raw file bytes into a LoopTaskMaterial with honest parseLevel.
 * Browser alone cannot run unzip/pdftotext — host required for xlsx/pdf.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classifyLoopMaterialFormat } from "../contracts/loop-task-material-formats.js";
import { parseAndSelectCsv } from "../contracts/loop-material-csv.js";
import { resolveSafeImageContentRef } from "../contracts/loop-material-image-bytes.js";
import type { LoopTaskMaterial } from "../contracts/loop-task-materials.js";
import { parsePdfFile } from "./loop-material-pdf.js";
import { parseXlsxFile, type XlsxSelection } from "./loop-material-xlsx.js";

export type IngestLoopMaterialInput = {
  fileName: string;
  mimeType?: string;
  /** Raw file bytes (not base64). Cap enforced. */
  bytes: Uint8Array;
  materialId?: string;
  xlsxSelection?: XlsxSelection | null;
  pdfSelection?: { pageStart?: number; pageEnd?: number } | null;
  now?: string;
};

export type IngestLoopMaterialResult =
  | { ok: true; material: LoopTaskMaterial }
  | { ok: false; error: string; material?: LoopTaskMaterial };

const MAX_BYTES = 12 * 1024 * 1024;

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Ingest one uploaded file into a run material snapshot.
 * Does not grant extra privileges from file/prompt instructions.
 */
export function ingestLoopTaskMaterial(
  input: IngestLoopMaterialInput,
): IngestLoopMaterialResult {
  const now = input.now ?? new Date().toISOString();
  const fileName = input.fileName.slice(0, 240) || "upload";
  const mime = (input.mimeType || "application/octet-stream").slice(0, 120);
  if (input.bytes.byteLength > MAX_BYTES) {
    return {
      ok: false,
      error: `File ${input.bytes.byteLength}B exceeds ${MAX_BYTES}B ingest cap`,
    };
  }
  const format = classifyLoopMaterialFormat({ mimeType: mime, fileName });
  const materialId = input.materialId ?? newId(`mat_${format.formatId}`);

  if (format.formatId === "image") {
    const base64 = Buffer.from(input.bytes).toString("base64");
    const mimeOk =
      mime === "image/png" || mime === "image/jpeg"
        ? mime
        : /\.png$/i.test(fileName)
          ? "image/png"
          : /\.jpe?g$/i.test(fileName)
            ? "image/jpeg"
            : mime;
    const contentRef =
      mimeOk === "image/png" || mimeOk === "image/jpeg"
        ? `data:${mimeOk};base64,${base64}`
        : undefined;
    const safe = resolveSafeImageContentRef(contentRef);
    const wired = safe.ok;
    const material: LoopTaskMaterial = {
      id: materialId,
      kind: "image",
      purpose: "error_screenshot",
      title: fileName,
      source: "upload",
      parseStatus: wired ? "ok" : "unsupported",
      parseLevel: wired ? "vision_attach" : "unsupported",
      parseMessage: wired
        ? "vision_attach — verified bytes ready for ModelGateway.images when apiFormat supports vision"
        : (safe.ok ? format.reason : safe.reason),
      mimeType: mimeOk,
      sizeBytes: input.bytes.byteLength,
      measuredSizeBytes: input.bytes.byteLength,
      ...(contentRef && wired ? { contentRef } : {}),
      version: 1,
      runOverride: true,
      createdAt: now,
      updatedAt: now,
    };
    return wired
      ? { ok: true, material }
      : { ok: false, error: material.parseMessage ?? "image unsupported", material };
  }

  if (format.formatId === "csv") {
    const text = Buffer.from(input.bytes).toString("utf8");
    const parsed = parseAndSelectCsv(text);
    if (!parsed.ok) {
      const failed: LoopTaskMaterial = {
        id: materialId,
        kind: "table",
        purpose: "test_data",
        title: fileName,
        source: "upload",
        parseStatus: "failed",
        parseLevel: "unsupported",
        parseMessage: parsed.error.slice(0, 500),
        mimeType: mime || "text/csv",
        sizeBytes: input.bytes.byteLength,
        measuredSizeBytes: input.bytes.byteLength,
        version: 1,
        runOverride: true,
        createdAt: now,
        updatedAt: now,
      };
      return { ok: false, error: parsed.error, material: failed };
    }
    return {
      ok: true,
      material: {
        id: materialId,
        kind: "table",
        purpose: "test_data",
        title: fileName,
        source: "upload",
        parseStatus: "ok",
        parseLevel: parsed.parseLevel,
        parseMessage:
          "CSV loaded — choose columns/rows to apply structured_selection into run snapshot",
        textPreview: parsed.textPreview,
        tablePreview: {
          columns: parsed.table.headers,
          rowStart: 1,
          rowEnd: Math.max(1, parsed.table.rows.length),
        },
        mimeType: mime || "text/csv",
        sizeBytes: input.bytes.byteLength,
        measuredSizeBytes: input.bytes.byteLength,
        contentRef: `upload://${fileName}`,
        version: 1,
        runOverride: true,
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  if (format.formatId === "xlsx") {
    const dir = mkdtempSync(join(tmpdir(), "loop-xlsx-ingest-"));
    try {
      const path = join(dir, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
      writeFileSync(path, input.bytes);
      const parsed = parseXlsxFile(path, input.xlsxSelection);
      if (!parsed.ok) {
        const failed: LoopTaskMaterial = {
          id: materialId,
          kind: "table",
          purpose: "test_data",
          title: fileName,
          source: "upload",
          parseStatus: "failed",
          parseLevel: "unsupported",
          parseMessage: parsed.error.slice(0, 500),
          mimeType: mime,
          sizeBytes: input.bytes.byteLength,
          measuredSizeBytes: input.bytes.byteLength,
          version: 1,
          runOverride: true,
          createdAt: now,
          updatedAt: now,
        };
        return { ok: false, error: parsed.error, material: failed };
      }
      return {
        ok: true,
        material: {
          id: materialId,
          kind: "table",
          purpose: "test_data",
          title: fileName,
          source: "upload",
          parseStatus: "ok",
          parseLevel: parsed.parseLevel,
          parseMessage: `XLSX sheet=${parsed.sheet}; sheets=[${parsed.sheets.join(",")}]`,
          textPreview: parsed.textPreview,
          tablePreview: {
            sheet: parsed.sheet,
            ...(input.xlsxSelection?.cellRange
              ? { rowRange: input.xlsxSelection.cellRange }
              : {}),
            ...(input.xlsxSelection?.role
              ? { role: input.xlsxSelection.role }
              : {}),
          },
          mimeType: mime,
          sizeBytes: input.bytes.byteLength,
          measuredSizeBytes: input.bytes.byteLength,
          contentRef: `upload://${fileName}`,
          version: 1,
          runOverride: true,
          createdAt: now,
          updatedAt: now,
        },
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (format.formatId === "pdf") {
    const dir = mkdtempSync(join(tmpdir(), "loop-pdf-ingest-"));
    try {
      const path = join(dir, fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
      writeFileSync(path, input.bytes);
      const parsed = parsePdfFile(path, input.pdfSelection);
      if (!parsed.ok) {
        const failed: LoopTaskMaterial = {
          id: materialId,
          kind: "file",
          purpose: "requirement",
          title: fileName,
          source: "upload",
          parseStatus: parsed.toolMissing ? "unsupported" : "failed",
          parseLevel: "unsupported",
          parseMessage: parsed.error.slice(0, 500),
          pdfPreview: {
            ...(input.pdfSelection?.pageStart != null
              ? { pageStart: input.pdfSelection.pageStart }
              : {}),
            ...(input.pdfSelection?.pageEnd != null
              ? { pageEnd: input.pdfSelection.pageEnd }
              : {}),
          },
          mimeType: mime || "application/pdf",
          sizeBytes: input.bytes.byteLength,
          measuredSizeBytes: input.bytes.byteLength,
          version: 1,
          runOverride: true,
          createdAt: now,
          updatedAt: now,
        };
        return { ok: false, error: parsed.error, material: failed };
      }
      return {
        ok: true,
        material: {
          id: materialId,
          kind: "file",
          purpose: "requirement",
          title: fileName,
          source: "upload",
          parseStatus: "ok",
          parseLevel: "full_text_parse",
          parseMessage: parsed.partialPages
            ? "PDF full_text_parse (partial page range)"
            : "PDF full_text_parse via pdftotext",
          textPreview: parsed.textPreview,
          pdfPreview: {
            ...(input.pdfSelection?.pageStart != null
              ? { pageStart: input.pdfSelection.pageStart }
              : {}),
            ...(input.pdfSelection?.pageEnd != null
              ? { pageEnd: input.pdfSelection.pageEnd }
              : {}),
          },
          mimeType: mime || "application/pdf",
          sizeBytes: input.bytes.byteLength,
          measuredSizeBytes: input.bytes.byteLength,
          contentRef: `upload://${fileName}`,
          version: 1,
          runOverride: true,
          createdAt: now,
          updatedAt: now,
        },
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (format.parseLevel === "text_preview") {
    const text = Buffer.from(input.bytes).toString("utf8");
    return {
      ok: true,
      material: {
        id: materialId,
        kind: "file",
        purpose: "other",
        title: fileName,
        source: "upload",
        parseStatus: "ok",
        parseLevel: "text_preview",
        parseMessage: format.reason,
        textPreview: text.slice(0, 8_000),
        mimeType: mime || "text/plain",
        sizeBytes: input.bytes.byteLength,
        measuredSizeBytes: input.bytes.byteLength,
        contentRef: `upload://${fileName}`,
        version: 1,
        runOverride: true,
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  const unsupported: LoopTaskMaterial = {
    id: materialId,
    kind: "file",
    purpose: "other",
    title: fileName,
    source: "upload",
    parseStatus: "unsupported",
    parseLevel: "unsupported",
    parseMessage: format.reason,
    mimeType: mime,
    sizeBytes: input.bytes.byteLength,
    measuredSizeBytes: input.bytes.byteLength,
    version: 1,
    runOverride: true,
    createdAt: now,
    updatedAt: now,
  };
  return { ok: false, error: format.reason, material: unsupported };
}

export type IngestLoopUrlMaterialInput = {
  url: string;
  materialId?: string;
  title?: string;
  now?: string;
  /** Test DI only — production LocalApi must omit (pinned DNS path). */
  fetchDeps?: import("./loop-url-material-fetch.js").UrlMaterialFetchDeps;
};

/**
 * URL → task material via DNS-pinned fetch. Failures become cards with honest
 * parseStatus (SSRF / login_wall / http_error) — never silent success.
 */
export async function ingestLoopUrlMaterial(
  input: IngestLoopUrlMaterialInput,
): Promise<IngestLoopMaterialResult> {
  const { fetchLoopUrlMaterial } = await import("./loop-url-material-fetch.js");
  const now = input.now ?? new Date().toISOString();
  const rawUrl = input.url.trim();
  const materialId = input.materialId ?? newId("mat_url");
  const title = (input.title?.trim() || rawUrl).slice(0, 240);
  const fetched = await fetchLoopUrlMaterial(rawUrl, input.fetchDeps ?? {});
  if (!fetched.ok) {
    const material: LoopTaskMaterial = {
      id: materialId,
      kind: "url",
      purpose: "requirement",
      title,
      source: "url",
      parseStatus: "failed",
      parseLevel: "unsupported",
      parseMessage: `${fetched.code}: ${fetched.message}`.slice(0, 500),
      contentRef: rawUrl.slice(0, 500),
      version: 1,
      runOverride: true,
      createdAt: now,
      updatedAt: now,
    };
    return { ok: false, error: material.parseMessage ?? fetched.code, material };
  }
  return {
    ok: true,
    material: {
      id: materialId,
      kind: "url",
      purpose: "requirement",
      title,
      source: "url",
      parseStatus: "ok",
      parseLevel: "text_preview",
      parseMessage: fetched.truncated
        ? "URL text_preview truncated — full_text_parse not claimed"
        : "URL text_preview via DNS-pinned fetch (no Cookie/Authorization forwarded)",
      textPreview: fetched.textPreview,
      mimeType: fetched.mimeType?.slice(0, 120),
      measuredSizeBytes: fetched.measuredSizeBytes,
      contentRef: fetched.finalUrl.slice(0, 500),
      version: 1,
      runOverride: true,
      createdAt: now,
      updatedAt: now,
    },
  };
}
