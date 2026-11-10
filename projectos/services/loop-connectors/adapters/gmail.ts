/**
 * Gmail phase-1 read-only adapter — production dispatch + injectable transport.
 * No live mailbox, no send, no Pub/Sub deploy in this module.
 */
import type { LoopTaskMaterial } from "../../../contracts/loop-task-materials.js";
import {
  dedupeConnectorIds,
  recoverConnectorCursor,
  type ConnectorDedupState,
} from "../../loop-connector-recover-dedup.js";
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
   * May be truncated at GMAIL_TEXT_PREVIEW_MAX — see previewTruncated.
   */
  previewText: string;
  /** True when previewText is a capped slice — not a full-body read. */
  previewTruncated: boolean;
  /** Character length of the plaintext source before preview cap. */
  fullTextLength: number;
  charsetNotes: string[];
  partial: boolean;
  /**
   * text/plain|html parts that only have attachmentId (no inline data).
   * Must be fetched separately — never treat as file attachments that drop body.
   */
  deferredBodyParts: Array<{
    attachmentId: string;
    mimeType: string;
    filename?: string;
    declaredSizeBytes: number;
  }>;
  attachments: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    /** Provider-declared size when present (not a measured fact). */
    declaredSizeBytes: number;
    /**
     * Measured base64-decoded byte length when bytes were actually decoded.
     * Absent when only a declared size is known — never copy declared→measured.
     */
    measuredSizeBytes?: number;
    binary: boolean;
  }>;
};

/** Trusted account binding: contentRef account must equal credential id before any HTTP. */
export function assertGmailAccountBinding(
  contentRefAccountId: string,
  credential: LoopCredentialRef,
): { ok: true } | { ok: false; message: string } {
  const expected = credential.credentialId.trim();
  const got = contentRefAccountId.trim();
  if (!expected || !got || expected !== got) {
    return {
      ok: false,
      message: `gmail_account_ref_mismatch: contentRef account "${got}" does not bind credential "${expected}" — refusing before HTTP`,
    };
  }
  return { ok: true };
}

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
  const deferredBodyParts: GmailDecodedBody["deferredBodyParts"] = [];
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
      // Large text/html bodies often arrive as attachmentId without inline data.
      // Do NOT classify them as file attachments — that drops the message body.
      if (mime.startsWith("text/plain") || mime.startsWith("text/html")) {
        deferredBodyParts.push({
          attachmentId,
          mimeType: mime,
          ...(filename ? { filename } : {}),
          declaredSizeBytes: declared,
        });
        charsetNotes.push(`body_via_attachment:${attachmentId}`);
        partial = true;
        return;
      }
      attachments.push({
        attachmentId,
        filename: filename || "attachment",
        mimeType: mime,
        declaredSizeBytes: declared,
        // No bytes decoded here — declared must not become measured.
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
  const fullSource = textPlain.trim() || htmlToPlaintextPreview(textHtmlRaw);
  const previewTruncated = fullSource.length > GMAIL_TEXT_PREVIEW_MAX;
  const previewText = fullSource.slice(0, GMAIL_TEXT_PREVIEW_MAX);
  if (textHtmlRaw && !textPlain.trim()) partial = true;
  if (previewTruncated) {
    partial = true;
    charsetNotes.push(`preview_truncated_at_${GMAIL_TEXT_PREVIEW_MAX}`);
  }
  if (deferredBodyParts.length > 0) partial = true;
  return {
    textPlain,
    textHtmlRaw,
    previewText,
    previewTruncated,
    fullTextLength: fullSource.length,
    charsetNotes,
    partial,
    deferredBodyParts,
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
  /** Only when bytes were actually decoded — never copy declared into this. */
  measuredSizeBytes?: number;
  historyId?: string;
  runId?: string;
  nowIso?: string;
}): LoopTaskMaterial {
  const now = input.nowIso ?? new Date().toISOString();
  const declared = Math.max(0, input.sizeBytes);
  const measured =
    typeof input.measuredSizeBytes === "number"
      ? Math.max(0, input.measuredSizeBytes)
      : undefined;
  const overLimit =
    declared > GMAIL_MAX_ATTACHMENT_BYTES ||
    (typeof measured === "number" && measured > GMAIL_MAX_ATTACHMENT_BYTES);
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
          parseMessage: `Attachment exceeds ${GMAIL_MAX_ATTACHMENT_BYTES} byte limit (declared=${declared}${typeof measured === "number" ? `, measured=${measured}` : ", measured=unknown"})`,
        }
      : {}),
    mimeType: input.mimeType.slice(0, 120),
    // Honest sizes — do not Math.min clamp declared; do not invent measured.
    ...(declared > 0 && declared <= GMAIL_MAX_ATTACHMENT_BYTES
      ? { sizeBytes: declared }
      : {}),
    ...(typeof measured === "number" && measured <= GMAIL_MAX_ATTACHMENT_BYTES
      ? { measuredSizeBytes: measured }
      : {}),
    version: 1,
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
  if (input.decoded.deferredBodyParts.length > 0 && !input.decoded.previewText.trim()) {
    throw new Error(
      "Gmail body is deferred to attachment parts; resolve deferred body before promoting material",
    );
  }
  const preview = input.decoded.previewText.trim();
  // Snippet alone is never enough — require decoded body preview.
  if (!preview) {
    throw new Error(
      "Gmail message has no decoded body; refusing to promote snippet as content",
    );
  }
  const fullSource =
    input.decoded.textPlain.trim() ||
    htmlToPlaintextPreview(input.decoded.textHtmlRaw);
  const fullMeasured = Buffer.byteLength(fullSource, "utf8");
  const previewTruncated =
    input.decoded.previewTruncated || fullSource.length > GMAIL_TEXT_PREVIEW_MAX;
  const partial =
    input.decoded.partial ||
    previewTruncated ||
    input.decoded.deferredBodyParts.length > 0 ||
    Boolean(input.decoded.textHtmlRaw && !input.decoded.textPlain.trim());
  const notes = [
    ...input.decoded.charsetNotes,
    ...(previewTruncated
      ? [`truncated_preview_only:${GMAIL_TEXT_PREVIEW_MAX}_of_${input.decoded.fullTextLength}`]
      : []),
    ...(input.decoded.deferredBodyParts.length
      ? [`deferred_body_parts:${input.decoded.deferredBodyParts.length}`]
      : []),
  ];
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
    // Truncated preview must never be parseStatus=ok (not a full-body read).
    parseStatus: partial ? "partial" : "ok",
    ...(partial
      ? {
          parseMessage:
            notes.join("; ") ||
            "HTML-only or non-UTF8 charset — plaintext preview only; HTML not rendered",
        }
      : {}),
    textPreview: preview.slice(0, GMAIL_TEXT_PREVIEW_MAX),
    mimeType: "text/plain",
    // Honest sizes only — never Math.min-clamp measured to pretend under limit.
    ...(fullMeasured <= GMAIL_MAX_ATTACHMENT_BYTES
      ? { sizeBytes: fullMeasured, measuredSizeBytes: fullMeasured }
      : {
          parseStatus: "failed" as const,
          parseMessage: `Body measured ${fullMeasured} exceeds ${GMAIL_MAX_ATTACHMENT_BYTES}`,
        }),
    charset: "utf-8",
    version: 1,
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
 * Bodies return truncated-preview honesty (completeness=preview_only|full_inline).
 * Attachments refuse oversize at the consumption boundary (no bytes returned).
 * Cross-account contentRef vs credential is rejected with 0 HTTP.
 */
export async function resolveGmailMaterialContent(
  contentRef: string,
  input: {
    credential: LoopCredentialRef;
    accessToken?: string;
    idempotencyKey: string;
    /** Optional declared size from run snapshot — used to refuse before download. */
    declaredSizeBytes?: number;
  },
  ctx: ConnectorDispatchContext,
): Promise<
  | {
      kind: "body";
      materialPreview: string;
      messageId: string;
      accountRefId: string;
      completeness: "preview_only" | "full_inline";
      previewTruncated: boolean;
      fullTextLength: number;
      historyId?: string;
    }
  | {
      kind: "attachment";
      bytes: Buffer;
      attachmentId: string;
      messageId: string;
      accountRefId: string;
      measuredSizeBytes: number;
    }
  | { kind: "error"; message: string; code?: string }
> {
  const match = /^gmail:\/\/([^/]+)\/messages\/([^/]+)\/(body|attachments\/([^/]+))$/.exec(
    contentRef,
  );
  if (!match) return { kind: "error", message: "Invalid gmail contentRef", code: "invalid_ref" };
  const accountRefId = match[1]!;
  const messageId = match[2]!;
  const bound = assertGmailAccountBinding(accountRefId, input.credential);
  if (!bound.ok) {
    return { kind: "error", message: bound.message, code: "account_ref_mismatch" };
  }
  if (match[3] === "body") {
    const got = await gmailMessagesGet(
      {
        messageId,
        credential: input.credential,
        idempotencyKey: input.idempotencyKey,
        format: "full",
        ...(input.accessToken ? { accessToken: input.accessToken } : {}),
      },
      ctx,
    );
    if (!got.ok) return { kind: "error", message: got.message };
    const decoded = got.data.decoded;
    if (decoded.deferredBodyParts.length > 0 && !decoded.previewText.trim()) {
      return {
        kind: "error",
        message:
          "Body stored as deferred attachment parts — fetch deferred body before resolve",
        code: "deferred_body",
      };
    }
    const truncated = decoded.previewTruncated || decoded.partial;
    return {
      kind: "body",
      materialPreview: decoded.previewText,
      messageId,
      accountRefId,
      completeness: truncated ? "preview_only" : "full_inline",
      previewTruncated: decoded.previewTruncated,
      fullTextLength: decoded.fullTextLength,
      ...(got.data.message.historyId ? { historyId: got.data.message.historyId } : {}),
    };
  }
  const attachmentId = match[4]!;
  if (
    typeof input.declaredSizeBytes === "number" &&
    input.declaredSizeBytes > GMAIL_MAX_ATTACHMENT_BYTES
  ) {
    return {
      kind: "error",
      message: `Attachment declared size ${input.declaredSizeBytes} exceeds ${GMAIL_MAX_ATTACHMENT_BYTES} — refuse before download`,
      code: "size_limit",
    };
  }
  const got = await gmailAttachmentsGet({
    messageId,
    attachmentId,
    filename: attachmentId,
    mimeType: "application/octet-stream",
    credential: input.credential,
    idempotencyKey: input.idempotencyKey,
    accountRefId,
    ...(typeof input.declaredSizeBytes === "number"
      ? { sizeBytes: input.declaredSizeBytes }
      : {}),
    ...(input.accessToken ? { accessToken: input.accessToken } : {}),
  }, ctx);
  if (!got.ok) return { kind: "error", message: got.message, code: got.code };
  if (got.data.sizeBytes > GMAIL_MAX_ATTACHMENT_BYTES) {
    return {
      kind: "error",
      message: `Attachment measured ${got.data.sizeBytes} exceeds ${GMAIL_MAX_ATTACHMENT_BYTES} — bytes not released to consumer`,
      code: "size_limit",
    };
  }
  // parseOk already refused oversize in attachments_get when material failed.
  if (got.data.material.parseStatus === "failed") {
    return {
      kind: "error",
      message: got.data.material.parseMessage ?? "Attachment failed size/parse gate",
      code: "size_limit",
    };
  }
  return {
    kind: "attachment",
    bytes: decodeGmailBase64Bytes(got.data.bytesBase64),
    attachmentId,
    messageId,
    accountRefId,
    measuredSizeBytes: got.data.sizeBytes,
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
      // raw/minimal intentionally lack a decodable MIME tree — do not return empty
      // decoded as a successful full-body read (would promote false material ok).
      if (format === "raw" || format === "minimal") {
        throw new Error(
          `gmail_format_${format}_has_no_decoded_body — request format=full for MIME decode`,
        );
      }
      const decoded = decodeGmailMimeTree(message.payload);
      if (!decoded.textPlain && !decoded.textHtmlRaw && decoded.deferredBodyParts.length === 0) {
        // Full must not fall back to snippet.
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
  const accountRefId = input.accountRefId ?? input.credential.credentialId;
  const bound = assertGmailAccountBinding(accountRefId, input.credential);
  if (!bound.ok) {
    return blockedResult({
      vendorId: "gmail",
      capabilityId: "attachments_get",
      code: "account_ref_mismatch",
      message: bound.message,
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
  if (
    typeof input.sizeBytes === "number" &&
    input.sizeBytes > GMAIL_MAX_ATTACHMENT_BYTES
  ) {
    return blockedResult({
      vendorId: "gmail",
      capabilityId: "attachments_get",
      code: "size_limit",
      message: `Attachment declared size ${input.sizeBytes} exceeds ${GMAIL_MAX_ATTACHMENT_BYTES} — refuse before HTTP`,
      idempotencyKey: input.idempotencyKey,
      credentialRefId: input.credential.credentialId,
    });
  }
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
      // Prefer provider size header before allocating full decode when possible.
      if (
        typeof parsed.size === "number" &&
        parsed.size > GMAIL_MAX_ATTACHMENT_BYTES
      ) {
        throw new Error(
          `gmail_attachment_over_limit_declared:${parsed.size}`,
        );
      }
      const bytes = decodeGmailBase64Bytes(parsed.data);
      const measured = bytes.byteLength;
      if (measured > GMAIL_MAX_ATTACHMENT_BYTES) {
        throw new Error(`gmail_attachment_over_limit_measured:${measured}`);
      }
      const declared = parsed.size ?? input.sizeBytes ?? measured;
      const material = gmailAttachmentToTaskMaterial({
        accountRefId,
        messageId: input.messageId,
        ...(input.threadId ? { threadId: input.threadId } : {}),
        attachmentId: input.attachmentId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: declared,
        measuredSizeBytes: measured,
      });
      if (material.parseStatus === "failed") {
        throw new Error(material.parseMessage ?? "gmail_attachment_parse_failed");
      }
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
    /** Updated seen-id window after incremental dedupe (caller persists). */
    seenHistoryIds?: string[];
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
      const incomingIds = (parsed.history ?? [])
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id));
      const deduped = dedupeConnectorIds(
        { seenIds: [...(input.seenHistoryIds ?? [])] },
        incomingIds,
      );
      const novelQueue = [...deduped.novel];
      const history = (parsed.history ?? []).filter((item) => {
        if (!item.id) return true;
        const idx = novelQueue.indexOf(item.id);
        if (idx < 0) return false;
        novelQueue.splice(idx, 1);
        return true;
      });
      return {
        ...(parsed.historyId ? { historyId: parsed.historyId } : {}),
        history,
        ...(parsed.nextPageToken ? { nextPageToken: parsed.nextPageToken } : {}),
        onlineOnly: true as const,
        seenHistoryIds: deduped.state.seenIds,
      };
    },
  });
  // Production path: non-2xx never reaches parseOk — remap expired cursor here.
  // Callers should run recoverConnectorCursor(..., "resync_required") then full sync.
  if (!result.ok && result.audit.httpStatus === 404) {
    return {
      ok: false,
      vendorId: "gmail",
      capabilityId: "poll_history",
      code: "resync_required",
      message:
        "Gmail historyId expired (HTTP 404) — discard cursor via recoverConnectorCursor and perform full sync; not a complete poller",
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

/**
 * Production incremental sync path (still online-only; NOT 24/7).
 * poll_history → on resync_required: recoverConnectorCursor + messages_search
 * full list with seen-id dedupe. Helper alone ≠ product sync — this wires both.
 */
export async function gmailIncrementalSync(
  input: {
    startHistoryId?: string;
    credential: LoopCredentialRef;
    idempotencyKey: string;
    accessToken?: string;
    signal?: AbortSignal;
    dedup: ConnectorDedupState;
    /** Full-resync list query when history cursor expired. */
    resyncQuery?: string;
    maxResults?: number;
  },
  ctx: ConnectorDispatchContext,
): Promise<
  LoopConnectorResult<{
    mode: "history" | "full_resync";
    novelMessageIds: string[];
    dedup: ConnectorDedupState;
    historyId?: string;
    nextPageToken?: string;
    onlineOnly: true;
  }>
> {
  if (input.startHistoryId?.trim()) {
    const polled = await gmailPollHistory(
      {
        startHistoryId: input.startHistoryId,
        credential: input.credential,
        idempotencyKey: `${input.idempotencyKey}:poll`,
        ...(input.accessToken ? { accessToken: input.accessToken } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
        seenHistoryIds: input.dedup.seenIds,
      },
      ctx,
    );
    if (polled.ok) {
      const messageIds: string[] = [];
      for (const item of polled.data.history) {
        const added = item.messagesAdded;
        if (!Array.isArray(added)) continue;
        for (const entry of added) {
          const msg = (entry as { message?: { id?: string } })?.message;
          if (msg?.id) messageIds.push(msg.id);
        }
      }
      const deduped = dedupeConnectorIds(
        {
          seenIds: polled.data.seenHistoryIds ?? input.dedup.seenIds,
          ...(polled.data.historyId ? { cursor: polled.data.historyId } : {}),
        },
        messageIds,
      );
      return {
        ok: true,
        vendorId: "gmail",
        capabilityId: "poll_history",
        data: {
          mode: "history",
          novelMessageIds: deduped.novel,
          dedup: {
            ...deduped.state,
            ...(polled.data.historyId ? { cursor: polled.data.historyId } : {}),
          },
          ...(polled.data.historyId ? { historyId: polled.data.historyId } : {}),
          ...(polled.data.nextPageToken
            ? { nextPageToken: polled.data.nextPageToken }
            : {}),
          onlineOnly: true,
        },
        audit: polled.audit,
      };
    }
    if (polled.code !== "resync_required") {
      return polled;
    }
    // Fall through to full resync with recovered cursor.
    const recovered = recoverConnectorCursor(
      {
        seenIds: input.dedup.seenIds,
        ...(input.startHistoryId ? { cursor: input.startHistoryId } : {}),
      },
      "resync_required",
    );
    const listed = await gmailMessagesSearch(
      {
        q: input.resyncQuery ?? "in:inbox",
        credential: input.credential,
        idempotencyKey: `${input.idempotencyKey}:resync`,
        ...(input.accessToken ? { accessToken: input.accessToken } : {}),
        ...(input.maxResults ? { maxResults: input.maxResults } : {}),
      },
      ctx,
    );
    if (!listed.ok) return listed;
    const deduped = dedupeConnectorIds(
      recovered,
      listed.data.messages.map((m) => m.id),
    );
    return {
      ok: true,
      vendorId: "gmail",
      capabilityId: "messages_search",
      data: {
        mode: "full_resync",
        novelMessageIds: deduped.novel,
        dedup: deduped.state,
        ...(listed.data.nextPageToken
          ? { nextPageToken: listed.data.nextPageToken }
          : {}),
        onlineOnly: true,
      },
      audit: listed.audit,
    };
  }

  // No history cursor — first sync via search + dedupe.
  const listed = await gmailMessagesSearch(
    {
      q: input.resyncQuery ?? "in:inbox",
      credential: input.credential,
      idempotencyKey: `${input.idempotencyKey}:bootstrap`,
      ...(input.accessToken ? { accessToken: input.accessToken } : {}),
      ...(input.maxResults ? { maxResults: input.maxResults } : {}),
    },
    ctx,
  );
  if (!listed.ok) return listed;
  const deduped = dedupeConnectorIds(
    input.dedup,
    listed.data.messages.map((m) => m.id),
  );
  return {
    ok: true,
    vendorId: "gmail",
    capabilityId: "messages_search",
    data: {
      mode: "full_resync",
      novelMessageIds: deduped.novel,
      dedup: deduped.state,
      ...(listed.data.nextPageToken
        ? { nextPageToken: listed.data.nextPageToken }
        : {}),
      onlineOnly: true,
    },
    audit: listed.audit,
  };
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
