import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createMemoryDedupeStore,
  createScriptedTransport,
  feishuLarkCustomBotNotify,
  feishuLarkSendMessage,
  listBatch1Vendors,
  listConnectorVendors,
  redactHeaders,
  sentryListIssues,
  slackChatPostMessage,
  slackIncomingWebhookNotify,
  summarizeRequest,
  verifyFeishuLarkCardAction,
  verifySlackInteraction,
  verifySentryWebhook,
  type LoopCredentialRef,
} from "./index.js";

const botCred: LoopCredentialRef = {
  vendorId: "slack",
  credentialId: "cred_slack_bot",
  scheme: "bot_token_ref",
  label: "Slack bot (redacted)",
};

const webhookCred: LoopCredentialRef = {
  vendorId: "slack",
  credentialId: "cred_slack_hook",
  scheme: "webhook_url_ref",
  label: "Slack incoming webhook (redacted)",
};

describe("loop-connectors catalog honesty", () => {
  it("lists full product scope with Feishu≠Lark and batch statuses", () => {
    const all = listConnectorVendors();
    const ids = all.map((item) => item.id);
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
      ]),
    );
    expect(all.find((item) => item.id === "feishu")?.displayName).toMatch(/Feishu/i);
    expect(all.find((item) => item.id === "lark")?.displayName).toBe("Lark");
    expect(all.find((item) => item.id === "feishu")?.apiDocsUrl).toContain("feishu.cn");
    expect(all.find((item) => item.id === "lark")?.apiDocsUrl).toContain("larksuite.com");
    const batch1 = listBatch1Vendors().map((item) => item.id);
    expect(batch1).toEqual(
      expect.arrayContaining(["github", "slack", "feishu", "lark", "sentry"]),
    );
    expect(all.find((item) => item.id === "linear")?.implStatus).toBe("catalog_only");
    expect(all.find((item) => item.id === "vercel")?.highRiskDefaultOff).toBe(true);
    expect(all.find((item) => item.id === "supabase")?.highRiskDefaultOff).toBe(true);
  });
});

describe("Slack adapter contracts", () => {
  it("posts via Web API with credential ref + redacted audit", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({ ok: true, ts: "1.2", channel: "C1" }),
          durationMs: 12,
        },
      },
    ]);
    const result = await slackChatPostMessage(
      {
        channel: "C1",
        text: "hello",
        credential: botCred,
        idempotencyKey: "idem-slack-1",
        accessToken: "xoxb-secret-token",
      },
      { transport: scripted.transport },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.ts).toBe("1.2");
    expect(scripted.requests[0]?.url).toContain("chat.postMessage");
    expect(scripted.requests[0]?.headers.Authorization).toContain("xoxb-");
    expect(result.audit.requestSummary).not.toContain("xoxb-secret-token");
    expect(result.audit.requestSummary).toContain("[redacted]");
    expect(result.audit.credentialRefId).toBe("cred_slack_bot");
  });

  it("rejects Incoming Webhook credential for chat.postMessage (notify≠approval/API)", async () => {
    const scripted = createScriptedTransport([]);
    const result = await slackChatPostMessage(
      {
        channel: "C1",
        text: "x",
        credential: webhookCred,
        idempotencyKey: "idem-slack-2",
      },
      { transport: scripted.transport },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("notify_only");
    expect(scripted.requests).toHaveLength(0);
  });

  it("Incoming Webhook notify path is separate capability", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: "ok",
          durationMs: 5,
        },
      },
    ]);
    const result = await slackIncomingWebhookNotify(
      {
        text: "notify",
        credential: webhookCred,
        idempotencyKey: "idem-hook-1",
        webhookUrl: "https://hooks.slack.test/services/T/B/X",
      },
      { transport: scripted.transport },
    );
    expect(result.ok).toBe(true);
    expect(scripted.requests[0]?.capabilityId).toBe("incoming_webhook_notify");
  });

  it("rejects local_declared for Slack interactive approval", () => {
    const secret = "signing-secret";
    const ts = Math.floor(Date.now() / 1000);
    const body = "payload=%7B%7D";
    const sig =
      "v0=" +
      createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex");
    const dedupe = createMemoryDedupeStore();
    const rejected = verifySlackInteraction({
      rawBody: body,
      signatureHeader: sig,
      timestampSec: ts,
      signingSecret: secret,
      dedupe,
      eventId: "Evt1",
      actorAttestation: "local_declared",
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe("auth_rejected");

    const ok = verifySlackInteraction({
      rawBody: body,
      signatureHeader: sig,
      timestampSec: ts,
      signingSecret: secret,
      dedupe,
      eventId: "Evt2",
      actorAttestation: "external_signed",
    });
    expect(ok.ok).toBe(true);

    const replay = verifySlackInteraction({
      rawBody: body,
      signatureHeader: sig,
      timestampSec: ts,
      signingSecret: secret,
      dedupe,
      eventId: "Evt2",
      actorAttestation: "external_signed",
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.code).toBe("replay_detected");
  });
});

describe("Feishu / Lark adapters", () => {
  it("uses distinct API hosts and refuses webhook creds for IM OpenAPI", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({ code: 0, data: { message_id: "om_f" } }),
          durationMs: 8,
        },
      },
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({ code: 0, data: { message_id: "om_l" } }),
          durationMs: 8,
        },
      },
    ]);
    const feishuCred: LoopCredentialRef = {
      vendorId: "feishu",
      credentialId: "cred_feishu",
      scheme: "bot_token_ref",
      label: "Feishu",
    };
    const larkCred: LoopCredentialRef = {
      vendorId: "lark",
      credentialId: "cred_lark",
      scheme: "bot_token_ref",
      label: "Lark",
    };
    const feishu = await feishuLarkSendMessage(
      "feishu",
      {
        receiveId: "oc_1",
        text: "hi",
        credential: feishuCred,
        idempotencyKey: "idem-f-1",
        tenantAccessToken: "t-feishu",
      },
      { transport: scripted.transport },
    );
    const lark = await feishuLarkSendMessage(
      "lark",
      {
        receiveId: "oc_2",
        text: "hi",
        credential: larkCred,
        idempotencyKey: "idem-l-1",
        tenantAccessToken: "t-lark",
      },
      { transport: scripted.transport },
    );
    expect(feishu.ok && lark.ok).toBe(true);
    expect(scripted.requests[0]?.url).toContain("open.feishu.cn");
    expect(scripted.requests[1]?.url).toContain("open.larksuite.com");

    const blocked = await feishuLarkSendMessage(
      "feishu",
      {
        receiveId: "oc_1",
        text: "x",
        credential: {
          vendorId: "feishu",
          credentialId: "hook",
          scheme: "webhook_url_ref",
          label: "bot",
        },
        idempotencyKey: "idem-f-2",
      },
      { transport: scripted.transport },
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("notify_only");
  });

  it("custom bot notify is notify-only capability; card action rejects local_declared", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: "{}",
          durationMs: 3,
        },
      },
    ]);
    const notify = await feishuLarkCustomBotNotify(
      "feishu",
      {
        text: "ping",
        credential: {
          vendorId: "feishu",
          credentialId: "fb",
          scheme: "webhook_url_ref",
          label: "feishu bot",
        },
        idempotencyKey: "idem-fb",
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/x",
      },
      { transport: scripted.transport },
    );
    expect(notify.ok).toBe(true);

    const body = '{"action":"approve"}';
    const secret = "feishu-secret";
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const dedupe = createMemoryDedupeStore();
    const rejected = verifyFeishuLarkCardAction({
      vendorId: "lark",
      rawBody: body,
      signatureHeader: sig,
      signingSecret: secret,
      dedupe,
      eventId: "card-1",
      actorAttestation: "local_declared",
    });
    expect(rejected.ok).toBe(false);
  });
});

describe("Sentry adapter + HTTP resilience", () => {
  it("lists issues via GET and maps auth errors", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify([{ id: "1" }, { id: "2" }]),
          durationMs: 10,
        },
      },
      {
        response: {
          status: 401,
          headers: {},
          bodyText: "nope",
          durationMs: 4,
        },
      },
    ]);
    const cred: LoopCredentialRef = {
      vendorId: "sentry",
      credentialId: "cred_sentry",
      scheme: "api_key_ref",
      label: "Sentry",
    };
    const ok = await sentryListIssues(
      {
        organizationSlug: "acme",
        projectSlug: "app",
        credential: cred,
        idempotencyKey: "s1",
        apiToken: "sntrys_x",
      },
      { transport: scripted.transport },
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.issueIds).toEqual(["1", "2"]);

    const denied = await sentryListIssues(
      {
        organizationSlug: "acme",
        projectSlug: "app",
        credential: cred,
        idempotencyKey: "s2",
        apiToken: "bad",
      },
      { transport: scripted.transport },
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("auth_rejected");
  });

  it("retries 429 then succeeds; timeout on POST yields unknown_outcome without blind resend", async () => {
    const { executeConnectorHttp } = await import("./http-transport.js");
    const rate = createScriptedTransport([
      {
        response: {
          status: 429,
          headers: { "retry-after": "0" },
          bodyText: "",
          durationMs: 1,
        },
      },
      {
        response: {
          status: 200,
          headers: {},
          bodyText: "ok",
          durationMs: 1,
        },
      },
    ]);
    const rateOutcome = await executeConnectorHttp(
      {
        vendorId: "slack",
        capabilityId: "incoming_webhook_notify",
        method: "POST",
        url: "https://hooks.example/x",
        headers: {},
        body: "{}",
        idempotencyKey: "r1",
        timeoutMs: 1000,
      },
      { transport: rate.transport, sleep: async () => undefined },
    );
    expect(rateOutcome.kind).toBe("response");
    expect(rate.requests).toHaveLength(2);

    const timed = createScriptedTransport([{ error: new Error("timeout") }]);
    const unknown = await executeConnectorHttp(
      {
        vendorId: "slack",
        capabilityId: "chat_postMessage",
        method: "POST",
        url: "https://slack.com/api/chat.postMessage",
        headers: {},
        body: "{}",
        idempotencyKey: "t1",
        timeoutMs: 1000,
      },
      { transport: timed.transport, sleep: async () => undefined },
    );
    expect(unknown.kind).toBe("error");
    if (unknown.kind === "error") {
      expect(unknown.code).toBe("unknown_outcome");
      expect(unknown.unknownOutcome).toBe(true);
    }
    expect(timed.requests).toHaveLength(1);
  });

  it("honors cancel via AbortSignal", async () => {
    const { executeConnectorHttp } = await import("./http-transport.js");
    const controller = new AbortController();
    controller.abort();
    const scripted = createScriptedTransport([]);
    const outcome = await executeConnectorHttp(
      {
        vendorId: "sentry",
        capabilityId: "list_issues",
        method: "GET",
        url: "https://sentry.io/api/0/x",
        headers: {},
        idempotencyKey: "c1",
        timeoutMs: 1000,
      },
      { transport: scripted.transport, signal: controller.signal },
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") expect(outcome.code).toBe("cancelled");
  });

  it("verifies Sentry webhook HMAC and dedupes", () => {
    const body = '{"action":"created"}';
    const secret = "sentry-secret";
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const dedupe = createMemoryDedupeStore();
    expect(
      verifySentryWebhook({
        rawBody: body,
        signatureHeader: sig,
        signingSecret: secret,
        dedupe,
        eventId: "sev-1",
      }).ok,
    ).toBe(true);
    expect(
      verifySentryWebhook({
        rawBody: body,
        signatureHeader: sig,
        signingSecret: secret,
        dedupe,
        eventId: "sev-1",
      }).ok,
    ).toBe(false);
  });
});

describe("audit redaction helpers", () => {
  it("redacts authorization headers in summaries", () => {
    expect(
      redactHeaders({ Authorization: "Bearer secret", "X-Id": "1" }),
    ).toEqual({ Authorization: "[redacted]", "X-Id": "1" });
    expect(
      summarizeRequest({
        vendorId: "slack",
        capabilityId: "chat_postMessage",
        method: "POST",
        url: "https://slack.com/api/chat.postMessage",
        headers: { Authorization: "Bearer secret" },
        idempotencyKey: "x",
        timeoutMs: 1,
        credentialRefId: "cred",
      }),
    ).not.toContain("Bearer secret");
  });
});
