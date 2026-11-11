/**
 * First-batch Task Materials format matrix (honest support levels).
 *
 * Levels (do not inflate):
 * - text_preview: capped plaintext preview only
 * - structured_selection: CSV/XLSX column/sheet/row applied (see parsers)
 * - full_text_parse: PDF text extract when tool available
 * - vision_attach: image → ModelGateway.images (needs verified bytes + vision apiFormat)
 * - unsupported: deferred/blocked — correct safety state, not “done”
 *
 * Classification alone ≠ parse complete: CSV/XLSX need selection apply;
 * PDF needs pdftotext; image needs contentRef magic + vision profile.
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

/** Still deferred — not first-batch usable. */
const DEFERRED_MIME_PREFIXES = [
  "audio/",
  "video/",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml",
];

const DEFERRED_EXT = /\.(gif|webp|svg|bmp|pptx?|docx?|xls)$/i;

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
  if (
    (mime.startsWith("image/") && !/gif|webp|svg|bmp/i.test(mime)) ||
    /\.(png|jpe?g)$/i.test(name)
  ) {
    return "image";
  }
  if (mime.startsWith("image/") || /\.(gif|webp|svg|bmp)$/i.test(name)) {
    return "image";
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("ms-excel") ||
    /\.xlsx$/i.test(name)
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

  // First-batch usable image path (png/jpeg only) — vision_attach after bytes+profile.
  if (
    formatId === "image" &&
    (mime === "image/png" ||
      mime === "image/jpeg" ||
      /\.(png|jpe?g)$/i.test(name)) &&
    !/\.(gif|webp|svg|bmp)$/i.test(name)
  ) {
    return {
      support: "vision_attach",
      parseLevel: "vision_attach",
      formatId: "image",
      reason:
        "First-batch image: png/jpeg → vision_attach when verified data: contentRef + openai_chat/anthropic_messages; otherwise preflight blocks",
    };
  }

  if (formatId === "xlsx" && (mime.includes("spreadsheet") || /\.xlsx$/i.test(name))) {
    return {
      support: "structured_selection",
      parseLevel: "structured_selection",
      formatId: "xlsx",
      reason:
        "First-batch XLSX: OOXML sheet/A1 range via loop-material-xlsx (Electron/LocalApi ingest); classify ≠ applied selection",
    };
  }

  if (formatId === "pdf") {
    return {
      support: "full_text_parse",
      parseLevel: "full_text_parse",
      formatId: "pdf",
      reason:
        "First-batch PDF: full_text_parse via pdftotext when installed; missing tool / encrypted / scanned → unsupported + page selection kept",
    };
  }

  if (DEFERRED_EXT.test(name) || DEFERRED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
    return {
      support: "unsupported",
      parseLevel: "unsupported",
      formatId: formatId === "image" ? "image" : "other_binary",
      reason: `First-batch: “${mime || name || "binary"}” is unsupported (deferred format)`,
    };
  }

  if (TEXT_PREVIEW_MIME.has(mime) || TEXT_PREVIEW_EXT.test(name)) {
    const csvNote =
      formatId === "csv"
        ? " — raw text_preview on ingest; structured_selection after column/row apply (loop-material-csv)"
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
    reason: `First-batch: “${mime || name}” unsupported (usable: plaintext/md/json/csv/log/png/jpeg/xlsx/pdf)`,
  };
}

/** @deprecated Prefer classifyLoopMaterialFormat(...).support */
export type { LoopMaterialFormatSupport as LoopMaterialFormatSupportAlias };
