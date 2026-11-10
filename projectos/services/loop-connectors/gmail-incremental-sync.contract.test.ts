import { describe, expect, it } from "vitest";

import { gmailIncrementalSync } from "./adapters/gmail.js";
import { createScriptedTransport } from "./http-transport.js";

const oauthCred = {
  credentialId: "cred_gmail_1",
  vendorId: "gmail" as const,
  kind: "oauth" as const,
};

describe("gmailIncrementalSync (product sync ≠ helper-only)", () => {
  it("history path returns novel message ids with updated dedup cursor", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            historyId: "99",
            history: [
              { id: "h1", messagesAdded: [{ message: { id: "m1" } }] },
              { id: "h2", messagesAdded: [{ message: { id: "m2" } }] },
            ],
          }),
          durationMs: 1,
        },
      },
    ]);
    const result = await gmailIncrementalSync(
      {
        startHistoryId: "10",
        credential: oauthCred,
        idempotencyKey: "inc-1",
        accessToken: "ya29.test",
        dedup: { seenIds: ["m0"], cursor: "10" },
      },
      { transport: scripted.transport },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.mode).toBe("history");
    expect(result.data.novelMessageIds.sort()).toEqual(["m1", "m2"]);
    expect(result.data.dedup.cursor).toBe("99");
    expect(result.data.onlineOnly).toBe(true);
  });

  it("resync_required recovers cursor then full-lists with dedupe (not guidance-only)", async () => {
    const scripted = createScriptedTransport([
      {
        response: {
          status: 404,
          headers: {},
          bodyText: JSON.stringify({ error: { message: "history expired" } }),
          durationMs: 1,
        },
      },
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            messages: [{ id: "m_old" }, { id: "m_new" }],
          }),
          durationMs: 1,
        },
      },
    ]);
    const result = await gmailIncrementalSync(
      {
        startHistoryId: "stale",
        credential: oauthCred,
        idempotencyKey: "inc-resync",
        accessToken: "ya29.test",
        dedup: { seenIds: ["m_old", "m_keep"], cursor: "stale" },
        resyncQuery: "in:inbox",
      },
      { transport: scripted.transport },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.mode).toBe("full_resync");
    expect(result.data.novelMessageIds).toEqual(["m_new"]);
    expect(result.data.dedup.cursor).toBeUndefined();
    expect(result.data.dedup.seenIds).toContain("m_old");
    expect(result.data.dedup.seenIds).toContain("m_new");
  });
});
