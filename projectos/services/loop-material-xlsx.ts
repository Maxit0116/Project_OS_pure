/**
 * Minimal XLSX sheet/range reader (OOXML) via system `unzip -p`.
 * No sheetjs dependency. First usable: list sheets + extract cell text for a sheet/range.
 * Not a full Excel engine — formulas/shared-string edge cases may be partial.
 */
import { spawnSync } from "node:child_process";

export type XlsxSheetInfo = { name: string; path: string };

export type XlsxSelection = {
  sheet?: string;
  /** A1-style range e.g. A1:C10 — optional; default used range. */
  cellRange?: string;
  role?: "requirement" | "test" | "business";
};

export type XlsxParseResult =
  | {
      ok: true;
      sheets: string[];
      sheet: string;
      textPreview: string;
      parseLevel: "structured_selection" | "text_preview";
      selection?: XlsxSelection;
    }
  | { ok: false; error: string };

function unzipEntry(xlsxPath: string, entry: string): string | null {
  const spawned = spawnSync("unzip", ["-p", xlsxPath, entry], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (spawned.status !== 0) return null;
  return spawned.stdout ?? "";
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function listSheets(workbookXml: string): XlsxSheetInfo[] {
  const sheets: XlsxSheetInfo[] = [];
  const re =
    /<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(workbookXml))) {
    sheets.push({ name: decodeXmlEntities(match[1]!), path: match[2]! });
  }
  return sheets;
}

function mapSheetPaths(relsXml: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re =
    /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(relsXml))) {
    const target = match[2]!.replace(/^\//, "");
    map[match[1]!] = target.startsWith("worksheets/")
      ? `xl/${target}`
      : target.startsWith("xl/")
        ? target
        : `xl/${target}`;
  }
  return map;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let match: RegExpExecArray | null;
  while ((match = siRe.exec(xml))) {
    const chunk = match[1]!;
    const texts = [...chunk.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gi)].map((m) =>
      decodeXmlEntities(m[1] ?? ""),
    );
    out.push(texts.join(""));
  }
  return out;
}

function colRowFromRef(ref: string): { col: number; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref.trim());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]!.toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return { col, row: Number(m[2]) };
}

function parseRange(range: string | undefined): {
  c1: number;
  r1: number;
  c2: number;
  r2: number;
} | null {
  if (!range?.trim()) return null;
  const [a, b] = range.split(":");
  const start = colRowFromRef(a ?? "");
  const end = colRowFromRef(b ?? a ?? "");
  if (!start || !end) return null;
  return {
    c1: Math.min(start.col, end.col),
    r1: Math.min(start.row, end.row),
    c2: Math.max(start.col, end.col),
    r2: Math.max(start.row, end.row),
  };
}

function extractSheetMatrix(
  sheetXml: string,
  shared: string[],
  range?: string,
): string[][] {
  const bounds = parseRange(range);
  const cells = new Map<string, string>();
  const re = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
  let match: RegExpExecArray | null;
  let maxRow = 0;
  let maxCol = 0;
  while ((match = re.exec(sheetXml))) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const ref = /(?:^|\s)r="([A-Z]+\d+)"/i.exec(attrs)?.[1];
    if (!ref) continue;
    const pos = colRowFromRef(ref);
    if (!pos) continue;
    if (
      bounds &&
      (pos.col < bounds.c1 ||
        pos.col > bounds.c2 ||
        pos.row < bounds.r1 ||
        pos.row > bounds.r2)
    ) {
      continue;
    }
    const type = /(?:^|\s)t="([^"]*)"/i.exec(attrs)?.[1] ?? "";
    const raw = /<v>([\s\S]*?)<\/v>/i.exec(inner)?.[1] ?? "";
    let value = raw;
    if (type === "s") {
      const idx = Number(raw);
      value = Number.isFinite(idx) ? (shared[idx] ?? "") : "";
    }
    cells.set(`${pos.row}:${pos.col}`, decodeXmlEntities(value));
    maxRow = Math.max(maxRow, pos.row);
    maxCol = Math.max(maxCol, pos.col);
  }
  const r1 = bounds?.r1 ?? 1;
  const r2 = bounds?.r2 ?? maxRow;
  const c1 = bounds?.c1 ?? 1;
  const c2 = bounds?.c2 ?? maxCol;
  const matrix: string[][] = [];
  for (let r = r1; r <= r2; r += 1) {
    const row: string[] = [];
    for (let c = c1; c <= c2; c += 1) {
      row.push(cells.get(`${r}:${c}`) ?? "");
    }
    matrix.push(row);
  }
  return matrix;
}

export function parseXlsxFile(
  xlsxPath: string,
  selection?: XlsxSelection | null,
): XlsxParseResult {
  const workbook = unzipEntry(xlsxPath, "xl/workbook.xml");
  if (!workbook) {
    return {
      ok: false,
      error: "XLSX workbook.xml missing or unzip unavailable",
    };
  }
  const rels = unzipEntry(xlsxPath, "xl/_rels/workbook.xml.rels") ?? "";
  const sheets = listSheets(workbook);
  if (!sheets.length) {
    return { ok: false, error: "XLSX has no sheets" };
  }
  const pathMap = mapSheetPaths(rels);
  const wanted =
    sheets.find((s) => s.name === selection?.sheet) ?? sheets[0]!;
  const sheetPath = pathMap[wanted.path];
  if (!sheetPath) {
    return { ok: false, error: `Sheet path missing for ${wanted.name}` };
  }
  const sheetXml = unzipEntry(xlsxPath, sheetPath);
  if (!sheetXml) {
    return { ok: false, error: `Could not read sheet ${wanted.name}` };
  }
  const sharedXml = unzipEntry(xlsxPath, "xl/sharedStrings.xml") ?? "";
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];
  const matrix = extractSheetMatrix(sheetXml, shared, selection?.cellRange);
  const textPreview = matrix
    .map((row) => row.join("\t"))
    .join("\n")
    .slice(0, 8_000);
  const selectionApplied = Boolean(selection?.sheet || selection?.cellRange);
  return {
    ok: true,
    sheets: sheets.map((s) => s.name),
    sheet: wanted.name,
    textPreview,
    parseLevel: selectionApplied ? "structured_selection" : "text_preview",
    ...(selection ? { selection: { ...selection, sheet: wanted.name } } : {}),
  };
}
