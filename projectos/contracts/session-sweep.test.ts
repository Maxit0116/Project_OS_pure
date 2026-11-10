import { describe, expect, it } from "vitest";
import type { ChatSessionRecord } from "./chat-session.js";
import {
  buildSessionPromptHistory,
  buildSessionSweepPlan,
  classifyLowValueSession,
  resolveSessionSweepExecution,
  shouldHardDeleteInsteadOfMisc,
} from "./session-sweep.js";

function record(
  partial: Partial<ChatSessionRecord["head"]> & { id: string },
  messages: ChatSessionRecord["messages"] = [],
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
      classification: partial.classification ?? "misc",
      classificationSource: partial.classificationSource ?? "auto",
      ...(partial.parentSessionId ? { parentSessionId: partial.parentSessionId } : {}),
      ...(partial.responsibility ? { responsibility: partial.responsibility } : {}),
      ...(partial.previewStrip ? { previewStrip: partial.previewStrip } : {}),
      ...(partial.graphId ? { graphId: partial.graphId } : {}),
    },
    messages,
  };
}

describe("shouldHardDeleteInsteadOfMisc", () => {
  it("hard-deletes unused fork children and low-value sessions", () => {
    expect(
      shouldHardDeleteInsteadOfMisc(
        record({ id: "empty", classification: "topic", parentSessionId: "p", graphId: "g1" }),
      ),
    ).toBe(true);
    expect(
      shouldHardDeleteInsteadOfMisc(
        record(
          { id: "hi", classification: "topic", parentSessionId: "p", graphId: "g1" },
          [{ id: "m1", role: "user", content: "hi", timestamp: "2026-11-08T12:00:00.000Z" }],
        ),
      ),
    ).toBe(true);
  });

  it("keeps substantive sessions for Misc demotion", () => {
    expect(
      shouldHardDeleteInsteadOfMisc(
        {
          ...record(
            {
              id: "rich",
              classification: "topic",
              parentSessionId: "p",
              graphId: "g1",
              responsibility: "Auth callback hardening",
              previewStrip: [
                {
                  id: "d1",
                  kind: "decision",
                  title: "Keep the callback",
                  ts: "2026-11-08T12:00:00.000Z",
                },
              ],
            },
            [
              {
                id: "u1",
                role: "user",
                content: "Implement OAuth callback retry and cover the failure path in auth.ts",
                timestamp: "2026-11-08T12:00:00.000Z",
              },
              {
                id: "u2",
                role: "user",
                content: "Also add integration coverage for the refresh token rotation",
                timestamp: "2026-11-08T13:00:00.000Z",
              },
              {
                id: "u3",
                role: "user",
                content: "Document the edge case in README for the team",
                timestamp: "2026-11-08T14:00:00.000Z",
              },
            ],
          ),
          contextDigest: {
            responsibility: "Auth callback hardening",
            decisions: ["Keep the callback"],
            openQuestions: [],
            refs: ["auth.ts"],
            updatedAt: "2026-11-08T14:00:00.000Z",
            throughMessageId: "u3",
          },
        },
      ),
    ).toBe(false);
  });

  it("does not hard-delete running sessions", () => {
    expect(
      shouldHardDeleteInsteadOfMisc(
        record({ id: "run", classification: "topic", status: "running", parentSessionId: "p" }),
      ),
    ).toBe(false);
  });
});

describe("classifyLowValueSession", () => {
  it("flags misc greetings", () => {
    const reasons = classifyLowValueSession(
      record(
        { id: "a", classification: "misc" },
        [{ id: "m1", role: "user", content: "hi", timestamp: "2026-11-08T12:00:00.000Z" }],
      ),
    );
    expect(reasons).toContain("misc");
    expect(reasons).toContain("trivial");
  });

  it("keeps substantive topics with decisions out of the set", () => {
    const reasons = classifyLowValueSession(
      {
        ...record(
          {
            id: "b",
            classification: "topic",
            responsibility: "Auth callback hardening",
            previewStrip: [
              {
                id: "d1",
                kind: "decision",
                title: "Keep the callback",
                ts: "2026-11-08T12:00:00.000Z",
              },
            ],
          },
          [
            {
              id: "u1",
              role: "user",
              content: "Implement OAuth callback retry and cover the failure path in auth.ts",
              timestamp: "2026-11-08T12:00:00.000Z",
            },
            {
              id: "u2",
              role: "user",
              content: "Also add integration coverage for the refresh token rotation",
              timestamp: "2026-11-08T13:00:00.000Z",
            },
            {
              id: "u3",
              role: "user",
              content: "Document the edge case in README for the team",
              timestamp: "2026-11-08T14:00:00.000Z",
            },
          ],
        ),
        contextDigest: {
          responsibility: "Auth callback hardening",
          decisions: ["Keep the callback"],
          openQuestions: [],
          refs: ["auth.ts"],
          updatedAt: "2026-11-08T14:00:00.000Z",
          throughMessageId: "u3",
        },
      },
    );
    expect(reasons).toEqual([]);
  });
});

describe("buildSessionSweepPlan", () => {
  it("marks parents with retained children as reorganize", () => {
    const parent = record(
      { id: "parent", classification: "misc", title: "Parent junk" },
      [{ id: "p1", role: "user", content: "test", timestamp: "2026-11-08T12:00:00.000Z" }],
    );
    const junkChild = record(
      {
        id: "junk",
        classification: "misc",
        title: "Junk child",
        parentSessionId: "parent",
      },
      [{ id: "j1", role: "user", content: "hi", timestamp: "2026-11-08T12:01:00.000Z" }],
    );
    const keepChild: ChatSessionRecord = {
      ...record(
        {
          id: "keep",
          classification: "topic",
          title: "Keep me",
          parentSessionId: "parent",
          responsibility: "Payment retry",
          previewStrip: [
            {
              id: "d",
              kind: "decision",
              title: "Retry twice",
              ts: "2026-11-08T12:02:00.000Z",
            },
          ],
        },
        [
          {
            id: "k1",
            role: "user",
            content: "Implement payment retry with exponential backoff in billing.ts",
            timestamp: "2026-11-08T12:02:00.000Z",
          },
          {
            id: "k2",
            role: "user",
            content: "Add metrics for failed charges and alert threshold",
            timestamp: "2026-11-08T13:02:00.000Z",
          },
          {
            id: "k3",
            role: "user",
            content: "Wire the dashboard card for retry status",
            timestamp: "2026-11-08T14:02:00.000Z",
          },
        ],
      ),
      contextDigest: {
        responsibility: "Payment retry",
        decisions: ["Retry twice"],
        openQuestions: [],
        refs: ["billing.ts"],
        updatedAt: "2026-11-08T14:02:00.000Z",
        throughMessageId: "k3",
      },
    };

    const plan = buildSessionSweepPlan([parent, junkChild, keepChild], []);
    const parentCandidate = plan.candidates.find((item) => item.sessionId === "parent");
    expect(parentCandidate?.action).toBe("reorganize");
    expect(parentCandidate?.retainedChildIds).toEqual(["keep"]);
    expect(plan.candidates.some((item) => item.sessionId === "junk")).toBe(true);
    expect(plan.candidates.some((item) => item.sessionId === "keep")).toBe(false);
  });

  it("plans delete for a pure low-value subtree", () => {
    const parent = record(
      { id: "p", classification: "misc" },
      [{ id: "a", role: "user", content: "hi", timestamp: "2026-11-08T12:00:00.000Z" }],
    );
    const child = record(
      { id: "c", classification: "misc", parentSessionId: "p" },
      [{ id: "b", role: "user", content: "test", timestamp: "2026-11-08T12:01:00.000Z" }],
    );
    const plan = buildSessionSweepPlan([parent, child], []);
    const parentCandidate = plan.candidates.find((item) => item.sessionId === "p");
    expect(parentCandidate?.action).toBe("delete");
    const execution = resolveSessionSweepExecution(plan, ["p"], [parent.head, child.head]);
    expect(execution.deleteIds).toEqual(["c", "p"]);
    expect(execution.reparent).toEqual([]);
  });
});

describe("buildSessionPromptHistory", () => {
  it("pairs user prompts with a one-line assistant summary", () => {
    const rows = buildSessionPromptHistory([
      { id: "u1", role: "user", content: "How does auth work?", timestamp: "2026-11-08T12:00:00.000Z" },
      {
        id: "a1",
        role: "assistant",
        content: "Auth uses OAuth.\nMore detail here.",
        timestamp: "2026-11-08T12:00:01.000Z",
      },
      { id: "u2", role: "user", content: "Show the callback", timestamp: "2026-11-08T12:01:00.000Z" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.assistantSummary).toBe("Auth uses OAuth.");
    expect(rows[0]?.assistantContent).toBe("Auth uses OAuth.\nMore detail here.");
    expect(rows[1]?.assistantSummary).toBeNull();
    expect(rows[1]?.assistantContent).toBeNull();
  });
});
