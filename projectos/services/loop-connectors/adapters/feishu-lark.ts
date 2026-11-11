import {
  blockedResult,
  dispatchConnectorRequest,
  type ConnectorDispatchContext,
} from "../dispatch.js";
import {
  acceptSignedWebhook,
  assertExternalActorAttestation,
  type DedupeStore,
} from "../security.js";
import type {
  LoopConnectorResult,
  LoopConnectorVendorId,
  LoopCredentialRef,
} from "../types.js";

/** Feishu (国内) vs Lark (国际) — separate API hosts; never conflate brands. */
const API_HOST: Record<"feishu" | "lark", string> = {
  feishu: "https://open.feishu.cn",
  lark: "https://open.larksuite.com",
};

export async function feishuLarkSendMessage(
  vendorId: "feishu" | "lark",
  input: {
    receiveId: string;
    receiveIdType?: "open_id" | "chat_id" | "email";
    text: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    tenantAccessToken?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ messageId?: string }>> {
  if (input.credential.scheme === "webhook_url_ref") {
    return blockedResult({
      vendorId,
      capabilityId: "im_message_create",
      code: "notify_only",
      message: `${vendorId} custom-bot webhook cannot call IM OpenAPI; use bot_token_ref / oauth_token_ref`,
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const token =
    input.tenantAccessToken ??
    (ctx.resolveCredentialSecret
      ? await ctx.resolveCredentialSecret(input.credential)
      : null);
  if (!token) {
    return blockedResult({
      vendorId,
      capabilityId: "im_message_create",
      code: "auth_missing",
      message: `${vendorId} access token ref unresolved`,
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const receiveIdType = input.receiveIdType ?? "chat_id";
  const url = `${API_HOST[vendorId]}/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`;
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId,
      capabilityId: "im_message_create",
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        receive_id: input.receiveId,
        msg_type: "text",
        content: JSON.stringify({ text: input.text }),
      }),
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as {
        code?: number;
        msg?: string;
        data?: { message_id?: string };
      };
      if (parsed.code !== 0) {
        throw new Error(parsed.msg ?? `${vendorId}_api_error`);
      }
      return parsed.data?.message_id
        ? { messageId: parsed.data.message_id }
        : {};
    },
  });
}

/** Custom bot webhook — notify only, never approval. */
export async function feishuLarkCustomBotNotify(
  vendorId: "feishu" | "lark",
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
      vendorId,
      capabilityId: "custom_bot_notify",
      code: "unconfigured",
      message: "custom_bot_notify requires webhook_url_ref",
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
      vendorId,
      capabilityId: "custom_bot_notify",
      code: "auth_missing",
      message: `${vendorId} custom bot webhook unresolved`,
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId,
      capabilityId: "custom_bot_notify",
      method: "POST",
      url,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text: input.text },
      }),
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 10_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: () => ({ notified: true as const }),
  });
}

export function verifyFeishuLarkCardAction(input: {
  vendorId: Extract<LoopConnectorVendorId, "feishu" | "lark">;
  rawBody: string;
  signatureHeader: string;
  signingSecret: string;
  dedupe: DedupeStore;
  eventId: string;
  actorAttestation: "external_signed" | "local_declared" | "missing";
  timestampSec?: number;
}):
  | { ok: true }
  | { ok: false; code: string; message: string } {
  const signed = acceptSignedWebhook({
    verify: {
      style: "feishu_lark_sha256",
      rawBody: input.rawBody,
      signatureHeader: input.signatureHeader,
      signingSecret: input.signingSecret,
      ...(input.timestampSec != null ? { timestampSec: input.timestampSec } : {}),
    },
    dedupe: input.dedupe,
    dedupeKey: `${input.vendorId}:${input.eventId}`,
  });
  if (!signed.ok) {
    return {
      ok: false,
      code: signed.reason,
      message: `${input.vendorId} card action rejected: ${signed.reason}`,
    };
  }
  const actor = assertExternalActorAttestation({
    actorAttestation: input.actorAttestation,
    interactionSignatureValid: true,
  });
  if (!actor.ok) return actor;
  return { ok: true };
}
