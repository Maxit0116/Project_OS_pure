/**
 * CSV structured selection (first usable table path).
 * Pure JS — no sheetjs. Selection must reshape textPreview / run snapshot.
 */
export type CsvTable = {
  headers: string[];
  rows: string[][];
};

export type CsvSelection = {
  /** Header names to keep; empty/undefined = all columns. */
  columns?: string[];
  /** 1-based inclusive row range over data rows (not header). */
  rowStart?: number;
  rowEnd?: number;
  role?: "requirement" | "test" | "business";
};

export type CsvParseResult =
  | {
      ok: true;
      table: CsvTable;
      parseLevel: "structured_selection" | "text_preview";
      textPreview: string;
      selection?: CsvSelection;
    }
  | { ok: false; error: string };

/** Minimal RFC4180-ish CSV parse (quoted fields, commas, newlines). */
export function parseCsvText(raw: string, maxRows = 5_000): CsvTable {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // Skip trailing empty line
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };
  while (i < raw.length && rows.length <= maxRows) {
    const ch = raw[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = rows[0]!.map((h) => h.trim());
  return { headers, rows: rows.slice(1) };
}

export function applyCsvSelection(
  table: CsvTable,
  selection?: CsvSelection | null,
): { table: CsvTable; selectionApplied: boolean } {
  if (!selection) return { table, selectionApplied: false };
  let headers = table.headers;
  let rows = table.rows;
  let applied = false;
  if (selection.columns?.length) {
    const idxs = selection.columns
      .map((name) => headers.findIndex((h) => h === name))
      .filter((idx) => idx >= 0);
    if (idxs.length) {
      headers = idxs.map((idx) => headers[idx]!);
      rows = rows.map((row) => idxs.map((idx) => row[idx] ?? ""));
      applied = true;
    }
  }
  const start = Math.max(1, selection.rowStart ?? 1);
  const end = Math.max(start, selection.rowEnd ?? rows.length);
  if (selection.rowStart != null || selection.rowEnd != null) {
    rows = rows.slice(start - 1, end);
    applied = true;
  }
  return { table: { headers, rows }, selectionApplied: applied };
}

export function csvTableToPreview(table: CsvTable, maxChars = 8_000): string {
  const lines = [
    table.headers.join(","),
    ...table.rows.map((row) =>
      row
        .map((cell) => {
          if (/[",\n\r]/.test(cell)) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join(","),
    ),
  ];
  const joined = lines.join("\n");
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
}

export function parseAndSelectCsv(
  raw: string,
  selection?: CsvSelection | null,
): CsvParseResult {
  try {
    const parsed = parseCsvText(raw);
    if (!parsed.headers.length && !parsed.rows.length) {
      return { ok: false, error: "CSV is empty" };
    }
    const { table, selectionApplied } = applyCsvSelection(parsed, selection);
    const textPreview = csvTableToPreview(table);
    return {
      ok: true,
      table,
      textPreview,
      parseLevel: selectionApplied ? "structured_selection" : "text_preview",
      ...(selection ? { selection } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "CSV parse failed",
    };
  }
}
