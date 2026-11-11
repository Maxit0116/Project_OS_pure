import { getConnectorVendor } from "./catalog.js";
import {
  executeConnectorHttp,
  redactErrorBody,
  redactSecretsInText,
  summarizeRequest,
  type LoopConnectorTransport,
  type OperationLedger,
} from "./http-transport.js";
import type {
  LoopConnectorAuditEvent,
  LoopConnectorErrorCode,
  LoopConnectorHttpRequest,
  LoopConnectorResult,
  LoopConnectorRiskClass,
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
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  ledger?: OperationLedger;
  beforeAttempt?: (attempt: number) =>
    | { ok: true }
    | { ok: false; code: LoopConnectorErrorCode; message: string };
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
    message: redactSecretsInText(input.message),
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
      message: redactSecretsInText(input.message),
    },
  };
}

/** Trusted capability policy — not caller-controlled. */
export function capabilityRequiresHighRiskAuth(
  risk: LoopConnectorRiskClass,
  vendorHighRiskDefaultOff: boolean | undefined,
): boolean {
  if (risk === "write_high" || risk === "approval_gate") return true;
  // Vendor-level highRiskDefaultOff only applies to write/notify side effects —
  // never seal read capabilities.
  if (vendorHighRiskDefaultOff && (risk === "write_low" || risk === "notify")) {
    return true;
  }
  return false;
}

export function capabilityIsIdempotent(risk: LoopConnectorRiskClass): boolean {
  return risk === "read";
}

/**
 * Shared production dispatch: catalog/risk gates → HTTP execute → map errors.
 * High-risk and catalog_only are enforced from trusted catalog metadata.
 */
export async function dispatchConnectorRequest<T>(input: {
  request: LoopConnectorHttpRequest;
  ctx: ConnectorDispatchContext;
  parseOk: (bodyText: string, status: number) => T;
  /**
   * Independent explicit authorization for high-risk ops.
   * Omission means NOT authorized — cannot bypass by skipping the flag.
   */
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

  if (vendor.implStatus === "catalog_only") {
    return blockedResult({
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      code: "catalog_only",
      message: `${vendor.displayName} is catalog_only — adapter not implemented for dispatch (offline; not a live-auth gap)`,
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
    capabilityRequiresHighRiskAuth(capability.risk, vendor.highRiskDefaultOff) &&
    !input.highRiskAuthorized
  ) {
    return blockedResult({
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      code: "high_risk_disabled",
      message: `${vendor.displayName}.${capability.id} requires independent high-risk authorization`,
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
    idempotent: capabilityIsIdempotent(capability.risk),
    ...(input.ctx.signal ? { signal: input.ctx.signal } : {}),
    ...(input.ctx.sleep ? { sleep: input.ctx.sleep } : {}),
    ...(input.ctx.ledger ? { ledger: input.ctx.ledger } : {}),
    ...(input.ctx.beforeAttempt
      ? { beforeAttempt: input.ctx.beforeAttempt }
      : {}),
  });

  if (outcome.kind === "error") {
    return {
      ok: false,
      vendorId: input.request.vendorId,
      capabilityId: input.request.capabilityId,
      code: outcome.code,
      message: redactSecretsInText(outcome.message),
      retryable: outcome.retryable,
      unknownOutcome: outcome.unknownOutcome,
      audit: {
        ...base,
        outcome: outcome.unknownOutcome ? "unknown" : "error",
        code: outcome.code,
        message: redactSecretsInText(outcome.message),
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
      message: `${vendor.displayName} rate limited`,
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
        message: redactErrorBody(response.bodyText),
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
    const message = redactSecretsInText(
      error instanceof Error ? error.message : "Failed to parse connector response",
    );
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
