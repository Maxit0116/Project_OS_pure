/**
 * Gmail phase-1 read-only contracts — loopback transport only; no live mailbox.
 */
import { describe, expect, it } from "vitest";
import {
  createScriptedTransport,
  decodeGmailBase64,
  decodeGmailBase64Bytes,
  decodeGmailMimeTree,
  gmailAttachmentToTaskMaterial,
  gmailMessageBodyToTaskMaterial,
  gmailMessagesGet,
  gmailMessagesSearch,
  gmailMessagesSendBlocked,
  gmailPollHistory,
  gmailUsersWatchRefuse,
  getConnectorVendor,
  htmlToPlaintextPreview,
  listConnectorVendors,
  sanitizeGmailHtml,
  type LoopCredentialRef,
} from "./index.js";

const oauthCred: LoopCredentialRef = {
  vendorId: "gmail",
  credentialId: "cred_gmail_ro",
  scheme: "oauth_token_ref",
  label: "Gmail readonly (redacted)",
};

function b64url(text: string | Buffer): string {
  const buf = typeof text === "string" ? Buffer.from(text, "utf8") : text;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

describe("Gmail catalog honesty", () => {
  it("appends gmail without dropping the original 11 vendors", () => {
    const ids = listConnectorVendors().map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "github",
        "slack",
        "feishu",
        "lark",
        "sentry",
        "linear",
        "jira_cloud",
        "notion",
        "vercel",
        "supabase",
        "posthog",
        "gmail",
      ]),
    );
    const gmail = getConnectorVendor("gmail");
    expect(gmail?.batch).toBe("batch_mail");
    expect(gmail?.implStatus).toBe("implemented_contract");
    expect(gmail?.liveStatus).toBe("unconfigured");
  });
});

describe("Gmail MIME / plaintext preview / TaskMaterial", () => {
  it("decodes MIME and uses plaintext preview — never safe-HTML claims", () => {
    const plain = b64url("Bug in login flow");
    const html = b64url(
      '<p>Bug</p><script>alert(1)</script><img src="https://tracker.example/pixel.gif" alt="x">',
    );
    const decoded = decodeGmailMimeTree({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: plain, size: 10 } },
        { mimeType: "text/html", body: { data: html, size: 40 } },
        {
          mimeType: "application/pdf",
          filename: "stack.pdf",
          body: { attachmentId: "att_1", size: 1200 },
        },
      ],
    });
    expect(decoded.textPlain).toContain("Bug in login");
    expect(decoded.previewText).toContain("Bug");
    expect(decoded.previewText).not.toMatch(/<script|<img|https?:\/\//i);
    expect(decoded.attachments[0]?.attachmentId).toBe("att_1");
    expect(decodeGmailBase64(plain)).toBe("Bug in login flow");
  });

  it("malice vectors do not survive as product HTML (plaintext-only policy)", () => {
    const vectors = [
      '<div style="background:url(https://evil/x)">x</div>',
      '<img srcset="https://evil/a 1x, https://evil/b 2x">',
      '<svg><script>alert(1)</script></svg>',
      '<a href="java&#115;cript:alert(1)">x</a>',
      '<object data="https://evil/o"></object>',
      '<embed src="https://evil/e">',
      '<meta http-equiv="refresh" content="0;url=https://evil">',
      '<iframe src="https://evil/frame"></iframe>',
    ];
    for (const html of vectors) {
      const preview = htmlToPlaintextPreview(html);
      expect(preview).not.toMatch(/<script|<iframe|<object|<embed|<meta|<svg|<img/i);
      expect(sanitizeGmailHtml(html)).toBe(preview);
      // Must not be treated as renderable HTML document.
      expect(preview).not.toMatch(/^\s*</);
    }
  });

  it("measures binary inline attachments without UTF-8 string corruption", () => {
    const binary = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x00]);
    const decoded = decodeGmailMimeTree({
      mimeType: "image/jpeg",
      filename: "shot.jpg",
      body: { data: b64url(binary), size: 8 },
    });
    expect(decoded.attachments[0]?.measuredSizeBytes).toBe(binary.byteLength);
    expect(decodeGmailBase64Bytes(b64url(binary)).equals(binary)).toBe(true);
  });

  it("maps materials with account-scoped ids; refuses size clamp lies", () => {
    const material = gmailAttachmentToTaskMaterial({
      accountRefId: "cred_gmail_ro",
      messageId: "m1",
      threadId: "t1",
      attachmentId: "att_1",
      filename: "stack.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1200,
      measuredSizeBytes: 1200,
      historyId: "99",
    });
    expect(material.id).toContain("cred_gmail_ro");
    expect(material.sizeBytes).toBe(1200);

    const huge = gmailAttachmentToTaskMaterial({
      accountRefId: "cred_gmail_ro",
      messageId: "m1",
      attachmentId: "att_huge",
      filename: "huge.bin",
      mimeType: "application/octet-stream",
      sizeBytes: 60_000_000,
      measuredSizeBytes: 60_000_000,
    });
    expect(huge.parseStatus).toBe("failed");
    expect(huge.sizeBytes).toBeUndefined();
    expect(huge.measuredSizeBytes).toBe(60_000_000);

    const bodyMat = gmailMessageBodyToTaskMaterial({
      accountRefId: "cred_gmail_ro",
      message: {
        id: "m1",
        threadId: "t1",
        payload: {
          headers: [{ name: "Subject", value: "Login bug" }],
        },
      },
      decoded: {
        textPlain: "Full body here",
        textHtmlRaw: "",
        previewText: "Full body here",
        charsetNotes: [],
        partial: false,
        attachments: [],
      },
    });
    expect(bodyMat.textPreview).toBe("Full body here");
    expect(bodyMat.parseStatus).toBe("ok");
  });

  it("refuses promoting snippet-only as body material", () => {
    expect(() =>
      gmailMessageBodyToTaskMaterial({
        accountRefId: "cred_gmail_ro",
        message: { id: "m1", snippet: "preview only" },
        decoded: {
          textPlain: "",
          textHtmlRaw: "",
          previewText: "",
          charsetNotes: [],
          partial: false,
          attachments: [],
        },
      }),
    ).toThrow(/snippet|decoded body/i);
  });
});

describe("Gmail adapter loopback", () => {
  it("search returns IDs only and drops snippet fields", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            messages: [
              { id: "m1", threadId: "t1", snippet: "DO NOT USE AS BODY" },
              { id: "m2", threadId: "t2" },
            ],
            nextPageToken: "p2",
          }),
          durationMs: 1,
        },
      },
    ]);
    const result = await gmailMessagesSearch(
      {
        q: "subject:bug",
        credential: oauthCred,
        idempotencyKey: "gmail-search-1",
        accessToken: "ya29.test",
      },
      { transport: scripted.transport },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.messages).toEqual([
      { id: "m1", threadId: "t1" },
      { id: "m2", threadId: "t2" },
    ]);
    expect(JSON.stringify(result.data)).not.toMatch(/DO NOT USE/);
  });

  it("messages_get decodes full MIME via loopback", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            id: "m1",
            threadId: "t1",
            payload: {
              mimeType: "text/plain",
              body: { data: b64url("Real body"), size: 9 },
            },
          }),
          durationMs: 1,
        },
      },
    ]);
    const result = await gmailMessagesGet(
      {
        messageId: "m1",
        credential: oauthCred,
        idempotencyKey: "gmail-get-1",
        accessToken: "ya29.test",
      },
      { transport: scripted.transport },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.decoded.previewText).toBe("Real body");
  });

  it("pollHistory maps HTTP 404 to resync_required (not parseOk)", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 404,
          headers: {},
          bodyText: JSON.stringify({ error: { message: "history id not found" } }),
          durationMs: 1,
        },
      },
    ]);
    const result = await gmailPollHistory(
      {
        startHistoryId: "1",
        credential: oauthCred,
        idempotencyKey: "poll-404",
        accessToken: "ya29.test",
      },
      { transport: scripted.transport },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("resync_required");
      expect(result.audit.httpStatus).toBe(404);
    }
  });

  it("pollHistory dedupes ids, paginates, and cancels via signal through ctx", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            historyId: "10",
            history: [{ id: "h1" }, { id: "h1" }, { id: "h2" }],
            nextPageToken: "page2",
          }),
          durationMs: 1,
        },
      },
    ]);
    const page1 = await gmailPollHistory(
      {
        startHistoryId: "5",
        credential: oauthCred,
        idempotencyKey: "poll-1",
        accessToken: "ya29.test",
        seenHistoryIds: ["h0"],
      },
      { transport: scripted.transport },
    );
    expect(page1.ok).toBe(true);
    if (!page1.ok) return;
    expect(page1.data.history.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(page1.data.nextPageToken).toBe("page2");
    expect(page1.data.onlineOnly).toBe(true);

    const aborted = new AbortController();
    aborted.abort();
    const cancelled = await gmailPollHistory(
      {
        startHistoryId: "5",
        credential: oauthCred,
        idempotencyKey: "poll-cancel",
        accessToken: "ya29.test",
        signal: aborted.signal,
      },
      { transport: scripted.transport },
    );
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) expect(cancelled.code).toBe("cancelled");
  });

  it("users_watch refuses and send blocks without highRisk flag", async () => {
    const watch = await gmailUsersWatchRefuse(
      { idempotencyKey: "watch-1", credential: oauthCred },
      { transport: createScriptedTransport([]).transport },
    );
    expect(watch.ok).toBe(false);
    if (!watch.ok) expect(watch.code).toBe("unconfigured");

    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({ id: "sent_1" }),
          durationMs: 1,
        },
      },
    ]);
    const blocked = await gmailMessagesSendBlocked(
      {
        raw: "Ym9keQ==",
        credential: oauthCred,
        idempotencyKey: "send-1",
        accessToken: "ya29.test",
      },
      { transport: scripted.transport },
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("high_risk_disabled");
    expect(scripted.requests).toHaveLength(0);
  });
});
