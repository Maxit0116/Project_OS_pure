/**
 * PDF text page/partial parse — phased.
 * Uses `pdftotext` when present; otherwise returns unsupported with page
 * selection preserved for run snapshot (selection still recorded).
 */
import { spawnSync } from "node:child_process";

export type PdfSelection = {
  pageStart?: number;
  pageEnd?: number;
};

export type PdfParseResult =
  | {
      ok: true;
      textPreview: string;
      parseLevel: "full_text_parse";
      pageCount?: number;
      selection?: PdfSelection;
      tool: "pdftotext";
    }
  | {
      ok: false;
      error: string;
      parseLevel: "unsupported";
      selection?: PdfSelection;
      toolMissing?: boolean;
    };

export function pdftotextAvailable(): boolean {
  const spawned = spawnSync("pdftotext", ["-v"], { encoding: "utf8" });
  // poppler prints version to stderr; status may be 0 or 99
  return spawned.status === 0 || /pdftotext/i.test(spawned.stderr ?? "");
}

export function parsePdfFile(
  pdfPath: string,
  selection?: PdfSelection | null,
): PdfParseResult {
  if (!pdftotextAvailable()) {
    return {
      ok: false,
      parseLevel: "unsupported",
      toolMissing: true,
      error:
        "pdftotext not installed — PDF page selection recorded but full_text_parse unavailable",
      ...(selection ? { selection } : {}),
    };
  }
  const args = ["-layout", "-enc", "UTF-8"];
  if (selection?.pageStart != null) {
    args.push("-f", String(selection.pageStart));
  }
  if (selection?.pageEnd != null) {
    args.push("-l", String(selection.pageEnd));
  }
  args.push(pdfPath, "-");
  const spawned = spawnSync("pdftotext", args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (spawned.status !== 0) {
    return {
      ok: false,
      parseLevel: "unsupported",
      error: (spawned.stderr || "pdftotext failed").slice(0, 500),
      ...(selection ? { selection } : {}),
    };
  }
  const text = (spawned.stdout ?? "").trim();
  if (!text) {
    return {
      ok: false,
      parseLevel: "unsupported",
      error: "PDF text extract empty",
      ...(selection ? { selection } : {}),
    };
  }
  return {
    ok: true,
    parseLevel: "full_text_parse",
    textPreview: text.slice(0, 8_000),
    tool: "pdftotext",
    ...(selection ? { selection } : {}),
  };
}
