import { describe, expect, it } from "vitest";

import type { ChatMessage, ChatSessionHead } from "./chat-session.js";
import {
  EMPTY_SESSION_VALID_MS,
  composerDraftHasContent,
  isDeferredEmptySessionShell,
  isUnusedForkChildSession,
  orderSessionIdsForDeletion,
  shouldDisposeEmptySession,
} from "./chat-session-empty.js";

const now = "2026-11-02T00:00:00.000Z";
const nowMs = Date.parse(now);

function message(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return { id, role, content, timestamp: now };
}

function head(partial: Partial<ChatSessionHead> & Pick<ChatSessionHead, "id">): ChatSessionHead {
  return {
    title: partial.title ?? partial.id,
    createdAt: partial.createdAt ?? now,
    lastUpdatedAt: partial.lastUpdatedAt ?? now,
    chatMode: "ask",
    isArchived: false,
    status: partial.status ?? "idle",
    ...partial,
  };
}

describe("chat-session-empty", () => {
  it("keeps sessions that have a user message", () => {
    expect(
      shouldDisposeEmptySession({
        head: head({ id: "a", classification: "misc", classificationSource: "auto" }),
        messages: [message("m1", "user", "hello")],
        heads: [head({ id: "a" })],
        pinnedIds: [],
        nowMs,
      }),
    ).toBe(false);
  });

  it("keeps welcome-only sessions that still have draft content", () => {
    expect(composerDraftHasContent({ text: "  note  ", attachments: [] })).toBe(true);
    expect(
      shouldDisposeEmptySession({
        head: head({ id: "a", classification: "misc", classificationSource: "auto" }),
        messages: [message("m1", "assistant", "Welcome")],
        draft: { text: "draft", attachments: [] },
        heads: [head({ id: "a" })],
        pinnedIds: [],
        nowMs,
      }),
    ).toBe(false);
  });

  it("deletes plain empty misc immediately", () => {
    expect(
      shouldDisposeEmptySession({
        head: head({ id: "a", classification: "misc", classificationSource: "auto" }),
        messages: [message("m1", "assistant", "Welcome")],
        draft: { text: "", attachments: [] },
        heads: [head({ id: "a" })],
        pinnedIds: [],
        nowMs,
      }),
    ).toBe(true);
  });

  it("defers fork / pinned / manual graph shells until valid time elapses", () => {
    const freshFork = head({
      id: "child",
      parentSessionId: "parent",
      createdAt: now,
      classification: "misc",
      classificationSource: "auto",
    });
    expect(isDeferredEmptySessionShell(freshFork, [])).toBe(true);
    expect(
      shouldDisposeEmptySession({
        head: freshFork,
        messages: [],
        heads: [head({ id: "parent" }), freshFork],
        pinnedIds: [],
        nowMs,
      }),
    ).toBe(false);

    expect(
      shouldDisposeEmptySession({
        head: freshFork,
        messages: [],
        heads: [head({ id: "parent" }), freshFork],
        pinnedIds: [],
        nowMs: nowMs + EMPTY_SESSION_VALID_MS,
      }),
    ).toBe(true);

    const pinned = head({
      id: "pin",
      classification: "misc",
      classificationSource: "auto",
    });
    expect(
      shouldDisposeEmptySession({
        head: pinned,
        messages: [],
        heads: [pinned],
        pinnedIds: ["pin"],
        nowMs,
      }),
    ).toBe(false);
    expect(
      shouldDisposeEmptySession({
        head: pinned,
        messages: [],
        heads: [pinned],
        pinnedIds: ["pin"],
        nowMs: nowMs + EMPTY_SESSION_VALID_MS,
      }),
    ).toBe(true);

    const manual = head({
      id: "g",
      classification: "topic",
      classificationSource: "manual",
      graphId: "graph_1",
    });
    expect(
      shouldDisposeEmptySession({
        head: manual,
        messages: [],
        heads: [manual],
        pinnedIds: [],
        nowMs,
      }),
    ).toBe(false);
    expect(
      shouldDisposeEmptySession({
        head: manual,
        messages: [],
        heads: [manual],
        pinnedIds: [],
        nowMs: nowMs + EMPTY_SESSION_VALID_MS,
      }),
    ).toBe(true);
  });

  it("does not delete running sessions or parents with children", () => {
    expect(
      shouldDisposeEmptySession({
        head: head({
          id: "a",
          status: "running",
          classification: "misc",
          classificationSource: "auto",
        }),
        messages: [],
        heads: [head({ id: "a" })],
        pinnedIds: [],
        nowMs,
      }),
    ).toBe(false);

    expect(
      shouldDisposeEmptySession({
        head: head({ id: "parent", classification: "misc", classificationSource: "auto" }),
        messages: [],
        heads: [
          head({ id: "parent" }),
          head({ id: "child", parentSessionId: "parent" }),
        ],
        pinnedIds: [],
        nowMs,
      }),
    ).toBe(false);
  });

  it("orders deletions so children go before parents", () => {
    expect(
      orderSessionIdsForDeletion(
        ["parent", "child"],
        [
          head({ id: "parent" }),
          head({ id: "child", parentSessionId: "parent" }),
        ],
      ),
    ).toEqual(["child", "parent"]);
  });

  it("detects unused fork children that never continued with a prompt", () => {
    const unused = head({ id: "child", parentSessionId: "parent" });
    expect(
      isUnusedForkChildSession({
        head: unused,
        messages: [],
        draft: { text: "", attachments: [] },
      }),
    ).toBe(true);

    expect(
      isUnusedForkChildSession({
        head: unused,
        messages: [message("u1", "user", "keep going")],
      }),
    ).toBe(false);

    expect(
      isUnusedForkChildSession({
        head: unused,
        messages: [],
        draft: { text: "typed but not sent", attachments: [] },
      }),
    ).toBe(false);

    expect(
      isUnusedForkChildSession({
        head: head({ id: "root" }),
        messages: [],
      }),
    ).toBe(false);

    expect(
      isUnusedForkChildSession({
        head: head({
          id: "child",
          parentSessionId: "parent",
          status: "awaiting_review",
        }),
        messages: [],
      }),
    ).toBe(false);
  });
});

describe("a conversation waiting on the person", () => {
  it("is not empty, though it has no message yet", () => {
    // An Agent conversation keeps an unanswered intent card (S8); leaving it must not delete it.
    const head: ChatSessionHead = {
      id: "chat_waiting",
      title: "New",
      createdAt: "2026-07-17T00:00:00.000Z",
      lastUpdatedAt: "2026-07-17T00:00:00.000Z",
      chatMode: "change",
      isArchived: false,
      status: "awaiting_review",
    };
    expect(shouldDisposeEmptySession({ head, messages: [], heads: [head], pinnedIds: [] })).toBe(false);
    expect(shouldDisposeEmptySession({ head: { ...head, status: "idle" }, messages: [], heads: [head], pinnedIds: [] })).toBe(true);
  });
});
