/**
 * PDF text page/partial parse — phased.
 * Uses `pdftotext` when present; otherwise returns unsupported with page
 * selection preserved for run snapshot (selection still recorded).
 *
 * Honest states: tool missing, encrypted, scanned/empty text, partial pages,
 * process timeout / cancel, output cap — never claim full_text_parse without text.
 */
import { spawn, spawnSync } from "node:child_process";

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
      partialPages?: boolean;
    }
  | {
      ok: false;
      error: string;
      parseLevel: "unsupported";
      selection?: PdfSelection;
      toolMissing?: boolean;
      encrypted?: boolean;
      scannedOrEmpty?: boolean;
      timedOut?: boolean;
      cancelled?: boolean;
    };

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export function pdftotextAvailable(): boolean {
  const spawned = spawnSync("pdftotext", ["-v"], { encoding: "utf8" });
  // poppler prints version to stderr; status may be 0 or 99
  return spawned.status === 0 || /pdftotext/i.test(spawned.stderr ?? "");
}

function classifyPdfFailure(
  stderr: string,
  selection?: PdfSelection | null,
): PdfParseResult {
  const lower = stderr.toLowerCase();
  if (/encrypted|password|owner password|user password/i.test(lower)) {
    return {
      ok: false,
      parseLevel: "unsupported",
      encrypted: true,
      error: "PDF is encrypted — text extract unavailable without credentials (not attempted)",
      ...(selection ? { selection } : {}),
    };
  }
  return {
    ok: false,
    parseLevel: "unsupported",
    error: (stderr || "pdftotext failed").slice(0, 500),
    ...(selection ? { selection } : {}),
  };
}

/**
 * Sync parse (spawnSync). Prefer `parsePdfFileAsync` when AbortSignal / timeout needed.
 */
export function parsePdfFile(
  pdfPath: string,
  selection?: PdfSelection | null,
  options?: { timeoutMs?: number; maxOutputBytes?: number },
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
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
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
    maxBuffer: maxOutputBytes,
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  if (spawned.error && (spawned.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
    return {
      ok: false,
      parseLevel: "unsupported",
      timedOut: true,
      error: `pdftotext timed out after ${timeoutMs}ms`,
      ...(selection ? { selection } : {}),
    };
  }
  if (spawned.status !== 0) {
    return classifyPdfFailure(spawned.stderr ?? "", selection);
  }
  const text = (spawned.stdout ?? "").trim();
  if (!text) {
    return {
      ok: false,
      parseLevel: "unsupported",
      scannedOrEmpty: true,
      error:
        "PDF text extract empty — likely scanned/image-only pages; page selection recorded, no full_text_parse",
      ...(selection ? { selection } : {}),
    };
  }
  const partialPages =
    selection?.pageStart != null || selection?.pageEnd != null ? true : undefined;
  return {
    ok: true,
    parseLevel: "full_text_parse",
    textPreview: text.slice(0, 8_000),
    tool: "pdftotext",
    ...(partialPages ? { partialPages: true } : {}),
    ...(selection ? { selection } : {}),
  };
}

/** Async parse with AbortSignal + soft timeout (kills child). */
export function parsePdfFileAsync(
  pdfPath: string,
  selection?: PdfSelection | null,
  options?: {
    timeoutMs?: number;
    maxOutputBytes?: number;
    signal?: AbortSignal;
  },
): Promise<PdfParseResult> {
  if (!pdftotextAvailable()) {
    return Promise.resolve({
      ok: false,
      parseLevel: "unsupported",
      toolMissing: true,
      error:
        "pdftotext not installed — PDF page selection recorded but full_text_parse unavailable",
      ...(selection ? { selection } : {}),
    });
  }
  if (options?.signal?.aborted) {
    return Promise.resolve({
      ok: false,
      parseLevel: "unsupported",
      cancelled: true,
      error: "PDF parse cancelled",
      ...(selection ? { selection } : {}),
    });
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const args = ["-layout", "-enc", "UTF-8"];
  if (selection?.pageStart != null) args.push("-f", String(selection.pageStart));
  if (selection?.pageEnd != null) args.push("-l", String(selection.pageEnd));
  args.push(pdfPath, "-");

  return new Promise((resolve) => {
    const child = spawn("pdftotext", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = (result: PdfParseResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const onAbort = () => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        parseLevel: "unsupported",
        cancelled: true,
        error: "PDF parse cancelled",
        ...(selection ? { selection } : {}),
      });
    };
    options?.signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        parseLevel: "unsupported",
        timedOut: true,
        error: `pdftotext timed out after ${timeoutMs}ms`,
        ...(selection ? { selection } : {}),
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > maxOutputBytes) {
        child.kill("SIGKILL");
        finish({
          ok: false,
          parseLevel: "unsupported",
          error: `pdftotext output exceeds ${maxOutputBytes}B cap`,
          ...(selection ? { selection } : {}),
        });
        return;
      }
      chunks.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      errChunks.push(chunk);
    });
    child.on("error", (error) => {
      finish({
        ok: false,
        parseLevel: "unsupported",
        error: error.message.slice(0, 500),
        ...(selection ? { selection } : {}),
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      const stderr = Buffer.concat(errChunks).toString("utf8");
      if (code !== 0) {
        finish(classifyPdfFailure(stderr, selection));
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        finish({
          ok: false,
          parseLevel: "unsupported",
          scannedOrEmpty: true,
          error:
            "PDF text extract empty — likely scanned/image-only pages; page selection recorded, no full_text_parse",
          ...(selection ? { selection } : {}),
        });
        return;
      }
      const partialPages =
        selection?.pageStart != null || selection?.pageEnd != null ? true : undefined;
      finish({
        ok: true,
        parseLevel: "full_text_parse",
        textPreview: text.slice(0, 8_000),
        tool: "pdftotext",
        ...(partialPages ? { partialPages: true } : {}),
        ...(selection ? { selection } : {}),
      });
    });
  });
}
