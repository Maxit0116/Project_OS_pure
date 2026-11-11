import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookVerifyInput = {
  /** Raw request body bytes/string used for signature. */
  rawBody: string;
  signatureHeader: string;
  /** Resolved signing secret — never logged. */
  signingSecret: string;
  /** Epoch seconds from provider timestamp header when present. */
  timestampSec?: number;
  nowSec?: number;
  /** Max skew for anti-replay (default 5 minutes). */
  maxSkewSec?: number;
  /** Provider style. */
  style: "slack_v0" | "feishu_lark_sha256" | "sentry_hmac" | "generic_hmac_sha256";
};

export type WebhookVerifyResult =
  | { ok: true }
  | { ok: false; reason: "signature_invalid" | "replay_detected" | "timestamp_skew" };

export type DedupeStore = {
  has: (key: string) => boolean;
  add: (key: string, ttlSec?: number) => void;
};

export function createMemoryDedupeStore(): DedupeStore {
  const map = new Map<string, number>();
  return {
    has(key) {
      const exp = map.get(key);
      if (exp == null) return false;
      if (exp < Date.now()) {
        map.delete(key);
        return false;
      }
      return true;
    },
    add(key, ttlSec = 600) {
      map.set(key, Date.now() + ttlSec * 1000);
    },
  };
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function safeEqualUtf8(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verify inbound webhook signatures. Rejects skew/replay candidates via caller
 * dedupe keys; timestamp skew checked when timestamp provided.
 */
export function verifyWebhookSignature(
  input: WebhookVerifyInput,
): WebhookVerifyResult {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const maxSkew = input.maxSkewSec ?? 300;
  if (input.timestampSec != null) {
    if (Math.abs(now - input.timestampSec) > maxSkew) {
      return { ok: false, reason: "timestamp_skew" };
    }
  }

  if (input.style === "slack_v0") {
    if (input.timestampSec == null) {
      return { ok: false, reason: "signature_invalid" };
    }
    const base = `v0:${input.timestampSec}:${input.rawBody}`;
    const digest = createHmac("sha256", input.signingSecret)
      .update(base)
      .digest("hex");
    const expected = `v0=${digest}`;
    const provided = input.signatureHeader.trim();
    if (!safeEqualUtf8(expected, provided)) {
      return { ok: false, reason: "signature_invalid" };
    }
    return { ok: true };
  }

  if (input.style === "feishu_lark_sha256" || input.style === "generic_hmac_sha256") {
    const digest = createHmac("sha256", input.signingSecret)
      .update(input.rawBody)
      .digest("hex");
    const provided = input.signatureHeader.replace(/^sha256=/i, "").trim();
    if (!safeEqualHex(digest, provided) && !safeEqualUtf8(digest, provided)) {
      return { ok: false, reason: "signature_invalid" };
    }
    return { ok: true };
  }

  // sentry_hmac — hex HMAC of body
  const digest = createHmac("sha256", input.signingSecret)
    .update(input.rawBody)
    .digest("hex");
  const provided = input.signatureHeader.replace(/^sha256=/i, "").trim();
  if (!safeEqualHex(digest, provided) && !safeEqualUtf8(digest, provided)) {
    return { ok: false, reason: "signature_invalid" };
  }
  return { ok: true };
}

/**
 * Anti-replay: combine signature verify + dedupe of event id / idempotency key.
 * First success records the key; duplicates → replay_detected.
 */
export function acceptSignedWebhook(input: {
  verify: WebhookVerifyInput;
  dedupe: DedupeStore;
  dedupeKey: string;
}): WebhookVerifyResult {
  const verified = verifyWebhookSignature(input.verify);
  if (!verified.ok) return verified;
  if (input.dedupe.has(input.dedupeKey)) {
    return { ok: false, reason: "replay_detected" };
  }
  input.dedupe.add(input.dedupeKey);
  return { ok: true };
}

/**
 * Approval actors must be externally attested — local_declared is never enough
 * for Slack/Feishu/Lark interactive approvals.
 */
export function assertExternalActorAttestation(input: {
  actorAttestation: "external_signed" | "local_declared" | "missing";
  interactionSignatureValid: boolean;
}): { ok: true } | { ok: false; code: "auth_rejected"; message: string } {
  if (input.actorAttestation === "local_declared") {
    return {
      ok: false,
      code: "auth_rejected",
      message:
        "local_declared cannot authorize external SaaS approval; require signed interaction",
    };
  }
  if (input.actorAttestation === "missing" || !input.interactionSignatureValid) {
    return {
      ok: false,
      code: "auth_rejected",
      message: "Missing verifiable actor attestation / interaction signature",
    };
  }
  return { ok: true };
}
