/**
 * Batch3 Supabase/PostHog — loopback contract; no live project.
 */
import { describe, expect, it } from "vitest";
import {
  posthogCaptureEvent,
  posthogQueryInsights,
  supabaseReadRows,
  supabaseWriteRows,
} from "./adapters/batch3.js";
import { createScriptedTransport } from "./http-transport.js";
import { settleConnectorOperation } from "./settle-connector.js";
import type { LoopCredentialRef } from "./types.js";
import type { LoopGraphDocument } from "../../contracts/loop-graph.js";

const supabaseCred: LoopCredentialRef = {
  vendorId: "supabase",
  credentialId: "cred_sb",
  scheme: "api_key_ref",
  label: "Supabase (redacted)",
};

const posthogCred: LoopCredentialRef = {
  vendorId: "posthog",
  credentialId: "cred_ph",
  scheme: "api_key_ref",
  label: "PostHog (redacted)",
};

describe("Batch3 adapters loopback", () => {
  it("supabase read_rows constructs GET via loopback transport", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify([{ id: 1, name: "a" }]),
          durationMs: 2,
        },
      },
    ]);
    const got = await supabaseReadRows(
      {
        projectUrl: "https://example.supabase.co",
        table: "items",
        credential: supabaseCred,
        idempotencyKey: "sb-read-1",
        accessToken: "sb_secret",
        limit: 10,
      },
      { transport: scripted.transport },
    );
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.data.rows).toEqual([{ id: 1, name: "a" }]);
    expect(scripted.requests[0]?.url).toContain("/rest/v1/items");
    expect(scripted.requests[0]?.method).toBe("GET");
  });

  it("supabase write_rows sealed without highRiskAuthorized", async () => {
    const scripted = createScriptedTransport([]);
    const blocked = await supabaseWriteRows(
      {
        projectUrl: "https://example.supabase.co",
        table: "items",
        rows: [{ id: 1 }],
        credential: supabaseCred,
        idempotencyKey: "sb-write-1",
        accessToken: "sb_secret",
      },
      { transport: scripted.transport },
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("high_risk_disabled");
    expect(scripted.requests).toHaveLength(0);
  });

  it("posthog query_insights + capture_event via loopback", async () => {
    const insights = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({ result: [1, 2] }),
          durationMs: 2,
        },
      },
    ]);
    const queried = await posthogQueryInsights(
      {
        host: "https://app.posthog.com",
        projectId: "proj_1",
        insightId: "ins_1",
        credential: posthogCred,
        idempotencyKey: "ph-q-1",
        accessToken: "ph_secret",
      },
      { transport: insights.transport },
    );
    expect(queried.ok).toBe(true);
    expect(insights.requests[0]?.url).toContain("/insights/ins_1/");

    const capture = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: "{}",
          durationMs: 1,
        },
      },
    ]);
    const captured = await posthogCaptureEvent(
      {
        host: "https://app.posthog.com",
        event: "loop_test",
        distinctId: "user_1",
        credential: posthogCred,
        idempotencyKey: "ph-c-1",
        accessToken: "ph_secret",
      },
      { transport: capture.transport },
    );
    expect(captured.ok).toBe(true);
    expect(capture.requests[0]?.url).toContain("/capture/");
  });

  it("settle product path runs supabase read_rows", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify([{ ok: true }]),
          durationMs: 1,
        },
      },
    ]);
    let doc: LoopGraphDocument = {
      id: "loop_b3",
      title: "Batch3",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      draft: { revision: 1, graphPrompt: "", nodes: [], edges: [] },
      approvedSpecs: [],
      instances: [
        {
          id: "inst_1",
          specVersion: "v1",
          status: "running",
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          round: 0,
          attemptCounts: {},
          events: [],
        },
      ],
    };
    const settled = await settleConnectorOperation(
      {
        nodeId: "n_sb",
        vendorId: "supabase",
        capabilityId: "read_rows",
        payload: {
          projectUrl: "https://example.supabase.co",
          table: "t",
        },
        credentialRefId: "cred_sb",
        idempotencyKey: "settle-sb-1",
        queuedAt: new Date().toISOString(),
      },
      {
        loadDocument: () => doc,
        saveDocument: (next) => {
          doc = next;
          return next;
        },
        instanceId: "inst_1",
        ctx: { transport: scripted.transport },
        resolveSecret: () => "sb_secret",
      },
    );
    expect(settled.result.ok).toBe(true);
  });
});
