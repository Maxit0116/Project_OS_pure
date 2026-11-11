/**
 * Unified Loop connector catalog + request/response contracts.
 * Display/registry metadata is separate from runtime readiness and live auth.
 */

export type LoopConnectorVendorId =
  | "github"
  | "slack"
  | "feishu"
  | "lark"
  | "sentry"
  | "linear"
  | "jira_cloud"
  | "notion"
  | "vercel"
  | "supabase"
  | "posthog"
  /** Appended mail connector — does not replace the original 11-vendor inventory. */
  | "gmail";

export type LoopConnectorBatch =
  | "batch1_collab_observability"
  | "batch2_tasks_docs_deploy"
  | "batch3_data"
  | "batch_mail";

export type LoopConnectorCapabilityKind = "trigger" | "action" | "notify";

export type LoopConnectorRiskClass =
  | "read"
  | "notify"
  | "write_low"
  | "write_high"
  | "approval_gate";

export type LoopConnectorImplStatus =
  | "implemented_contract"
  | "partial"
  | "catalog_only"
  | "reuse_existing";

export type LoopConnectorLiveStatus =
  | "live_verified"
  | "contract_tested"
  | "unconfigured"
  | "disabled_high_risk";

export type LoopConnectorCapability = {
  id: string;
  kind: LoopConnectorCapabilityKind;
  label: string;
  risk: LoopConnectorRiskClass;
  /** Official API surface this capability targets. */
  apiSurface: string;
  notes?: string;
};

export type LoopConnectorVendorMeta = {
  id: LoopConnectorVendorId;
  displayName: string;
  /** Local icon registry key — never a remote URL. */
  iconKey: string;
  batch: LoopConnectorBatch;
  /** Official docs / API version pin used by adapters. */
  apiVersion: string;
  apiDocsUrl: string;
  brandNote?: string;
  capabilities: LoopConnectorCapability[];
  implStatus: LoopConnectorImplStatus;
  liveStatus: LoopConnectorLiveStatus;
  /** High-risk ops stay off until explicitly authorized. */
  highRiskDefaultOff?: boolean;
};

/** Opaque credential reference — secret material never travels in UI assets. */
export type LoopCredentialRef = {
  vendorId: LoopConnectorVendorId;
  credentialId: string;
  scheme:
    | "oauth_token_ref"
    | "bot_token_ref"
    | "webhook_url_ref"
    | "signing_secret_ref"
    | "api_key_ref";
  /** Redacted label for audit/UI. */
  label: string;
};

export type LoopConnectorHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type LoopConnectorHttpRequest = {
  vendorId: LoopConnectorVendorId;
  capabilityId: string;
  method: LoopConnectorHttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
  /** Idempotency / dedupe key for non-blind recovery. */
  idempotencyKey: string;
  timeoutMs: number;
  /** Auth uses credential ref id — transport resolves secretly out-of-band. */
  credentialRefId?: string;
};

export type LoopConnectorHttpResponse = {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
  /** Wall time for audit. */
  durationMs: number;
};

export type LoopConnectorErrorCode =
  | "unconfigured"
  /** Vendor present in catalog but no executable adapter (Batch3 posture). */
  | "catalog_only"
  | "auth_missing"
  | "auth_rejected"
  | "signature_invalid"
  | "replay_detected"
  | "rate_limited"
  | "timeout"
  | "cancelled"
  | "unknown_outcome"
  | "approval_drift"
  | "high_risk_disabled"
  | "notify_only"
  | "transport_error"
  | "http_error"
  /** Gmail history.list startHistoryId expired — caller must full-resync cursor. */
  | "resync_required"
  /** contentRef accountRefId does not bind the provided credential — 0 HTTP. */
  | "account_ref_mismatch"
  /** Declared/measured bytes exceed consumption limit — refuse download/release. */
  | "size_limit";

export type LoopConnectorResult<T = unknown> =
  | {
      ok: true;
      vendorId: LoopConnectorVendorId;
      capabilityId: string;
      data: T;
      audit: LoopConnectorAuditEvent;
    }
  | {
      ok: false;
      vendorId: LoopConnectorVendorId;
      capabilityId: string;
      code: LoopConnectorErrorCode;
      message: string;
      retryable: boolean;
      /** Unknown after transport — must NOT blind-resend. */
      unknownOutcome: boolean;
      audit: LoopConnectorAuditEvent;
    };

export type LoopConnectorAuditEvent = {
  at: string;
  vendorId: LoopConnectorVendorId;
  capabilityId: string;
  credentialRefId?: string;
  idempotencyKey: string;
  httpStatus?: number;
  /** Redacted request summary — no secrets. */
  requestSummary: string;
  outcome: "ok" | "error" | "blocked" | "unknown";
  code?: LoopConnectorErrorCode;
  message: string;
};
