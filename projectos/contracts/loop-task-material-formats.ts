/**
 * First-batch Task Materials format matrix (honest support levels).
 *
 * Levels (do not inflate):
 * - text_preview: capped plaintext preview only
 * - structured_selection: CSV/XLSX column/sheet/row applied (see parsers)
 * - full_text_parse: PDF text extract when tool available
 * - vision_attach: image → ModelGateway.images
 * - unsupported: deferred/blocked — correct safety state, not “done”
 */
export type LoopMaterialParseLevel =
  | "text_preview"
  | "structured_selection"
  | "full_text_parse"
  | "vision_attach"
  | "unsupported";

export type LoopMaterialFormatSupport = LoopMaterialParseLevel;

const TEXT_PREVIEW_MIME = new Set([
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "text/x-log",
]);

const TEXT_PREVIEW_EXT = /\.(txt|md|json|csv|log)$/i;

/** Explicitly deferred in first batch (must not silently parse as ok). */
const DEFERRED_MIME_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml",
];

const DEFERRED_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|pdf|xlsx?|xls|pptx?|docx?)$/i;

export type LoopMaterialFormatClassification = {
  support: LoopMaterialFormatSupport;
  /** Alias of support for call sites that prefer parseLevel naming. */
  parseLevel: LoopMaterialParseLevel;
  reason: string;
  /** Human matrix row id for docs/UI. */
  formatId:
    | "plaintext"
    | "markdown"
    | "json"
    | "csv"
    | "log"
    | "image"
    | "xlsx"
    | "pdf"
    | "other_binary";
};

function detectFormatId(mime: string, name: string): LoopMaterialFormatClassification["formatId"] {
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name)) {
    return "image";
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("ms-excel") ||
    /\.xlsx?$/i.test(name)
  ) {
    return "xlsx";
  }
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (mime === "text/csv" || /\.csv$/i.test(name)) return "csv";
  if (mime === "application/json" || /\.json$/i.test(name)) return "json";
  if (mime === "text/markdown" || /\.md$/i.test(name)) return "markdown";
  if (mime === "text/x-log" || /\.log$/i.test(name)) return "log";
  if (mime === "text/plain" || /\.txt$/i.test(name)) return "plaintext";
  return "other_binary";
}

export function classifyLoopMaterialFormat(input: {
  mimeType?: string | null;
  fileName?: string | null;
}): LoopMaterialFormatClassification {
  const mime = (input.mimeType ?? "").trim().toLowerCase();
  const name = (input.fileName ?? "").trim();
  const formatId = detectFormatId(mime, name);

  if (DEFERRED_EXT.test(name) || DEFERRED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
    const deferredNote =
      formatId === "image"
        ? " — keep card; vision via ModelGateway apiFormat preflight (openai_chat/anthropic_messages → vision_attach)"
        : formatId === "xlsx"
          ? " — use OOXML sheet/range parser (services/loop-material-xlsx); classify alone ≠ structured"
          : formatId === "pdf"
            ? " — page extract via pdftotext when available (otherwise unsupported + page selection kept)"
            : " — not text_preview; structured_selection requires parser apply";
    return {
      support: "unsupported",
      parseLevel: "unsupported",
      formatId,
      reason: `First-batch: “${mime || name || "binary"}” is unsupported${deferredNote}`,
    };
  }

  if (TEXT_PREVIEW_MIME.has(mime) || TEXT_PREVIEW_EXT.test(name)) {
    const csvNote =
      formatId === "csv"
        ? " — raw CSV text_preview only; sheet/column/range selection NOT implemented"
        : formatId === "json"
          ? " — raw JSON text_preview only; field/schema selection NOT implemented"
          : " — capped text_preview only; full_text_parse NOT implemented";
    return {
      support: "text_preview",
      parseLevel: "text_preview",
      formatId,
      reason: `First-batch ${formatId}${csvNote}`,
    };
  }

  if (!mime && !name) {
    return {
      support: "unsupported",
      parseLevel: "unsupported",
      formatId: "other_binary",
      reason: "First-batch materials require mime or filename to classify",
    };
  }

  return {
    support: "unsupported",
    parseLevel: "unsupported",
    formatId: "other_binary",
    reason: `First-batch: “${mime || name}” unsupported (text_preview only for plaintext/md/json/csv/log)`,
  };
}

/** @deprecated Prefer classifyLoopMaterialFormat(...).support */
export type { LoopMaterialFormatSupport as LoopMaterialFormatSupportAlias };
