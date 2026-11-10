import type {
  LoopConnectorErrorCode,
  LoopConnectorHttpRequest,
  LoopConnectorHttpResponse,
} from "./types.js";

export type LoopConnectorTransport = (
  request: LoopConnectorHttpRequest,
  signal?: AbortSignal,
) => Promise<LoopConnectorHttpResponse>;

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  /** Statuses safe to retry for idempotent/read requests only. */
  retryOnStatuses: number[];
  /** Absolute max wait for a single Retry-After (ms). */
  maxRetryAfterMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 50,
  retryOnStatuses: [429, 502, 503, 504],
  maxRetryAfterMs: 60_000,
};

export type TransportAttempt = {
  attempt: number;
  status?: number;
  error?: string;
  cancelled?: boolean;
  /** True once the transport call was entered (side effect may exist). */
  dispatched?: boolean;
};

export type OperationLedger = {
  /** Returns true when this idempotency key was already sent (unknown or ok). */
  wasDispatched: (idempotencyKey: string) => boolean;
  markDispatched: (idempotencyKey: string, meta: { method: string; urlHost: string }) => void;
  markSettled: (idempotencyKey: string, outcome: "ok" | "error" | "unknown") => void;
};

export type ExecuteHttpOptions = {
  transport: LoopConnectorTransport;
  policy?: RetryPolicy;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /**
   * Vendor/capability declared the request idempotent (safe to retry after
   * ambiguous failure). Default false for mutating methods.
   */
  idempotent?: boolean;
  /** Persistent/in-memory ledger — blocks blind resend after dispatch. */
  ledger?: OperationLedger;
  /** Re-check before each attempt (cancel / approval / budget). */
  beforeAttempt?: (attempt: number) =>
    | { ok: true }
    | { ok: false; code: LoopConnectorErrorCode; message: string };
};

export type ExecuteHttpOutcome =
  | {
      kind: "response";
      response: LoopConnectorHttpResponse;
      attempts: TransportAttempt[];
    }
  | {
      kind: "error";
      code: LoopConnectorErrorCode;
      message: string;
      retryable: boolean;
      unknownOutcome: boolean;
      attempts: TransportAttempt[];
    };

export function createMemoryOperationLedger(): OperationLedger {
  const map = new Map<string, { outcome?: "ok" | "error" | "unknown" }>();
  return {
    wasDispatched(key) {
      return map.has(key);
    },
    markDispatched(key) {
      if (!map.has(key)) map.set(key, {});
    },
    markSettled(key, outcome) {
      map.set(key, { outcome });
    },
  };
}

export async function cancellableSleep(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) throw new Error("aborted");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function parseRetryAfterMs(
  header: string | undefined,
  maxMs: number,
): number | null {
  if (!header) return null;
  const asInt = Number(header);
  if (Number.isFinite(asInt) && asInt >= 0) {
    // Do not compress below server request — only cap the upper bound.
    return Math.min(asInt * 1000, maxMs);
  }
  const when = Date.parse(header);
  if (!Number.isNaN(when)) {
    const delta = when - Date.now();
    if (delta > 0) return Math.min(delta, maxMs);
  }
  return null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

/**
 * Bounded retry with cancel + real timeout. Mutating non-idempotent requests
 * never retry after the transport has been entered (unknown ledger).
 */
export async function executeConnectorHttp(
  request: LoopConnectorHttpRequest,
  options: ExecuteHttpOptions,
): Promise<ExecuteHttpOutcome> {
  const policy = options.policy ?? DEFAULT_RETRY_POLICY;
  const sleep = options.sleep ?? cancellableSleep;
  const mutating = request.method !== "GET";
  const idempotent = options.idempotent ?? !mutating;
  const attempts: TransportAttempt[] = [];

  if (options.ledger?.wasDispatched(request.idempotencyKey) && !idempotent) {
    return {
      kind: "error",
      code: "unknown_outcome",
      message: `Idempotency key ${request.idempotencyKey} already dispatched; refusing blind resend`,
      retryable: false,
      unknownOutcome: true,
      attempts,
    };
  }

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      attempts.push({ attempt, cancelled: true });
      return {
        kind: "error",
        code: "cancelled",
        message: "Connector request cancelled",
        retryable: false,
        unknownOutcome: attempts.some((item) => item.dispatched),
        attempts,
      };
    }

    const gate = options.beforeAttempt?.(attempt);
    if (gate && !gate.ok) {
      attempts.push({ attempt, cancelled: gate.code === "cancelled" });
      return {
        kind: "error",
        code: gate.code,
        message: gate.message,
        retryable: false,
        unknownOutcome: attempts.some((item) => item.dispatched),
        attempts,
      };
    }

    const timeoutController = new AbortController();
    const onOuterAbort = () => timeoutController.abort();
    options.signal?.addEventListener("abort", onOuterAbort, { once: true });
    const timer = setTimeout(
      () => timeoutController.abort(),
      Math.max(1, request.timeoutMs),
    );

    let dispatched = false;
    try {
      options.ledger?.markDispatched(request.idempotencyKey, {
        method: request.method,
        urlHost: hostOf(request.url),
      });
      dispatched = true;
      const response = await options.transport(
        request,
        timeoutController.signal,
      );
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onOuterAbort);
      attempts.push({ attempt, status: response.status, dispatched: true });

      const retryableStatus = policy.retryOnStatuses.includes(response.status);
      if (retryableStatus && attempt < policy.maxAttempts) {
        // Only retry mutating calls when explicitly idempotent.
        if (mutating && !idempotent) {
          // Definitive HTTP response received — do not blind-retry.
          // 429 is a known outcome; 5xx after dispatch is treated unknown.
          const knownRateLimit = response.status === 429;
          options.ledger?.markSettled(
            request.idempotencyKey,
            knownRateLimit ? "error" : "unknown",
          );
          return {
            kind: "error",
            code: knownRateLimit ? "rate_limited" : "unknown_outcome",
            message: `HTTP ${response.status} after non-idempotent ${request.method}; refusing blind resend`,
            retryable: false,
            unknownOutcome: !knownRateLimit,
            attempts,
          };
        }
        const retryAfter = parseRetryAfterMs(
          response.headers["retry-after"] ?? response.headers["Retry-After"],
          policy.maxRetryAfterMs,
        );
        const delay = retryAfter ?? policy.baseDelayMs * attempt;
        try {
          await sleep(delay, options.signal);
        } catch {
          return {
            kind: "error",
            code: "cancelled",
            message: "Connector retry wait cancelled",
            retryable: false,
            unknownOutcome: false,
            attempts,
          };
        }
        continue;
      }

      options.ledger?.markSettled(
        request.idempotencyKey,
        response.status >= 200 && response.status < 300 ? "ok" : "error",
      );
      return { kind: "response", response, attempts };
    } catch (error) {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onOuterAbort);
      const message =
        error instanceof Error ? error.message : "Connector transport error";
      const outerCancelled = Boolean(options.signal?.aborted);
      const timedOut =
        timeoutController.signal.aborted && !outerCancelled;
      attempts.push({
        attempt,
        error: message,
        cancelled: outerCancelled,
        dispatched,
      });

      if (outerCancelled) {
        // Request may already have been sent — treat as unknown for mutating.
        const unknown = dispatched && mutating && !idempotent;
        if (unknown) {
          options.ledger?.markSettled(request.idempotencyKey, "unknown");
        }
        return {
          kind: "error",
          code: "cancelled",
          message: "Connector request cancelled",
          retryable: false,
          unknownOutcome: unknown,
          attempts,
        };
      }

      if (timedOut || /timeout|aborted/i.test(message)) {
        if (mutating && !idempotent) {
          options.ledger?.markSettled(request.idempotencyKey, "unknown");
          return {
            kind: "error",
            code: "unknown_outcome",
            message: `Unknown outcome after timeout on ${request.method}; refusing blind resend`,
            retryable: false,
            unknownOutcome: true,
            attempts,
          };
        }
        if (attempt < policy.maxAttempts) {
          try {
            await sleep(policy.baseDelayMs * attempt, options.signal);
          } catch {
            return {
              kind: "error",
              code: "cancelled",
              message: "Connector retry wait cancelled",
              retryable: false,
              unknownOutcome: false,
              attempts,
            };
          }
          continue;
        }
        return {
          kind: "error",
          code: "timeout",
          message: "Connector request timed out",
          retryable: false,
          unknownOutcome: false,
          attempts,
        };
      }

      if (mutating && !idempotent) {
        options.ledger?.markSettled(request.idempotencyKey, "unknown");
        return {
          kind: "error",
          code: "unknown_outcome",
          message: `Unknown outcome after transport error on ${request.method}; refusing blind resend`,
          retryable: false,
          unknownOutcome: true,
          attempts,
        };
      }

      if (attempt < policy.maxAttempts) {
        try {
          await sleep(policy.baseDelayMs * attempt, options.signal);
        } catch {
          return {
            kind: "error",
            code: "cancelled",
            message: "Connector retry wait cancelled",
            retryable: false,
            unknownOutcome: false,
            attempts,
          };
        }
        continue;
      }
      return {
        kind: "error",
        code: "transport_error",
        message: redactSecretsInText(message),
        retryable: false,
        unknownOutcome: false,
        attempts,
      };
    }
  }

  return {
    kind: "error",
    code: "rate_limited",
    message: "Retry budget exhausted",
    retryable: false,
    unknownOutcome: false,
    attempts,
  };
}

/** Test helper — records requests, returns scripted responses. */
export function createScriptedTransport(
  script: Array<
    | { response: LoopConnectorHttpResponse }
    | { error: Error }
  >,
): {
  transport: LoopConnectorTransport;
  requests: LoopConnectorHttpRequest[];
} {
  const requests: LoopConnectorHttpRequest[] = [];
  let index = 0;
  return {
    requests,
    transport: async (request, signal) => {
      if (signal?.aborted) throw new Error("aborted");
      requests.push(request);
      const next = script[index];
      index += 1;
      if (!next) throw new Error("Scripted transport exhausted");
      if ("error" in next) throw next.error;
      return next.response;
    },
  };
}

/** Production fetch transport — honors AbortSignal; does not log bodies. */
export function createFetchTransport(
  fetchImpl: typeof fetch = fetch,
): LoopConnectorTransport {
  return async (request, signal) => {
    const started = Date.now();
    const init: RequestInit = {
      method: request.method,
      headers: request.headers,
    };
    if (request.body !== undefined) init.body = request.body;
    if (signal) init.signal = signal;
    const response = await fetchImpl(request.url, init);
    const bodyText = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      status: response.status,
      headers,
      bodyText,
      durationMs: Date.now() - started,
    };
  };
}

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /xox[baprs]-[A-Za-z0-9-]+/gi,
  /sntrys_[A-Za-z0-9._-]+/gi,
  /hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/gi,
  /open\.(?:feishu\.cn|larksuite\.com)\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9_-]+/gi,
  /[?&](access_token|token|secret|api_key|key)=([^&\s]+)/gi,
];

export function redactSecretsInText(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}

/** Redact Authorization / token-like headers for audit. */
export function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization|token|secret|api[-_]?key/i.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = redactSecretsInText(value);
    }
  }
  return out;
}

export function redactUrlForAudit(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.host;
    // Entire webhook paths are secrets.
    if (
      host.includes("hooks.slack.com") ||
      /\/bot\/v2\/hook\//.test(parsed.pathname)
    ) {
      return `${parsed.protocol}//${host}/[webhook-redacted]`;
    }
    parsed.searchParams.forEach((value, key) => {
      if (/token|secret|key|password|auth/i.test(key)) {
        parsed.searchParams.set(key, "[redacted]");
      } else {
        parsed.searchParams.set(key, redactSecretsInText(value));
      }
    });
    return redactSecretsInText(parsed.toString());
  } catch {
    return "[invalid-url-redacted]";
  }
}

export function summarizeRequest(request: LoopConnectorHttpRequest): string {
  const redacted = redactHeaders(request.headers);
  return `${request.method} ${redactUrlForAudit(request.url)} cred=${request.credentialRefId ?? "none"} headers=${JSON.stringify(redacted)}`;
}

export function redactErrorBody(bodyText: string): string {
  return redactSecretsInText(bodyText).slice(0, 120);
}
