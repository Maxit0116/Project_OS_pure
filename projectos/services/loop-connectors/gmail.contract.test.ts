/**
 * Gmail phase-1 read-only contracts — loopback transport only; no live mailbox.
 */
import { describe, expect, it } from "vitest";
import {
  createScriptedTransport,
  decodeGmailBase64,
  decodeGmailMimeTree,
  gmailAttachmentToTaskMaterial,
  gmailMessageBodyToTaskMaterial,
  gmailMessagesGet,
  gmailMessagesSearch,
  gmailMessagesSendBlocked,
  gmailUsersWatchRefuse,
  getConnectorVendor,
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

function b64url(text: string): string {
  return Buffer.from(text, "utf8")
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
    expect(gmail?.capabilities.some((c) => c.id === "messages_search")).toBe(true);
    expect(gmail?.capabilities.find((c) => c.id === "messages_send")?.risk).toBe(
      "write_high",
    );
  });
});

describe("Gmail MIME / HTML / TaskMaterial", () => {
  it("recursively decodes plain+html and strips script/tracking", () => {
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
    expect(decoded.textHtmlSafe).not.toMatch(/<script/i);
    expect(decoded.textHtmlSafe).toContain("data-tracking-blocked");
    expect(decoded.attachments[0]?.attachmentId).toBe("att_1");
    expect(decodeGmailBase64(plain)).toBe("Bug in login flow");
    expect(sanitizeGmailHtml('<a href="javascript:alert(1)">x</a>')).not.toMatch(
      /javascript:/i,
    );
  });

  it("maps attachment + message body to TaskMaterial with gmail provenance", () => {
    const material = gmailAttachmentToTaskMaterial({
      accountRefId: "cred_gmail_ro",
      messageId: "m1",
      threadId: "t1",
      attachmentId: "att_1",
      filename: "stack.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1200,
      historyId: "99",
    });
    expect(material.source).toBe("gmail");
    expect(material.gmail?.accountRefId).toBe("cred_gmail_ro");
    expect(material.gmail?.attachmentId).toBe("att_1");
    expect(material.runOverride).toBe(true);

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
        textHtmlSafe: "",
        attachments: [],
      },
    });
    expect(bodyMat.kind).toBe("text");
    expect(bodyMat.title).toContain("Login bug");
  });

  it("refuses promoting snippet-only as body material", () => {
    expect(() =>
      gmailMessageBodyToTaskMaterial({
        accountRefId: "cred_gmail_ro",
        message: { id: "m1", snippet: "preview only" },
        decoded: {
          textPlain: "",
          textHtmlRaw: "",
          textHtmlSafe: "",
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
    expect(result.data.nextPageToken).toBe("p2");
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
    expect(result.data.decoded.textPlain).toBe("Real body");
  });

  it("users_watch refuses (no Pub/Sub deploy) and send blocks without highRisk flag", async () => {
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
        // omit highRiskAuthorized
      },
      { transport: scripted.transport },
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("high_risk_disabled");
    expect(scripted.requests).toHaveLength(0);
  });
});
