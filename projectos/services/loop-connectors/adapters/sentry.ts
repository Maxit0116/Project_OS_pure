import {
  blockedResult,
  dispatchConnectorRequest,
  type ConnectorDispatchContext,
} from "../dispatch.js";
import {
  acceptSignedWebhook,
  type DedupeStore,
} from "../security.js";
import type { LoopConnectorResult, LoopCredentialRef } from "../types.js";

const SENTRY_API = "https://sentry.io/api/0";

export async function sentryListIssues(
  input: {
    organizationSlug: string;
    projectSlug: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    apiToken?: string;
    query?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ issueIds: string[] }>> {
  if (input.credential.scheme !== "api_key_ref" && input.credential.scheme !== "oauth_token_ref") {
    return blockedResult({
      vendorId: "sentry",
      capabilityId: "list_issues",
      code: "unconfigured",
      message: "Sentry list_issues requires api_key_ref or oauth_token_ref",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const token =
    input.apiToken ??
    (ctx.resolveCredentialSecret
      ? await ctx.resolveCredentialSecret(input.credential)
      : null);
  if (!token) {
    return blockedResult({
      vendorId: "sentry",
      capabilityId: "list_issues",
      code: "auth_missing",
      message: "Sentry API token ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const query = input.query ? `?query=${encodeURIComponent(input.query)}` : "";
  const url = `${SENTRY_API}/projects/${encodeURIComponent(input.organizationSlug)}/${encodeURIComponent(input.projectSlug)}/issues/${query}`;
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "sentry",
      capabilityId: "list_issues",
      method: "GET",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 20_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as Array<{ id?: string }>;
      if (!Array.isArray(parsed)) throw new Error("sentry_issues_not_array");
      return {
        issueIds: parsed
          .map((item) => item.id)
          .filter((id): id is string => typeof id === "string"),
      };
    },
  });
}

export async function sentryGetIssue(
  input: {
    issueId: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    apiToken?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ id: string; title?: string; status?: string }>> {
  const token =
    input.apiToken ??
    (ctx.resolveCredentialSecret
      ? await ctx.resolveCredentialSecret(input.credential)
      : null);
  if (!token) {
    return blockedResult({
      vendorId: "sentry",
      capabilityId: "get_issue",
      code: "auth_missing",
      message: "Sentry API token ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "sentry",
      capabilityId: "get_issue",
      method: "GET",
      url: `${SENTRY_API}/issues/${encodeURIComponent(input.issueId)}/`,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as {
        id?: string;
        title?: string;
        status?: string;
      };
      if (!parsed.id) throw new Error("sentry_issue_missing_id");
      return {
        id: parsed.id,
        ...(parsed.title ? { title: parsed.title } : {}),
        ...(parsed.status ? { status: parsed.status } : {}),
      };
    },
  });
}

export function verifySentryWebhook(input: {
  rawBody: string;
  signatureHeader: string;
  signingSecret: string;
  dedupe: DedupeStore;
  eventId: string;
}):
  | { ok: true }
  | { ok: false; code: string; message: string } {
  const signed = acceptSignedWebhook({
    verify: {
      style: "sentry_hmac",
      rawBody: input.rawBody,
      signatureHeader: input.signatureHeader,
      signingSecret: input.signingSecret,
    },
    dedupe: input.dedupe,
    dedupeKey: `sentry:${input.eventId}`,
  });
  if (!signed.ok) {
    return {
      ok: false,
      code: signed.reason,
      message: `Sentry webhook rejected: ${signed.reason}`,
    };
  }
  return { ok: true };
}
