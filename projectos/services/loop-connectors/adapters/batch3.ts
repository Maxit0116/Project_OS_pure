/**
 * Batch 3 adapters — Supabase / PostHog.
 * Contract + loopback only; no live OAuth / paid project this round.
 * Read paths are executable offline via injectable transport; write_rows stays
 * high-risk sealed unless independently authorized.
 */
import {
  blockedResult,
  dispatchConnectorRequest,
  type ConnectorDispatchContext,
} from "../dispatch.js";
import type { LoopConnectorResult, LoopCredentialRef } from "../types.js";

function resolveApiKey(
  input: { accessToken?: string; credential: LoopCredentialRef },
  ctx: ConnectorDispatchContext,
): Promise<string | null> | string | null {
  if (input.accessToken) return input.accessToken;
  if (!ctx.resolveCredentialSecret) return null;
  return ctx.resolveCredentialSecret(input.credential);
}

/** GET rows — PostgREST select. */
export async function supabaseReadRows(
  input: {
    projectUrl: string;
    table: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
    select?: string;
    limit?: number;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ rows: unknown[] }>> {
  if (
    input.credential.scheme !== "api_key_ref" &&
    input.credential.scheme !== "oauth_token_ref"
  ) {
    return blockedResult({
      vendorId: "supabase",
      capabilityId: "read_rows",
      code: "unconfigured",
      message: "Supabase read_rows requires api_key_ref or oauth_token_ref",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const token = await resolveApiKey(input, ctx);
  if (!token) {
    return blockedResult({
      vendorId: "supabase",
      capabilityId: "read_rows",
      code: "auth_missing",
      message: "Supabase API key ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const base = input.projectUrl.replace(/\/$/, "");
  const select = encodeURIComponent(input.select ?? "*");
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const url = `${base}/rest/v1/${encodeURIComponent(input.table)}?select=${select}&limit=${limit}`;
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "supabase",
      capabilityId: "read_rows",
      method: "GET",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: token,
        Accept: "application/json",
      },
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as unknown;
      if (!Array.isArray(parsed)) throw new Error("supabase_rows_not_array");
      return { rows: parsed };
    },
  });
}

/** Bounded read-only RPC. */
export async function supabaseInvokeRpcReadonly(
  input: {
    projectUrl: string;
    fn: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
    args?: Record<string, unknown>;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ result: unknown }>> {
  const token = await resolveApiKey(input, ctx);
  if (!token) {
    return blockedResult({
      vendorId: "supabase",
      capabilityId: "invoke_rpc_readonly",
      code: "auth_missing",
      message: "Supabase API key ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const base = input.projectUrl.replace(/\/$/, "");
  const url = `${base}/rest/v1/rpc/${encodeURIComponent(input.fn)}`;
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "supabase",
      capabilityId: "invoke_rpc_readonly",
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input.args ?? {}),
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => ({ result: JSON.parse(bodyText) as unknown }),
  });
}

/**
 * Write rows — always requires independent highRiskAuthorized at dispatch.
 * No settle auto-path without that flag.
 */
export async function supabaseWriteRows(
  input: {
    projectUrl: string;
    table: string;
    rows: unknown[];
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
    highRiskAuthorized?: boolean;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ inserted: number }>> {
  const token = await resolveApiKey(input, ctx);
  if (!token) {
    return blockedResult({
      vendorId: "supabase",
      capabilityId: "write_rows",
      code: "auth_missing",
      message: "Supabase API key ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const base = input.projectUrl.replace(/\/$/, "");
  return dispatchConnectorRequest({
    ctx,
    highRiskAuthorized: input.highRiskAuthorized === true,
    request: {
      vendorId: "supabase",
      capabilityId: "write_rows",
      method: "POST",
      url: `${base}/rest/v1/${encodeURIComponent(input.table)}`,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: token,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(input.rows),
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: () => ({ inserted: input.rows.length }),
  });
}

/** Query insights — read. */
export async function posthogQueryInsights(
  input: {
    host: string;
    projectId: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
    insightId?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ insightId: string; result: unknown }>> {
  if (
    input.credential.scheme !== "api_key_ref" &&
    input.credential.scheme !== "oauth_token_ref"
  ) {
    return blockedResult({
      vendorId: "posthog",
      capabilityId: "query_insights",
      code: "unconfigured",
      message: "PostHog query_insights requires api_key_ref or oauth_token_ref",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const token = await resolveApiKey(input, ctx);
  if (!token) {
    return blockedResult({
      vendorId: "posthog",
      capabilityId: "query_insights",
      code: "auth_missing",
      message: "PostHog API key ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const host = input.host.replace(/\/$/, "");
  const insightId = input.insightId ?? "default";
  const url = `${host}/api/projects/${encodeURIComponent(input.projectId)}/insights/${encodeURIComponent(insightId)}/`;
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "posthog",
      capabilityId: "query_insights",
      method: "GET",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => ({
      insightId,
      result: JSON.parse(bodyText) as unknown,
    }),
  });
}

/** Capture event — write_low; vendor highRiskDefaultOff does not apply to posthog. */
export async function posthogCaptureEvent(
  input: {
    host: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    event: string;
    distinctId: string;
    properties?: Record<string, unknown>;
    accessToken?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ status: number }>> {
  const token = await resolveApiKey(input, ctx);
  if (!token) {
    return blockedResult({
      vendorId: "posthog",
      capabilityId: "capture_event",
      code: "auth_missing",
      message: "PostHog API key ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const host = input.host.replace(/\/$/, "");
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "posthog",
      capabilityId: "capture_event",
      method: "POST",
      url: `${host}/capture/`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: token,
        event: input.event,
        distinct_id: input.distinctId,
        properties: input.properties ?? {},
      }),
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 10_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (_body, status) => ({ status }),
  });
}
