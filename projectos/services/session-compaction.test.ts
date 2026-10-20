import { describe, expect, it } from "vitest";

import type { ChatSessionRecord } from "../contracts/chat-session.js";
import { prepareSessionSlot } from "./session-compaction.js";

function record(content: string, extra: ChatSessionRecord["messages"] = []): ChatSessionRecord {
  return {
    version: "0.2.0",
    head: {
      id: "chat",
      title: "Chat",
      createdAt: "2026-10-19T00:00:00.000Z",
      lastUpdatedAt: "2026-10-19T00:00:00.000Z",
      chatMode: "ask",
      isArchived: false,
      status: "idle",
    },
    messages: [
      {
        id: "old",
        role: "user",
        content,
        timestamp: "2026-10-19T00:00:00.000Z",
      },
      ...extra,
    ],
  };
}

describe("prepareSessionSlot", () => {
  it("keeps the short-session digest path under the threshold", () => {
    const prepared = prepareSessionSlot(record("决定：用 bun"));
    expect(prepared.changed).toBe(false);
    expect(prepared.markdown).not.toContain("## Session summary");
  });

  it("keeps an explicit decision in the summary and reuses its hash", () => {
    const recent = Array.from({ length: 6 }, (_, index) => ({
      id: `recent-${index}`,
      role: "user" as const,
      content: "still here",
      timestamp: "2026-10-19T00:00:00.000Z",
    }));
    const first = prepareSessionSlot(record(`决定：用 bun\n${"x".repeat(48_000)}`, recent));
    expect(first.markdown).toContain("决定：用 bun");
    expect(first.markdown).toContain("still here");
    expect(first.markdown).toContain("not memory");
    expect(first.changed).toBe(true);
    const again = prepareSessionSlot({
      ...record(`决定：用 bun\n${"x".repeat(48_000)}`, recent),
      compaction: first.compaction!,
    });
    expect(again.changed).toBe(false);
    expect(again.compaction?.hash).toBe(first.compaction?.hash);
    expect(again.markdown).not.toContain("记住");
  });

  it("keeps one line from every older turn", () => {
    const recent = Array.from({ length: 6 }, (_, index) => ({
      id: `recent-${index}`,
      role: "user" as const,
      content: "still here",
      timestamp: "2026-10-19T00:00:00.000Z",
    }));
    const prepared = prepareSessionSlot(record(`${"x".repeat(48_000)}`, [
      {
        id: "note",
        role: "assistant",
        content: "普通说明没有关键词",
        timestamp: "2026-10-19T00:00:00.000Z",
      },
      ...recent,
    ]));
    expect(prepared.markdown).toContain("普通说明没有关键词");
  });

  it("falls back to the transcript tail when compaction throws", () => {
    const recent = Array.from({ length: 6 }, (_, index) => ({
      id: `recent-${index}`,
      role: "user" as const,
      content: "still here",
      timestamp: "2026-10-19T00:00:00.000Z",
    }));
    const prepared = prepareSessionSlot(
      record(`${"y".repeat(48_000)} tail-marker`, recent),
      "2026-10-20T00:00:00.000Z",
      () => {
        throw new Error("summary failed");
      },
    );
    expect(prepared.omissions).toEqual([{ reason: "compaction_failed", count: 1 }]);
    expect(prepared.changed).toBe(false);
    expect(prepared.markdown).toContain("tail-marker");
    expect(prepared.markdown).not.toContain("### Goal");
  });
});
