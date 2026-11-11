/**
 * Safe image contentRef → bytes for ModelGateway vision attach.
 * Validates data: URL MIME, base64, magic bytes, and size — does not grant
 * extra privilege from prompt/file instructions.
 */
export type SafeImageBytes =
  | {
      ok: true;
      mimeType: "image/png" | "image/jpeg";
      base64: string;
      byteLength: number;
    }
  | {
      ok: false;
      reason: string;
      code:
        | "missing_ref"
        | "unsupported_scheme"
        | "bad_mime"
        | "bad_base64"
        | "too_large"
        | "magic_mismatch"
        | "path_denied";
    };

const DATA_URL_RE =
  /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\s]+)$/i;

const MAX_DECODED_BYTES = 4 * 1024 * 1024; // 4 MiB decoded
const MAX_BASE64_CHARS = 6_000_000;

function hasPngMagic(buf: Buffer): boolean {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

function hasJpegMagic(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * Resolve image bytes from a material contentRef.
 * Only `data:image/png|jpeg;base64,...` is accepted for gateway attach today.
 * `upload://` and workspace paths are denied here (must be re-opened / re-bound
 * to a verified data: ref) — prevents silent privilege via path strings.
 */
export function resolveSafeImageContentRef(contentRef: string | undefined | null): SafeImageBytes {
  const ref = contentRef?.trim() ?? "";
  if (!ref) {
    return { ok: false, reason: "Missing contentRef", code: "missing_ref" };
  }
  if (/^(upload|workspace|file|pw7|gmail):\/\//i.test(ref)) {
    return {
      ok: false,
      reason:
        "contentRef scheme is not loadable bytes — reopen/rebind image to verified data: URL before vision attach",
      code: "path_denied",
    };
  }
  if (/^https?:\/\//i.test(ref)) {
    return {
      ok: false,
      reason: "Remote URL contentRef denied for image bytes (no SSRF via vision path)",
      code: "unsupported_scheme",
    };
  }
  const match = DATA_URL_RE.exec(ref);
  if (!match) {
    if (ref.startsWith("data:")) {
      return {
        ok: false,
        reason: "Only data:image/png|jpeg;base64 contentRef accepted",
        code: "bad_mime",
      };
    }
    return {
      ok: false,
      reason: "Unsupported contentRef scheme for image bytes",
      code: "unsupported_scheme",
    };
  }
  const mimeType = match[1]!.toLowerCase() as "image/png" | "image/jpeg";
  const base64 = match[2]!.replace(/\s+/g, "");
  if (!base64 || /[^A-Za-z0-9+/=]/.test(base64)) {
    return { ok: false, reason: "Invalid base64 payload", code: "bad_base64" };
  }
  if (base64.length > MAX_BASE64_CHARS) {
    return { ok: false, reason: "Base64 payload too large", code: "too_large" };
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    return { ok: false, reason: "Base64 decode failed", code: "bad_base64" };
  }
  if (!buf.byteLength) {
    return { ok: false, reason: "Empty image bytes", code: "bad_base64" };
  }
  if (buf.byteLength > MAX_DECODED_BYTES) {
    return {
      ok: false,
      reason: `Decoded image ${buf.byteLength}B exceeds ${MAX_DECODED_BYTES}B cap`,
      code: "too_large",
    };
  }
  if (mimeType === "image/png" && !hasPngMagic(buf)) {
    return {
      ok: false,
      reason: "MIME claims PNG but magic bytes mismatch",
      code: "magic_mismatch",
    };
  }
  if (mimeType === "image/jpeg" && !hasJpegMagic(buf)) {
    return {
      ok: false,
      reason: "MIME claims JPEG but magic bytes mismatch",
      code: "magic_mismatch",
    };
  }
  return {
    ok: true,
    mimeType,
    base64,
    byteLength: buf.byteLength,
  };
}
