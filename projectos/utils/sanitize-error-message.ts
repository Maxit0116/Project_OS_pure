const MAX_DIAGNOSTIC_LENGTH = 500;

export function sanitizeErrorMessage(value: unknown): string {
  const raw = value instanceof Error
    ? value.message
    : typeof value === "string"
      ? value
      : "Unknown provider error";
  return raw
    .replace(
      /(["']?authorization["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s"',}]+/giu,
      "$1[redacted]",
    )
    .replace(/\bBearer\s+[^\s"',}]+/giu, "Bearer [redacted]")
    .replace(
      /(["']?(?:api[_-]?key|token|secret)["']?\s*[:=]\s*["']?)[^\s"',}]+/giu,
      "$1[redacted]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, "[redacted]")
    // Absolute home / tmp paths must not reach chat toasts as raw filesystem text.
    .replace(/\/(?:Users|home)\/[^\s"',}]+/gu, "[path]")
    .replace(/\/(?:var\/folders|tmp|private\/var\/folders)\/[^\s"',}]+/gu, "[path]")
    .slice(0, MAX_DIAGNOSTIC_LENGTH);
}
