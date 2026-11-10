import { describe, expect, it } from "vitest";
import type { ChatSessionRecord } from "./chat-session.js";
import { buildSessionRouteSuggestion } from "./session-route.js";

function record(
  partial: Partial<ChatSessionRecord["head"]> & { id: string },
  messages: ChatSessionRecord["messages"] = [],
  extra: Partial<Pick<ChatSessionRecord, "contextDigest">> = {},
): ChatSessionRecord {
  const now = "2026-11-08T12:00:00.000Z";
  return {
    version: "0.2.0",
    head: {
      id: partial.id,
      title: partial.title ?? partial.id,
      createdAt: now,
      lastUpdatedAt: partial.lastUpdatedAt ?? now,
      chatMode: "ask",
      isArchived: false,
      status: partial.status ?? "idle",
      classification: partial.classification ?? "topic",
      classificationSource: "auto",
      ...(partial.responsibility ? { responsibility: partial.responsibility } : {}),
      ...(partial.previewStrip ? { previewStrip: partial.previewStrip } : {}),
      ...(partial.graphId ? { graphId: partial.graphId } : {}),
    },
    messages,
    ...extra,
  };
}

describe("buildSessionRouteSuggestion", () => {
  const payment = record(
    {
      id: "pay",
      title: "Payment retry",
      responsibility: "Payment retry hardening",
      graphId: "g1",
    },
    [
      {
        id: "u1",
        role: "user",
        content: "Implement payment retry in billing.ts",
        timestamp: "2026-11-08T10:00:00.000Z",
      },
    ],
    {
      contextDigest: {
        responsibility: "Payment retry hardening",
        decisions: ["Retry twice"],
        openQuestions: [],
        refs: ["billing.ts"],
        updatedAt: "2026-11-08T10:00:00.000Z",
        throughMessageId: "u1",
      },
    },
  );

  const auth = record(
    {
      id: "auth",
      title: "OAuth callback",
      responsibility: "OAuth callback",
      graphId: "g2",
    },
    [
      {
        id: "a1",
        role: "user",
        content: "Fix OAuth callback in auth.ts",
        timestamp: "2026-11-08T11:00:00.000Z",
      },
    ],
    {
      contextDigest: {
        responsibility: "OAuth callback",
        decisions: [],
        openQuestions: [],
        refs: ["auth.ts"],
        updatedAt: "2026-11-08T11:00:00.000Z",
        throughMessageId: "a1",
      },
    },
  );

  it("switches to a high-confidence match and marks autoApply", () => {
    const suggestion = buildSessionRouteSuggestion(
      "继续改 payment retry 的 backoff，还是 billing.ts",
      [payment, auth],
      { activeSessionId: "auth" },
    );
    expect(suggestion.action).toBe("switch");
    expect(suggestion.targetSessionId).toBe("pay");
    expect(suggestion.confidence).toBe("high");
    expect(suggestion.autoApply).toBe(true);
  });

  it("stays when the active session is the best match", () => {
    const suggestion = buildSessionRouteSuggestion(
      "继续 payment retry hardening on billing.ts",
      [payment, auth],
      { activeSessionId: "pay" },
    );
    expect(suggestion.action).toBe("stay");
    expect(suggestion.targetSessionId).toBe("pay");
  });

  it("suggests branch when the prompt asks for an alternate approach", () => {
    const suggestion = buildSessionRouteSuggestion(
      "另做一版 payment retry，不要改原来的主线，billing.ts",
      [payment, auth],
      { activeSessionId: "auth" },
    );
    expect(suggestion.action).toBe("branch");
    expect(suggestion.targetSessionId).toBe("pay");
    expect(suggestion.forkMessageId).toBe("u1");
  });

  it("defaults to stay when nothing matches", () => {
    const suggestion = buildSessionRouteSuggestion("hello there", [payment, auth], {
      activeSessionId: "auth",
    });
    expect(suggestion.action).toBe("stay");
    expect(suggestion.targetSessionId).toBe("auth");
    expect(suggestion.confidence).toBe("low");
    expect(suggestion.autoApply).toBe(false);
  });
});
