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

/** Hard refuse threshold — exceeding this fails parseStatus; never clamp-as-truth. */
export const GMAIL_MAX_ATTACHMENT_BYTES = 50_000_000;
export const GMAIL_TEXT_PREVIEW_MAX = 8_000;

export type GmailDecodedBody = {
  textPlain: string;
  /** Untrusted raw HTML — never render as-is in product UI. */
  textHtmlRaw: string;
  /**
   * Plaintext-only preview derived from plain or HTML-stripped text.
   * Product preview MUST use this (or textPlain) — not HTML. Name is not a
   * "sanitized HTML is safe" claim; remote HTML is refused for display.
   */
  previewText: string;
  charsetNotes: string[];
  partial: boolean;
  attachments: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    /** Provider-declared size when present. */
    declaredSizeBytes: number;
    /** Measured base64-decoded byte length. */
    measuredSizeBytes: number;
    binary: boolean;
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

/** Gmail API uses URL-safe base64 without padding → Buffer (binary-safe). */
export function decodeGmailBase64Bytes(data: string): Buffer {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

/** @deprecated Prefer decodeGmailBase64Bytes — UTF-8 string decode corrupts binary. */
export function decodeGmailBase64(data: string): string {
  return decodeGmailBase64Bytes(data).toString("utf8");
}

function charsetFromMime(mimeType: string | undefined, headers?: GmailMimePart["headers"]): string | null {
  const ct =
    headers?.find((h) => h.name?.toLowerCase() === "content-type")?.value ??
    mimeType ??
    "";
  const match = /charset\s*=\s*("?)([^";\s]+)\1/i.exec(ct);
  return match?.[2]?.toLowerCase() ?? null;
}

function decodeTextBuffer(buf: Buffer, charset: string | null): { text: string; note?: string } {
  if (!charset || charset === "utf-8" || charset === "utf8" || charset === "us-ascii") {
    return { text: buf.toString("utf8") };
  }
  // Phase-1: no full iconv — transparent partial when non-UTF8.
  return {
    text: buf.toString("utf8"),
    note: `charset_${charset}_decoded_as_utf8_partial`,
  };
}

/**
 * Product HTML policy: NO HTML rendering path.
 * Regex "sanitizers" are bypassable (style/url, srcset, SVG, encoded protocols,
 * object/embed/meta, …). Project has no DOMPurify-class HTML sanitizer in-tree,
 * so preview is plaintext-only — never claim HTML is safe for display.
 */
export function htmlToPlaintextPreview(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** @deprecated Alias kept for call sites — returns plaintext, not safe HTML. */
export function sanitizeGmailHtml(html: string): string {
  return htmlToPlaintextPreview(html);
}

/** Recursively collect plain/html bodies and attachment metadata from MIME. */
export function decodeGmailMimeTree(root: GmailMimePart | undefined): GmailDecodedBody {
  const textParts: string[] = [];
  const htmlParts: string[] = [];
  const attachments: GmailDecodedBody["attachments"] = [];
  const charsetNotes: string[] = [];
  let partial = false;

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
      const declared = Math.max(0, part.body?.size ?? 0);
      attachments.push({
        attachmentId,
        filename: filename || "attachment",
        mimeType: mime,
        declaredSizeBytes: declared,
        measuredSizeBytes: declared,
        binary: !mime.startsWith("text/"),
      });
      return;
    }
    const data = part.body?.data;
    if (!data) return;
    const bytes = decodeGmailBase64Bytes(data);
    const charset = charsetFromMime(part.mimeType, part.headers);
    if (mime.startsWith("text/plain")) {
      const decoded = decodeTextBuffer(bytes, charset);
      textParts.push(decoded.text);
      if (decoded.note) {
        charsetNotes.push(decoded.note);
        partial = true;
      }
      return;
    }
    if (mime.startsWith("text/html")) {
      const decoded = decodeTextBuffer(bytes, charset);
      htmlParts.push(decoded.text);
      if (decoded.note) {
        charsetNotes.push(decoded.note);
        partial = true;
      }
      return;
    }
    if (filename) {
      attachments.push({
        attachmentId: `inline_${filename}`,
        filename,
        mimeType: mime,
        declaredSizeBytes: Math.max(0, part.body?.size ?? bytes.byteLength),
        measuredSizeBytes: bytes.byteLength,
        binary: true,
      });
      partial = true;
    }
  };

  walk(root);
  const textPlain = textParts.join("\n");
  const textHtmlRaw = htmlParts.join("\n");
  const previewText = (
    textPlain.trim() || htmlToPlaintextPreview(textHtmlRaw)
  ).slice(0, GMAIL_TEXT_PREVIEW_MAX);
  if (textHtmlRaw && !textPlain.trim()) partial = true;
  return {
    textPlain,
    textHtmlRaw,
    previewText,
    charsetNotes,
    partial,
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
  /** Provider-declared size (may be missing). */
  sizeBytes: number;
  measuredSizeBytes?: number;
  historyId?: string;
  runId?: string;
  nowIso?: string;
}): LoopTaskMaterial {
  const now = input.nowIso ?? new Date().toISOString();
  const declared = Math.max(0, input.sizeBytes);
  const measured = Math.max(0, input.measuredSizeBytes ?? declared);
  const overLimit =
    declared > GMAIL_MAX_ATTACHMENT_BYTES || measured > GMAIL_MAX_ATTACHMENT_BYTES;
  const kind =
    input.mimeType.startsWith("image/")
      ? ("image" as const)
      : input.mimeType.includes("csv") ||
          input.mimeType.includes("spreadsheet") ||
          input.mimeType.includes("excel")
        ? ("table" as const)
        : ("file" as const);
  // Stable id includes accountRef to avoid cross-account collisions.
  const id =
    `mat_gmail_${input.accountRefId}_${input.messageId}_${input.attachmentId}`.slice(
      0,
      120,
    );
  return {
    id,
    kind,
    purpose: "other",
    title: input.filename.slice(0, 240) || "Gmail attachment",
    source: "gmail",
    contentRef: `gmail://${input.accountRefId}/messages/${input.messageId}/attachments/${input.attachmentId}`,
    parseStatus: overLimit ? "failed" : "pending",
    ...(overLimit
      ? {
          parseMessage: `Attachment exceeds ${GMAIL_MAX_ATTACHMENT_BYTES} byte limit (declared=${declared}, measured=${measured})`,
        }
      : {}),
    mimeType: input.mimeType.slice(0, 120),
    // Honest sizes — do not Math.min clamp declared into a fake compliant value.
    ...(declared <= GMAIL_MAX_ATTACHMENT_BYTES ? { sizeBytes: declared } : {}),
    measuredSizeBytes: measured,
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
  const body = input.decoded.previewText.trim();
  // Snippet alone is never enough — require decoded body preview.
  if (!body) {
    throw new Error(
      "Gmail message has no decoded body; refusing to promote snippet as content",
    );
  }
  const measured = Buffer.byteLength(body, "utf8");
  const partial =
    input.decoded.partial ||
    Boolean(input.decoded.textHtmlRaw && !input.decoded.textPlain.trim());
  return {
    id: `mat_gmail_${input.accountRefId}_msg_${input.message.id}`.slice(0, 120),
    kind: "text",
    purpose: "issue_or_pr",
    title: (
      input.message.payload?.headers?.find((h) => h.name?.toLowerCase() === "subject")
        ?.value ?? `Gmail ${input.message.id}`
    ).slice(0, 240),
    source: "gmail",
    contentRef: `gmail://${input.accountRefId}/messages/${input.message.id}/body`,
    // Preview is local plaintext; full bytes still require contentRef resolve.
    parseStatus: partial ? "partial" : "ok",
    ...(partial
      ? {
          parseMessage:
            input.decoded.charsetNotes.join("; ") ||
            "HTML-only or non-UTF8 charset — plaintext preview only; HTML not rendered",
        }
      : {}),
    textPreview: body.slice(0, GMAIL_TEXT_PREVIEW_MAX),
    mimeType: "text/plain",
    sizeBytes: measured,
    measuredSizeBytes: measured,
    charset: "utf-8",
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

/**
 * Resolve a gmail:// contentRef via the same production messages.get / attachments.get path.
 * Returns plaintext preview for bodies; attachments return measured bytes metadata only
 * until a workspace blob store is wired (phase-1 honesty).
 */
export async function resolveGmailMaterialContent(
  contentRef: string,
  input: {
    credential: LoopCredentialRef;
    accessToken?: string;
    idempotencyKey: string;
  },
  ctx: ConnectorDispatchContext,
): Promise<
  | { kind: "body"; materialPreview: string; messageId: string; accountRefId: string }
  | { kind: "attachment"; bytes: Buffer; attachmentId: string; messageId: string; accountRefId: string }
  | { kind: "error"; message: string }
> {
  const match = /^gmail:\/\/([^/]+)\/messages\/([^/]+)\/(body|attachments\/([^/]+))$/.exec(
    contentRef,
  );
  if (!match) return { kind: "error", message: "Invalid gmail contentRef" };
  const accountRefId = match[1]!;
  const messageId = match[2]!;
  if (match[3] === "body") {
    const got = await gmailMessagesGet(
      {
        messageId,
        credential: input.credential,
        idempotencyKey: input.idempotencyKey,
        ...(input.accessToken ? { accessToken: input.accessToken } : {}),
      },
      ctx,
    );
    if (!got.ok) return { kind: "error", message: got.message };
    return {
      kind: "body",
      materialPreview: got.data.decoded.previewText,
      messageId,
      accountRefId,
    };
  }
  const attachmentId = match[4]!;
  const got = await gmailAttachmentsGet({
    messageId,
    attachmentId,
    filename: attachmentId,
    mimeType: "application/octet-stream",
    credential: input.credential,
    idempotencyKey: input.idempotencyKey,
    accountRefId,
    ...(input.accessToken ? { accessToken: input.accessToken } : {}),
  }, ctx);
  if (!got.ok) return { kind: "error", message: got.message };
  return {
    kind: "attachment",
    bytes: decodeGmailBase64Bytes(got.data.bytesBase64),
    attachmentId,
    messageId,
    accountRefId,
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
      const measured = decodeGmailBase64Bytes(parsed.data).byteLength;
      const declared = parsed.size ?? input.sizeBytes ?? measured;
      const material = gmailAttachmentToTaskMaterial({
        accountRefId: input.accountRefId ?? input.credential.credentialId,
        messageId: input.messageId,
        ...(input.threadId ? { threadId: input.threadId } : {}),
        attachmentId: input.attachmentId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: declared,
        measuredSizeBytes: measured,
      });
      return { material, bytesBase64: parsed.data, sizeBytes: measured };
    },
  });
}

/**
 * Online-only history poll. Explicitly not a 24/7 listener.
 * Callers must surface "app online required" in product copy.
 */
/**
 * Online-only history poll — NOT a complete 24/7 poller.
 * Handles expired historyId (HTTP 404 → resync_required) on the production
 * error path (dispatch maps non-2xx before parseOk).
 * Dedupes history record ids; preserves pageToken for caller-driven pagination.
 * Cancel must flow via ctx.signal into transport (input.signal is merged).
 */
export async function gmailPollHistory(
  input: {
    startHistoryId: string;
    pageToken?: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
    signal?: AbortSignal;
    /** Known history record ids to drop on out-of-order / replay. */
    seenHistoryIds?: Iterable<string>;
  },
  ctx: ConnectorDispatchContext,
): Promise<
  LoopConnectorResult<{
    historyId?: string;
    history: Array<{ id?: string; messagesAdded?: unknown[] }>;
    nextPageToken?: string;
    onlineOnly: true;
    /** When set, discard startHistoryId and perform full sync. */
    requiresFullResync?: boolean;
  }>
> {
  const signal = input.signal ?? ctx.signal;
  if (signal?.aborted) {
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
  const mergedCtx: ConnectorDispatchContext = {
    ...ctx,
    ...(signal ? { signal } : {}),
  };
  const result = await dispatchConnectorRequest({
    ctx: mergedCtx,
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
    parseOk: (bodyText) => {
      const parsed = JSON.parse(bodyText) as {
        historyId?: string;
        history?: Array<{ id?: string; messagesAdded?: unknown[] }>;
        nextPageToken?: string;
      };
      const seen = new Set(input.seenHistoryIds ?? []);
      const history = (parsed.history ?? []).filter((item) => {
        if (!item.id) return true;
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      return {
        ...(parsed.historyId ? { historyId: parsed.historyId } : {}),
        history,
        ...(parsed.nextPageToken ? { nextPageToken: parsed.nextPageToken } : {}),
        onlineOnly: true as const,
      };
    },
  });
  // Production path: non-2xx never reaches parseOk — remap expired cursor here.
  if (!result.ok && result.audit.httpStatus === 404) {
    return {
      ok: false,
      vendorId: "gmail",
      capabilityId: "poll_history",
      code: "resync_required",
      message:
        "Gmail historyId expired (HTTP 404) — discard cursor and perform full sync; not a complete poller",
      retryable: false,
      unknownOutcome: false,
      audit: {
        ...result.audit,
        code: "resync_required",
        message: "HTTP 404 history expired — full resync required",
      },
    };
  }
  return result;
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
