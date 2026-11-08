import { describe, expect, it } from "vitest";
import type { ChatSessionRecord } from "./chat-session.js";
import {
  absorbSessionIntoAnchor,
  applyAttachToAnchor,
  buildSessionTidyPlan,
} from "./session-continuity.js";

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
      createdAt: partial.createdAt ?? now,
      lastUpdatedAt: partial.lastUpdatedAt ?? now,
      chatMode: partial.chatMode ?? "ask",
      isArchived: partial.isArchived ?? false,
      status: partial.status ?? "idle",
      classification: partial.classification ?? "topic",
      classificationSource: partial.classificationSource ?? "auto",
      ...(partial.parentSessionId ? { parentSessionId: partial.parentSessionId } : {}),
      ...(partial.responsibility ? { responsibility: partial.responsibility } : {}),
      ...(partial.previewStrip ? { previewStrip: partial.previewStrip } : {}),
      ...(partial.graphId ? { graphId: partial.graphId } : {}),
    },
    messages,
    ...extra,
  };
}

describe("buildSessionTidyPlan", () => {
  it("clusters same-feature sessions and picks a decision-rich anchor", () => {
    const a = record(
      {
        id: "a",
        title: "Payment retry",
        responsibility: "Payment retry hardening",
        lastUpdatedAt: "2026-11-08T10:00:00.000Z",
        graphId: "g1",
        previewStrip: [
          {
            id: "d",
            kind: "decision",
            title: "Retry twice",
            ts: "2026-11-08T10:00:00.000Z",
          },
        ],
      },
      [
        {
          id: "u1",
          role: "user",
          content: "Implement payment retry with exponential backoff in billing.ts",
          timestamp: "2026-11-07T10:00:00.000Z",
        },
        {
          id: "u2",
          role: "user",
          content: "Add metrics for failed charges",
          timestamp: "2026-11-07T11:00:00.000Z",
        },
        {
          id: "u3",
          role: "user",
          content: "Wire dashboard for retry status",
          timestamp: "2026-11-07T12:00:00.000Z",
        },
      ],
      {
        contextDigest: {
          responsibility: "Payment retry hardening",
          decisions: ["Retry twice"],
          openQuestions: [],
          refs: ["billing.ts"],
          updatedAt: "2026-11-08T10:00:00.000Z",
          throughMessageId: "u3",
        },
      },
    );
    const b = record(
      {
        id: "b",
        title: "Retry payments again",
        responsibility: "Payment retry hardening",
        lastUpdatedAt: "2026-11-08T14:00:00.000Z",
        graphId: "g2",
      },
      [
        {
          id: "b1",
          role: "user",
          content: "Continue payment retry work on billing.ts alert threshold",
          timestamp: "2026-11-08T14:00:00.000Z",
        },
      ],
      {
        contextDigest: {
          responsibility: "Payment retry hardening",
          decisions: [],
          openQuestions: [],
          refs: ["billing.ts"],
          updatedAt: "2026-11-08T14:00:00.000Z",
          throughMessageId: "b1",
        },
      },
    );

    const plan = buildSessionTidyPlan([a, b], []);
    expect(plan.clusters).toHaveLength(1);
    expect(plan.clusters[0]?.anchorSessionId).toBe("a");
    expect(plan.clusters[0]?.members.map((m) => m.sessionId).sort()).toEqual(["a", "b"]);
  });

  it("does not cluster already parent-linked sessions", () => {
    const parent = record(
      {
        id: "p",
        title: "Auth",
        responsibility: "OAuth callback",
        graphId: "g",
      },
      [
        {
          id: "p1",
          role: "user",
          content: "Fix OAuth callback in auth.ts",
          timestamp: "2026-11-08T10:00:00.000Z",
        },
      ],
      {
        contextDigest: {
          responsibility: "OAuth callback",
          decisions: ["Keep callback"],
          openQuestions: [],
          refs: ["auth.ts"],
          updatedAt: "2026-11-08T10:00:00.000Z",
          throughMessageId: "p1",
        },
      },
    );
    const child = record(
      {
        id: "c",
        title: "Auth follow-up",
        responsibility: "OAuth callback",
        parentSessionId: "p",
        graphId: "g",
      },
      [
        {
          id: "c1",
          role: "user",
          content: "More OAuth callback work in auth.ts",
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
          throughMessageId: "c1",
        },
      },
    );
    expect(buildSessionTidyPlan([parent, child], []).clusters).toHaveLength(0);
  });
});

describe("absorb and attach", () => {
  it("absorbs unique satellite messages into the anchor", () => {
    const anchor = record({ id: "a", title: "A", graphId: "g" }, [
      { id: "u1", role: "user", content: "one", timestamp: "2026-11-08T10:00:00.000Z" },
    ]);
    const satellite = record({ id: "b", title: "B" }, [
      { id: "u1", role: "user", content: "one", timestamp: "2026-11-08T10:00:00.000Z" },
      { id: "u2", role: "user", content: "two", timestamp: "2026-11-08T11:00:00.000Z" },
      {
        id: "a2",
        role: "assistant",
        content: "ok",
        timestamp: "2026-11-08T11:00:01.000Z",
      },
    ]);
    const merged = absorbSessionIntoAnchor(anchor, satellite);
    const users = merged.messages.filter((m) => m.role === "user").map((m) => m.content);
    expect(users).toEqual(["one", "two"]);
  });

  it("attaches a satellite under the anchor", () => {
    const anchor = record({ id: "a", title: "A", graphId: "graph_x", classification: "topic" });
    const satellite = record({ id: "b", title: "B", classification: "misc" });
    const next = applyAttachToAnchor(satellite, anchor);
    expect(next.head.parentSessionId).toBe("a");
    expect(next.head.graphId).toBe("graph_x");
    expect(next.head.classification).toBe("topic");
  });
});
