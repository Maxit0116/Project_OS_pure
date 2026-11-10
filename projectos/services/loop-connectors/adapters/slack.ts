import { blockedResult, dispatchConnectorRequest, type ConnectorDispatchContext } from "../dispatch.js";
import {
  assertExternalActorAttestation,
  acceptSignedWebhook,
  type DedupeStore,
} from "../security.js";
import type {
  LoopConnectorResult,
  LoopCredentialRef,
} from "../types.js";

const SLACK_API = "https://slack.com/api";

export type SlackPostMessageInput = {
  channel: string;
  text: string;
  credential: LoopCredentialRef;
  idempotencyKey: string;
  /** Injected bearer token for contract tests — production resolves via secret store. */
  accessToken?: string;
};

export async function slackChatPostMessage(
  input: SlackPostMessageInput,
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ ok: boolean; ts?: string; channel?: string }>> {
  if (input.credential.scheme === "webhook_url_ref") {
    return blockedResult({
      vendorId: "slack",
      capabilityId: "chat_postMessage",
      code: "notify_only",
      message:
        "Incoming Webhook credential cannot call chat.postMessage; use bot_token_ref",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const token =
    input.accessToken ??
    (ctx.resolveCredentialSecret
      ? await ctx.resolveCredentialSecret(input.credential)
      : null);
  if (!token) {
    return blockedResult({
      vendorId: "slack",
      capabilityId: "chat_postMessage",
      code: "auth_missing",
      message: "Slack bot token ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }

  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "slack",
      capabilityId: "chat_postMessage",
      method: "POST",
      url: `${SLACK_API}/chat.postMessage`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: input.channel,
        text: input.text,
      }),
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as {
        ok?: boolean;
        error?: string;
        ts?: string;
        channel?: string;
      };
      if (!parsed.ok) {
        throw new Error(parsed.error ?? "slack_api_error");
      }
      return {
        ok: true,
        ...(parsed.ts ? { ts: parsed.ts } : {}),
        ...(parsed.channel ? { channel: parsed.channel } : {}),
      };
    },
  });
}

/** Incoming webhook notify — never treated as approval. */
export async function slackIncomingWebhookNotify(
  input: {
    text: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    webhookUrl?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ notified: true }>> {
  if (input.credential.scheme !== "webhook_url_ref") {
    return blockedResult({
      vendorId: "slack",
      capabilityId: "incoming_webhook_notify",
      code: "unconfigured",
      message: "incoming_webhook_notify requires webhook_url_ref",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const url =
    input.webhookUrl ??
    (ctx.resolveCredentialSecret
      ? await ctx.resolveCredentialSecret(input.credential)
      : null);
  if (!url) {
    return blockedResult({
      vendorId: "slack",
      capabilityId: "incoming_webhook_notify",
      code: "auth_missing",
      message: "Slack webhook URL ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "slack",
      capabilityId: "incoming_webhook_notify",
      method: "POST",
      url,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.text }),
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 10_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: () => ({ notified: true as const }),
  });
}

export function verifySlackInteraction(input: {
  rawBody: string;
  signatureHeader: string;
  timestampSec: number;
  signingSecret: string;
  dedupe: DedupeStore;
  eventId: string;
  actorAttestation: "external_signed" | "local_declared" | "missing";
}):
  | { ok: true }
  | { ok: false; code: string; message: string } {
  const signed = acceptSignedWebhook({
    verify: {
      style: "slack_v0",
      rawBody: input.rawBody,
      signatureHeader: input.signatureHeader,
      signingSecret: input.signingSecret,
      timestampSec: input.timestampSec,
    },
    dedupe: input.dedupe,
    dedupeKey: `slack:${input.eventId}`,
  });
  if (!signed.ok) {
    return {
      ok: false,
      code: signed.reason,
      message: `Slack interaction rejected: ${signed.reason}`,
    };
  }
  const actor = assertExternalActorAttestation({
    actorAttestation: input.actorAttestation,
    interactionSignatureValid: true,
  });
  if (!actor.ok) return actor;
  return { ok: true };
}
