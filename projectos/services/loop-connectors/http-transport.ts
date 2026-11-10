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
  /** Base backoff ms; multiplied by attempt for 429/timeout. */
  baseDelayMs: number;
  retryOnStatuses: number[];
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 50,
  retryOnStatuses: [429, 502, 503, 504],
};

export type TransportAttempt = {
  attempt: number;
  status?: number;
  error?: string;
  cancelled?: boolean;
};

export type ExecuteHttpOptions = {
  transport: LoopConnectorTransport;
  policy?: RetryPolicy;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  /** When true after ambiguous network drop, do not retry POST/PUT/PATCH/DELETE. */
  forbidBlindResend?: boolean;
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

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Bounded retry with cancel. Unknown outcomes after mutating methods never
 * blind-resend (forbidBlindResend default true for non-GET).
 */
export async function executeConnectorHttp(
  request: LoopConnectorHttpRequest,
  options: ExecuteHttpOptions,
): Promise<ExecuteHttpOutcome> {
  const policy = options.policy ?? DEFAULT_RETRY_POLICY;
  const sleep = options.sleep ?? defaultSleep;
  const mutating = request.method !== "GET";
  const forbidBlind =
    options.forbidBlindResend ?? mutating;
  const attempts: TransportAttempt[] = [];

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      attempts.push({ attempt, cancelled: true });
      return {
        kind: "error",
        code: "cancelled",
        message: "Connector request cancelled",
        retryable: false,
        unknownOutcome: false,
        attempts,
      };
    }
    try {
      const response = await options.transport(request, options.signal);
      attempts.push({ attempt, status: response.status });
      if (
        policy.retryOnStatuses.includes(response.status) &&
        attempt < policy.maxAttempts
      ) {
        const retryAfter = Number(response.headers["retry-after"] ?? "");
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 5_000)
            : policy.baseDelayMs * attempt;
        await sleep(delay);
        continue;
      }
      return { kind: "response", response, attempts };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connector transport error";
      const cancelled =
        options.signal?.aborted ||
        /aborted|cancelled/i.test(message);
      attempts.push({ attempt, error: message, cancelled });
      if (cancelled) {
        return {
          kind: "error",
          code: "cancelled",
          message: "Connector request cancelled",
          retryable: false,
          unknownOutcome: false,
          attempts,
        };
      }
      const timedOut = /timeout|timed out/i.test(message);
      if (timedOut && attempt < policy.maxAttempts && !forbidBlind) {
        await sleep(policy.baseDelayMs * attempt);
        continue;
      }
      if (timedOut && forbidBlind) {
        return {
          kind: "error",
          code: "unknown_outcome",
          message: `Unknown outcome after timeout on ${request.method}; refusing blind resend`,
          retryable: false,
          unknownOutcome: true,
          attempts,
        };
      }
      if (attempt < policy.maxAttempts && !forbidBlind) {
        await sleep(policy.baseDelayMs * attempt);
        continue;
      }
      return {
        kind: "error",
        code: timedOut ? "timeout" : "transport_error",
        message,
        retryable: !forbidBlind && timedOut,
        unknownOutcome: mutating,
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

/** Redact Authorization / token-like headers for audit. */
export function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization|token|secret|api[-_]?key/i.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function summarizeRequest(request: LoopConnectorHttpRequest): string {
  const redacted = redactHeaders(request.headers);
  return `${request.method} ${request.url} cred=${request.credentialRefId ?? "none"} headers=${JSON.stringify(redacted)}`;
}
