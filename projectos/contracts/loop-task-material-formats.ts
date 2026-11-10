/**
 * First-batch Task Materials format matrix (honest support).
 * Image / spreadsheet / URL binary previews are deferred — mark unsupported,
 * do not pretend parseStatus=ok.
 */

export type LoopMaterialFormatSupport = "supported_preview" | "unsupported";

const TEXT_LIKE_MIME = new Set([
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "text/x-log",
]);

const TEXT_LIKE_EXT = /\.(txt|md|json|csv|log)$/i;

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

export function classifyLoopMaterialFormat(input: {
  mimeType?: string | null;
  fileName?: string | null;
}): {
  support: LoopMaterialFormatSupport;
  reason: string;
} {
  const mime = (input.mimeType ?? "").trim().toLowerCase();
  const name = (input.fileName ?? "").trim();

  if (DEFERRED_EXT.test(name) || DEFERRED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
    return {
      support: "unsupported",
      reason: `First-batch materials only preview plaintext; “${mime || name || "binary"}” deferred`,
    };
  }

  if (TEXT_LIKE_MIME.has(mime) || TEXT_LIKE_EXT.test(name)) {
    return {
      support: "supported_preview",
      reason: "plaintext preview supported in first batch",
    };
  }

  if (!mime && !name) {
    return {
      support: "unsupported",
      reason: "First-batch materials require mime or filename to classify",
    };
  }

  // Unknown binary → unsupported (fail closed for preview).
  return {
    support: "unsupported",
    reason: `First-batch materials only preview plaintext; “${mime || name}” deferred`,
  };
}
