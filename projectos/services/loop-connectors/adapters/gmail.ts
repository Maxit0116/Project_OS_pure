/**
 * Gmail phase-1 read-only adapter — production dispatch + injectable transport.
 * No live mailbox, no send, no Pub/Sub deploy in this module.
 */
import type { LoopTaskMaterial } from "../../../contracts/loop-task-materials.js";
import {
  blockedResult,
  dispatchConnectorRequest,
  type ConnectorDispatchContext,
} from "../dispatch.js";
import type { LoopConnectorResult, LoopCredentialRef } from "../types.js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailMessageListItem = {
  id: string;
  threadId?: string;
};

export type GmailMessageListPage = {
  messages: GmailMessageListItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailMimePart = {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMimePart[];
};

export type GmailMessagePayload = {
  id: string;
  threadId?: string;
  historyId?: string;
  snippet?: string;
  payload?: GmailMimePart;
  labelIds?: string[];
  internalDate?: string;
};

export type GmailDecodedBody = {
  textPlain: string;
  textHtmlRaw: string;
  /** Script/tracking-stripped HTML safe for product preview (still untrusted). */
  textHtmlSafe: string;
  attachments: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }>;
};

async function resolveToken(
  input: { accessToken?: string; credential: LoopCredentialRef },
  ctx: ConnectorDispatchContext,
): Promise<string | null> {
  if (input.accessToken) return input.accessToken;
  if (!ctx.resolveCredentialSecret) return null;
  return (await ctx.resolveCredentialSecret(input.credential)) ?? null;
}

/** Gmail API uses URL-safe base64 without padding. */
export function decodeGmailBase64(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64").toString("utf8");
}

/**
 * Strip executable / tracking vectors from HTML. Does not make HTML "trusted" —
 * still treat as hostile content; never elevate privileges from email.
 */
export function sanitizeGmailHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(
      /<img\b([^>]*?)\bsrc\s*=\s*("|')https?:\/\/[^"']+\2([^>]*)>/gi,
      (_m, pre: string, _q: string, post: string) =>
        `<img${pre} data-tracking-blocked="1"${post}>`,
    )
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");
}

/** Recursively collect plain/html bodies and attachment metadata from MIME. */
export function decodeGmailMimeTree(root: GmailMimePart | undefined): GmailDecodedBody {
  const textParts: string[] = [];
  const htmlParts: string[] = [];
  const attachments: GmailDecodedBody["attachments"] = [];

  const walk = (part: GmailMimePart | undefined) => {
    if (!part) return;
    const mime = (part.mimeType ?? "application/octet-stream").toLowerCase();
    if (part.parts?.length) {
      for (const child of part.parts) walk(child);
      return;
    }
    const attachmentId = part.body?.attachmentId;
    const filename = part.filename?.trim() ?? "";
    if (attachmentId) {
      attachments.push({
        attachmentId,
        filename: filename || "attachment",
        mimeType: mime,
        sizeBytes: Math.max(0, part.body?.size ?? 0),
      });
      return;
    }
    const data = part.body?.data;
    if (!data) return;
    const decoded = decodeGmailBase64(data);
    if (mime.startsWith("text/plain")) textParts.push(decoded);
    else if (mime.startsWith("text/html")) htmlParts.push(decoded);
    else if (filename) {
      attachments.push({
        attachmentId: `inline_${filename}`,
        filename,
        mimeType: mime,
        sizeBytes: Buffer.byteLength(decoded, "utf8"),
      });
    }
  };

  walk(root);
  const textHtmlRaw = htmlParts.join("\n");
  return {
    textPlain: textParts.join("\n"),
    textHtmlRaw,
    textHtmlSafe: sanitizeGmailHtml(textHtmlRaw),
    attachments,
  };
}

/**
 * Map an attachment descriptor to a TaskMaterial for the current run snapshot.
 * Does not fetch bytes here — contentRef is a stable opaque pointer.
 */
export function gmailAttachmentToTaskMaterial(input: {
  accountRefId: string;
  messageId: string;
  threadId?: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  historyId?: string;
  runId?: string;
  nowIso?: string;
}): LoopTaskMaterial {
  const now = input.nowIso ?? new Date().toISOString();
  const kind =
    input.mimeType.startsWith("image/")
      ? ("image" as const)
      : input.mimeType.includes("csv") ||
          input.mimeType.includes("spreadsheet") ||
          input.mimeType.includes("excel")
        ? ("table" as const)
        : ("file" as const);
  return {
    id: `mat_gmail_${input.messageId}_${input.attachmentId}`.slice(0, 120),
    kind,
    purpose: "other",
    title: input.filename.slice(0, 240) || "Gmail attachment",
    source: "gmail",
    contentRef: `gmail://${input.accountRefId}/messages/${input.messageId}/attachments/${input.attachmentId}`,
    parseStatus: "pending",
    mimeType: input.mimeType.slice(0, 120),
    sizeBytes: Math.min(50_000_000, Math.max(0, input.sizeBytes)),
    gmail: {
      accountRefId: input.accountRefId,
      messageId: input.messageId,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      attachmentId: input.attachmentId,
      ...(input.historyId ? { historyId: input.historyId } : {}),
    },
    runOverride: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function gmailMessageBodyToTaskMaterial(input: {
  accountRefId: string;
  message: GmailMessagePayload;
  decoded: GmailDecodedBody;
  nowIso?: string;
}): LoopTaskMaterial {
  const now = input.nowIso ?? new Date().toISOString();
  const body =
    input.decoded.textPlain.trim() ||
    input.decoded.textHtmlSafe.replace(/<[^>]+>/g, " ").trim();
  // Snippet alone is never enough — require decoded body.
  if (!body) {
    throw new Error(
      "Gmail message has no decoded body; refusing to promote snippet as content",
    );
  }
  return {
    id: `mat_gmail_msg_${input.message.id}`.slice(0, 120),
    kind: "text",
    purpose: "issue_or_pr",
    title: (
      input.message.payload?.headers?.find((h) => h.name?.toLowerCase() === "subject")
        ?.value ?? `Gmail ${input.message.id}`
    ).slice(0, 240),
    source: "gmail",
    contentRef: `gmail://${input.accountRefId}/messages/${input.message.id}/body`,
    parseStatus: "ok",
    mimeType: "text/plain",
    sizeBytes: Buffer.byteLength(body, "utf8"),
    gmail: {
      accountRefId: input.accountRefId,
      messageId: input.message.id,
      ...(input.message.threadId ? { threadId: input.message.threadId } : {}),
      ...(input.message.historyId ? { historyId: input.message.historyId } : {}),
    },
    runOverride: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function gmailMessagesSearch(
  input: {
    q: string;
    pageToken?: string;
    maxResults?: number;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<GmailMessageListPage>> {
  const token = await resolveToken(input, ctx);
  if (!token) {
    return blockedResult({
      vendorId: "gmail",
      capabilityId: "messages_search",
      code: "auth_missing",
      message: "Gmail OAuth token ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const params = new URLSearchParams();
  params.set("q", input.q);
  if (input.pageToken) params.set("pageToken", input.pageToken);
  if (input.maxResults) params.set("maxResults", String(input.maxResults));
  // fields: ids only — do not request/trust snippet as body
  params.set("fields", "messages(id,threadId),nextPageToken,resultSizeEstimate");

  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "gmail",
      capabilityId: "messages_search",
      method: "GET",
      url: `${GMAIL_API}/messages?${params.toString()}`,
      headers: { Authorization: `Bearer ${token}` },
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as {
        messages?: Array<{ id?: string; threadId?: string; snippet?: string }>;
        nextPageToken?: string;
        resultSizeEstimate?: number;
      };
      const messages: GmailMessageListItem[] = [];
      for (const item of parsed.messages ?? []) {
        if (!item.id) continue;
        // Explicitly drop snippet if a transport stub included it.
        messages.push({
          id: item.id,
          ...(item.threadId ? { threadId: item.threadId } : {}),
        });
      }
      return {
        messages,
        ...(parsed.nextPageToken ? { nextPageToken: parsed.nextPageToken } : {}),
        ...(typeof parsed.resultSizeEstimate === "number"
          ? { resultSizeEstimate: parsed.resultSizeEstimate }
          : {}),
      };
    },
  });
}

export async function gmailMessagesGet(
  input: {
    messageId: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
    format?: "full" | "raw" | "minimal";
  },
  ctx: ConnectorDispatchContext,
): Promise<
  LoopConnectorResult<{ message: GmailMessagePayload; decoded: GmailDecodedBody }>
> {
  const token = await resolveToken(input, ctx);
  if (!token) {
    return blockedResult({
      vendorId: "gmail",
      capabilityId: "messages_get",
      code: "auth_missing",
      message: "Gmail OAuth token ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const format = input.format ?? "full";
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "gmail",
      capabilityId: "messages_get",
      method: "GET",
      url: `${GMAIL_API}/messages/${encodeURIComponent(input.messageId)}?format=${format}`,
      headers: { Authorization: `Bearer ${token}` },
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 20_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const message = JSON.parse(bodyText) as GmailMessagePayload;
      if (!message.id) throw new Error("gmail_message_missing_id");
      const decoded = decodeGmailMimeTree(message.payload);
      if (format === "full" && !decoded.textPlain && !decoded.textHtmlRaw) {
        // Minimal/metadata responses legitimately lack body; full must not fall back to snippet.
        if (message.snippet && !message.payload) {
          throw new Error("gmail_refusing_snippet_as_body");
        }
      }
      return { message, decoded };
    },
  });
}

export async function gmailThreadsGet(
  input: {
    threadId: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<
  LoopConnectorResult<{
    id: string;
    historyId?: string;
    messages: Array<{ message: GmailMessagePayload; decoded: GmailDecodedBody }>;
  }>
> {
  const token = await resolveToken(input, ctx);
  if (!token) {
    return blockedResult({
      vendorId: "gmail",
      capabilityId: "threads_get",
      code: "auth_missing",
      message: "Gmail OAuth token ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "gmail",
      capabilityId: "threads_get",
      method: "GET",
      url: `${GMAIL_API}/threads/${encodeURIComponent(input.threadId)}?format=full`,
      headers: { Authorization: `Bearer ${token}` },
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 30_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as {
        id?: string;
        historyId?: string;
        messages?: GmailMessagePayload[];
      };
      if (!parsed.id) throw new Error("gmail_thread_missing_id");
      const messages = (parsed.messages ?? []).map((message) => ({
        message,
        decoded: decodeGmailMimeTree(message.payload),
      }));
      return {
        id: parsed.id,
        ...(parsed.historyId ? { historyId: parsed.historyId } : {}),
        messages,
      };
    },
  });
}

export async function gmailAttachmentsGet(
  input: {
    messageId: string;
    attachmentId: string;
    threadId?: string;
    filename: string;
    mimeType: string;
    sizeBytes?: number;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
    accountRefId?: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<
  LoopConnectorResult<{ material: LoopTaskMaterial; bytesBase64: string; sizeBytes: number }>
> {
  const token = await resolveToken(input, ctx);
  if (!token) {
    return blockedResult({
      vendorId: "gmail",
      capabilityId: "attachments_get",
      code: "auth_missing",
      message: "Gmail OAuth token ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "gmail",
      capabilityId: "attachments_get",
      method: "GET",
      url: `${GMAIL_API}/messages/${encodeURIComponent(input.messageId)}/attachments/${encodeURIComponent(input.attachmentId)}`,
      headers: { Authorization: `Bearer ${token}` },
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 30_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as { data?: string; size?: number };
      if (!parsed.data) throw new Error("gmail_attachment_missing_data");
      const sizeBytes = parsed.size ?? input.sizeBytes ?? 0;
      const material = gmailAttachmentToTaskMaterial({
        accountRefId: input.accountRefId ?? input.credential.credentialId,
        messageId: input.messageId,
        ...(input.threadId ? { threadId: input.threadId } : {}),
        attachmentId: input.attachmentId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes,
      });
      return { material, bytesBase64: parsed.data, sizeBytes };
    },
  });
}

/**
 * Online-only history poll. Explicitly not a 24/7 listener.
 * Callers must surface "app online required" in product copy.
 */
export async function gmailPollHistory(
  input: {
    startHistoryId: string;
    pageToken?: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
    signal?: AbortSignal;
  },
  ctx: ConnectorDispatchContext,
): Promise<
  LoopConnectorResult<{
    historyId?: string;
    history: Array<{ id?: string; messagesAdded?: unknown[] }>;
    nextPageToken?: string;
    onlineOnly: true;
  }>
> {
  if (input.signal?.aborted) {
    return blockedResult({
      vendorId: "gmail",
      capabilityId: "poll_history",
      code: "cancelled",
      message: "Gmail history poll cancelled",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const token = await resolveToken(input, ctx);
  if (!token) {
    return blockedResult({
      vendorId: "gmail",
      capabilityId: "poll_history",
      code: "auth_missing",
      message: "Gmail OAuth token ref unresolved (scope may be insufficient)",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  const params = new URLSearchParams();
  params.set("startHistoryId", input.startHistoryId);
  if (input.pageToken) params.set("pageToken", input.pageToken);
  return dispatchConnectorRequest({
    ctx,
    request: {
      vendorId: "gmail",
      capabilityId: "poll_history",
      method: "GET",
      url: `${GMAIL_API}/history?${params.toString()}`,
      headers: { Authorization: `Bearer ${token}` },
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 15_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText, status) => {
      if (status === 404) {
        throw Object.assign(new Error("gmail_history_expired_full_resync_required"), {
          code: "gmail_history_404",
        });
      }
      const parsed = JSON.parse(bodyText) as {
        historyId?: string;
        history?: Array<{ id?: string; messagesAdded?: unknown[] }>;
        nextPageToken?: string;
      };
      return {
        ...(parsed.historyId ? { historyId: parsed.historyId } : {}),
        history: parsed.history ?? [],
        ...(parsed.nextPageToken ? { nextPageToken: parsed.nextPageToken } : {}),
        onlineOnly: true as const,
      };
    },
  });
}

/** Planned push path — phase-1 refuses execution (no Pub/Sub deploy). */
export async function gmailUsersWatchRefuse(
  input: { idempotencyKey: string; credential: LoopCredentialRef },
  _ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<never>> {
  void _ctx;
  return blockedResult({
    vendorId: "gmail",
    capabilityId: "users_watch",
    code: "unconfigured",
    message:
      "Gmail users.watch→Pub/Sub is planned; phase-1 does not deploy Pub/Sub or claim always-on push",
    idempotencyKey: input.idempotencyKey,
    credentialRefId: input.credential.credentialId,
  });
}

/** Send remains high-risk / default-off — omit highRiskAuthorized → blocked. */
export async function gmailMessagesSendBlocked(
  input: {
    raw: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
    highRiskAuthorized?: boolean;
  },
  ctx: ConnectorDispatchContext,
): Promise<LoopConnectorResult<{ id: string }>> {
  const token = await resolveToken(input, ctx);
  if (!token) {
    return blockedResult({
      vendorId: "gmail",
      capabilityId: "messages_send",
      code: "auth_missing",
      message: "Gmail OAuth token ref unresolved",
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  return dispatchConnectorRequest({
    ctx,
    // Omission of highRiskAuthorized must not bypass — gmail send is write_high.
    ...(input.highRiskAuthorized ? { highRiskAuthorized: true } : {}),
    request: {
      vendorId: "gmail",
      capabilityId: "messages_send",
      method: "POST",
      url: `${GMAIL_API}/messages/send`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: input.raw }),
      idempotencyKey: input.idempotencyKey,
      timeoutMs: 20_000,
      credentialRefId: input.credential.credentialId,
    },
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as { id?: string };
      if (!parsed.id) throw new Error("gmail_send_missing_id");
      return { id: parsed.id };
    },
  });
}
