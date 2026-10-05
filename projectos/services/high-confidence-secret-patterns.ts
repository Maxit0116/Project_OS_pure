export const HIGH_CONFIDENCE_SECRET_PATTERNS = [
  /-----BEGIN ((?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY)-----[\s\S]*?(?:-----END \1-----|$)/gu,
  /\bAWS_SECRET_ACCESS_KEY\s*=\s*["']?[A-Za-z0-9/+=]{32,}["']?/giu,
  /\bAKIA[0-9A-Z]{16}\b/gu,
  /\bsk-[A-Za-z0-9_-]{20,}\b/gu,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/gu,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/gu,
  /\bAIza[0-9A-Za-z_-]{35}\b/gu,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/giu,
  /\bapi[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/giu,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/gu,
] as const;

export function containsHighConfidenceSecret(text: string): boolean {
  return HIGH_CONFIDENCE_SECRET_PATTERNS.some((pattern) =>
    clonePattern(pattern).test(text));
}

export function redactHighConfidenceSecrets(
  text: string,
  replacement = "[REDACTED]",
): string {
  return HIGH_CONFIDENCE_SECRET_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(clonePattern(pattern), replacement),
    text,
  );
}

function clonePattern(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags);
}
