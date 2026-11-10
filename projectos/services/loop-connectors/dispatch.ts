import { getConnectorVendor } from "./catalog.js";
import {
  executeConnectorHttp,
  summarizeRequest,
  type LoopConnectorTransport,
} from "./http-transport.js";
import type {
  LoopConnectorAuditEvent,
  LoopConnectorErrorCode,
  LoopConnectorHttpRequest,
  LoopConnectorResult,
  LoopConnectorVendorId,
  LoopCredentialRef,
} from "./types.js";

export type ConnectorDispatchContext = {
  transport: LoopConnectorTransport;
  /** Resolve secret material for a credential ref — never returned to UI. */
  resolveCredentialSecret?: (
    ref: LoopCredentialRef,
  ) => string | null | Promise<string | null>;
  signal?: AbortSignal;
  nowIso?: () => string;
  sleep?: (ms: number) => Promise<void>;
};

function auditBase(
  request: LoopConnectorHttpRequest,
  nowIso: () => string,
): Omit<LoopConnectorAuditEvent, "outcome" | "message" | "code" | "httpStatus"> {
  return {
    at: nowIso(),
    vendorId: request.vendorId,
    capabilityId: request.capabilityId,
    ...(request.credentialRefId
      ? { credentialRefId: request.credentialRefId }
      : {}),
    idempotencyKey: request.idempotencyKey,
    requestSummary: summarizeRequest(request),
  };
}

export function blockedResult<T = unknown>(input: {
  vendorId: LoopConnectorVendorId;
  capabilityId: string;
  code: LoopConnectorErrorCode;
  message: string;
  idempotencyKey: string;
  credentialRefId?: string;
  nowIso?: () => string;
}): LoopConnectorResult<T> {
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  return {
    ok: false,
    vendorId: input.vendorId,
    capabilityId: input.capabilityId,
    code: input.code,
    message: input.message,
    retryable: false,
    unknownOutcome: false,
    audit: {
      at: nowIso(),
      vendorId: input.vendorId,
      capabilityId: input.capabilityId,
      ...(input.credentialRefId
        ? { credentialRefId: input.credentialRefId }
        : {}),
      idempotencyKey: input.idempotencyKey,
      requestSummary: "blocked_before_transport",
      outcome: "blocked",
      code: input.code,
      message: input.message,
    },
  };
}

/**
 * Shared production-shaped dispatch: catalog/risk gates → HTTP execute → map errors.
 * Adapters build the request; this never logs secrets.
 */
export async function dispatchConnectorRequest<T>(input: {
  request: LoopConnectorHttpRequest;
  ctx: ConnectorDispatchContext;
  parseOk: (bodyText: string, status: number) => T;
  /** When capability is high-risk and vendor defaults off. */
  requireHighRiskAuthorization?: boolean;
  highRiskAuthorized?: boolean;
}): Promise<LoopConnectorResult<T>> {
  const nowIso = input.ctx.nowIso ?? (() => new Date().toISOString());
  const vendor = getConnectorVendor(input.request.vendorId);
  if (!vendor) {
    return blockedResult({
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      code: "unconfigured",
      message: `Unknown vendor ${input.request.vendorId}`,
      idempotencyKey: input.request.idempotencyKey,
      nowIso,
    });
  }

  const capability = vendor.capabilities.find(
    (item) => item.id === input.request.capabilityId,
  );
  if (!capability) {
    return blockedResult({
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      code: "unconfigured",
      message: `Unknown capability ${input.request.capabilityId}`,
      idempotencyKey: input.request.idempotencyKey,
      nowIso,
    });
  }

  if (
    (capability.risk === "write_high" || vendor.highRiskDefaultOff) &&
    input.requireHighRiskAuthorization &&
    !input.highRiskAuthorized
  ) {
    return blockedResult({
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      code: "high_risk_disabled",
      message: `${vendor.displayName}.${capability.id} is high-risk and not independently authorized`,
      idempotencyKey: input.request.idempotencyKey,
      ...(input.request.credentialRefId
        ? { credentialRefId: input.request.credentialRefId }
        : {}),
      nowIso,
    });
  }

  if (!input.request.credentialRefId) {
    return blockedResult({
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      code: "auth_missing",
      message: `Missing credential ref for ${vendor.displayName}.${capability.id}`,
      idempotencyKey: input.request.idempotencyKey,
      nowIso,
    });
  }

  const base = auditBase(input.request, nowIso);
  const outcome = await executeConnectorHttp(input.request, {
    transport: input.ctx.transport,
    ...(input.ctx.signal ? { signal: input.ctx.signal } : {}),
    ...(input.ctx.sleep ? { sleep: input.ctx.sleep } : {}),
  });

  if (outcome.kind === "error") {
    return {
      ok: false,
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      code: outcome.code,
      message: outcome.message,
      retryable: outcome.retryable,
      unknownOutcome: outcome.unknownOutcome,
      audit: {
        ...base,
        outcome: outcome.unknownOutcome ? "unknown" : "error",
        code: outcome.code,
        message: outcome.message,
      },
    };
  }

  const { response } = outcome;
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      code: "auth_rejected",
      message: `${vendor.displayName} rejected credentials (HTTP ${response.status})`,
      retryable: false,
      unknownOutcome: false,
      audit: {
        ...base,
        httpStatus: response.status,
        outcome: "error",
        code: "auth_rejected",
        message: `HTTP ${response.status}`,
      },
    };
  }
  if (response.status === 429) {
    return {
      ok: false,
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      code: "rate_limited",
      message: `${vendor.displayName} rate limited after retries`,
      retryable: false,
      unknownOutcome: false,
      audit: {
        ...base,
        httpStatus: response.status,
        outcome: "error",
        code: "rate_limited",
        message: `HTTP ${response.status}`,
      },
    };
  }
  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      code: "http_error",
      message: `${vendor.displayName} HTTP ${response.status}`,
      retryable: false,
      unknownOutcome: false,
      audit: {
        ...base,
        httpStatus: response.status,
        outcome: "error",
        code: "http_error",
        message: response.bodyText.slice(0, 200),
      },
    };
  }

  try {
    const data = input.parseOk(response.bodyText, response.status);
    return {
      ok: true,
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      data,
      audit: {
        ...base,
        httpStatus: response.status,
        outcome: "ok",
        message: "ok",
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse connector response";
    return {
      ok: false,
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      code: "transport_error",
      message,
      retryable: false,
      unknownOutcome: false,
      audit: {
        ...base,
        httpStatus: response.status,
        outcome: "error",
        code: "transport_error",
        message,
      },
    };
  }
}
