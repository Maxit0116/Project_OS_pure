import { describe, expect, it } from "vitest";

import type { ChatMessage, ChatSessionHead, ChatSessionRecord } from "./chat-session.js";
import {
  appendSessionContextMarkdown,
  applyChatSessionContextUpdate,
  buildForkedChatSession,
  buildSessionGraph,
  chatSessionHasChildren,
  chatSessionIdsToPrune,
  isSubstantiveChat,
  messagesThroughFork,
  parseSessionContextModelOutput,
  placeChatSessionOnGraph,
  demoteChatSessionToMisc,
  extractSubtreeToNewGraph,
  mergeSessionGraphs,
  collectSessionSubtreeIds,
  summarizeSessionGraphTitle,
  sessionGraphCardInsets,
} from "./chat-session-context.js";

const now = "2026-08-02T00:00:00.000Z";

function message(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return { id, role, content, timestamp: now };
}

function head(partial: Partial<ChatSessionHead> & Pick<ChatSessionHead, "id">): ChatSessionHead {
  return {
    title: partial.title ?? partial.id,
    createdAt: now,
    lastUpdatedAt: partial.lastUpdatedAt ?? now,
    chatMode: "ask",
    isArchived: partial.isArchived ?? false,
    status: "idle",
    ...partial,
  };
}

function record(partial: Partial<ChatSessionRecord> & { head: ChatSessionHead }): ChatSessionRecord {
  return {
    version: "0.2.0",
    messages: partial.messages ?? [],
    ...partial,
  };
}

describe("chat session context", () => {
  it("treats greetings and test pings as misc", () => {
    expect(isSubstantiveChat([message("m1", "user", "hi")])).toBe(false);
    expect(isSubstantiveChat([message("m1", "user", "test")])).toBe(false);
    expect(isSubstantiveChat([message("m1", "user", "你好")])).toBe(false);
    expect(isSubstantiveChat([message("m1", "assistant", "Hello")])).toBe(false);
  });

  it("treats a real task as substantive", () => {
    expect(
      isSubstantiveChat([message("m1", "user", "Fix the login redirect after callback")]),
    ).toBe(true);
    expect(isSubstantiveChat([message("m1", "user", "look at app/login.tsx")])).toBe(true);
  });

  it("promotes a misc session to a root once the transcript is substantive", () => {
    const misc = head({
      id: "chat_hi",
      title: "hi",
      classification: "misc",
      classificationSource: "auto",
    });
    expect(buildSessionGraph([misc]).nodes).toHaveLength(0);
    expect(buildSessionGraph([misc]).misc.map((item) => item.id)).toEqual(["chat_hi"]);

    const promoted = applyChatSessionContextUpdate(
      record({
        head: misc,
        messages: [message("m1", "user", "Fix the login redirect after callback")],
      }),
      {
        classification: "topic",
        title: "Login redirect",
        responsibility: "Fix the login redirect",
        digest: {
          responsibility: "Fix the login redirect",
          decisions: [],
          openQuestions: [],
          refs: [],
          updatedAt: now,
          throughMessageId: "m1",
        },
        now,
      },
    );
    const graph = buildSessionGraph([promoted.head]);
    expect(graph.misc).toHaveLength(0);
    expect(graph.nodes.map((node) => node.id)).toEqual(["chat_hi"]);
    expect(graph.nodes[0]?.parentId).toBeNull();
    expect(promoted.head.title).toBe("Login redirect");
  });

  it("keeps a manual title and a manual misc classification", () => {
    const updated = applyChatSessionContextUpdate(
      record({
        head: head({
          id: "chat_named",
          title: "Pinned topic",
          titleSource: "manual",
          classification: "misc",
          classificationSource: "manual",
        }),
      }),
      {
        classification: "topic",
        title: "Generated title",
        responsibility: "Should stay hidden",
        digest: {
          responsibility: "Should stay hidden",
          decisions: [],
          openQuestions: [],
          refs: [],
          updatedAt: now,
          throughMessageId: "m1",
        },
        now,
      },
    );
    expect(updated.head.title).toBe("Pinned topic");
    expect(updated.head.titleSource).toBe("manual");
    expect(updated.head.classification).toBe("misc");
    expect(updated.contextDigest).toBeUndefined();
  });

  it("builds a tree from branches and leaves archived sessions out", () => {
    const graph = buildSessionGraph([
      head({ id: "root", classification: "topic", responsibility: "Own login" }),
      head({
        id: "child",
        parentSessionId: "root",
        classification: "topic",
      }),
      head({ id: "orphan", parentSessionId: "missing", classification: "topic" }),
      head({ id: "aside", classification: "misc" }),
      head({ id: "old", classification: "topic", isArchived: true }),
    ]);
    expect(graph.edges).toEqual([{ source: "root", target: "child" }]);
    expect(graph.nodes.find((node) => node.id === "orphan")?.parentId).toBeNull();
    expect(graph.misc.map((item) => item.id)).toEqual(["aside"]);
    expect(graph.nodes.map((node) => node.id)).not.toContain("old");
  });

  it("filters the canvas to one graph while keeping misc global", () => {
    const heads = [
      head({ id: "a", classification: "topic", graphId: "g1" }),
      head({ id: "b", classification: "topic", graphId: "g2" }),
      head({ id: "c", classification: "misc" }),
    ];
    const graph = buildSessionGraph(heads, { graphId: "g1" });
    expect(graph.nodes.map((node) => node.id)).toEqual(["a"]);
    expect(graph.misc.map((item) => item.id)).toEqual(["c"]);
  });

  it("places a misc session as an independent root on a new or joined graph", () => {
    const misc = head({
      id: "chat_misc",
      classification: "misc",
      parentSessionId: "someone",
    });
    const asNew = placeChatSessionOnGraph(misc, { mode: "new-graph" });
    expect(asNew.classification).toBe("topic");
    expect(asNew.parentSessionId).toBeUndefined();
    expect(asNew.graphId).toMatch(/^graph_/);

    const joined = placeChatSessionOnGraph(misc, {
      mode: "join-graph",
      graphId: "g_existing",
    });
    expect(joined.graphId).toBe("g_existing");
    expect(joined.parentSessionId).toBeUndefined();

    const demoted = demoteChatSessionToMisc(asNew);
    expect(demoted.classification).toBe("misc");
    expect(demoted.graphId).toBeUndefined();
  });

  it("extracts a node and its whole subtree onto a new graph", () => {
    const heads = [
      head({ id: "root", classification: "topic", graphId: "g1" }),
      head({
        id: "mid",
        parentSessionId: "root",
        classification: "topic",
        graphId: "g1",
      }),
      head({
        id: "leaf",
        parentSessionId: "mid",
        classification: "topic",
        graphId: "g1",
      }),
      head({ id: "other", classification: "topic", graphId: "g1" }),
    ];
    expect(collectSessionSubtreeIds(heads, "mid").sort()).toEqual(["leaf", "mid"]);
    const { heads: next, newGraphId, movedIds } = extractSubtreeToNewGraph(heads, "mid");
    expect(movedIds.sort()).toEqual(["leaf", "mid"]);
    expect(next.find((h) => h.id === "mid")?.graphId).toBe(newGraphId);
    expect(next.find((h) => h.id === "leaf")?.graphId).toBe(newGraphId);
    expect(next.find((h) => h.id === "mid")?.parentSessionId).toBeUndefined();
    expect(next.find((h) => h.id === "leaf")?.parentSessionId).toBe("mid");
    expect(next.find((h) => h.id === "root")?.graphId).toBe("g1");
    expect(next.find((h) => h.id === "other")?.graphId).toBe("g1");
  });

  it("merges every session from one graph into another", () => {
    const heads = [
      head({ id: "a", classification: "topic", graphId: "g1" }),
      head({
        id: "a2",
        parentSessionId: "a",
        classification: "topic",
        graphId: "g1",
      }),
      head({ id: "b", classification: "topic", graphId: "g2" }),
    ];
    const merged = mergeSessionGraphs(heads, "g1", "g2");
    expect(merged.every((h) => h.graphId === "g2" || h.id === "b")).toBe(true);
    expect(merged.find((h) => h.id === "a2")?.parentSessionId).toBe("a");
    expect(summarizeSessionGraphTitle(merged, "g2")).toContain("a");
  });

  it("forks without copying parent messages", () => {
    const parent = record({
      head: head({ id: "parent", classification: "topic" }),
      messages: [
        message("m1", "user", "Fix the login redirect after callback"),
        message("m2", "assistant", "The callback sets the cookie."),
        message("m3", "user", "Also rename the button"),
      ],
      contextDigest: {
        responsibility: "Fix the login redirect",
        decisions: ["Keep the callback"],
        openQuestions: [],
        refs: ["app/login.tsx"],
        updatedAt: now,
        throughMessageId: "m3",
      },
    });
    const slice = messagesThroughFork(parent.messages, "m2");
    expect(slice?.map((item) => item.id)).toEqual(["m1", "m2"]);
    const child = buildForkedChatSession(parent, parent.contextDigest ?? null, "m2", now);
    expect(child.messages).toEqual([]);
    expect(child.head.parentSessionId).toBe("parent");
    expect(child.head.forkMessageId).toBe("m2");
    expect(child.inheritedDigest?.responsibility).toBe("Fix the login redirect");
    expect(parent.messages).toHaveLength(3);
  });

  it("keeps a topic→topic graph edge when branching without a digest", () => {
    const parent = record({
      head: head({
        id: "parent",
        classification: "topic",
        classificationSource: "manual",
        responsibility: "Own login",
      }),
      messages: [],
    });
    const child = buildForkedChatSession(parent, null, undefined, now);
    expect(child.head.classification).toBe("topic");
    expect(child.head.parentSessionId).toBe("parent");
    expect(child.head.responsibility).toBe("Own login");
    const graph = buildSessionGraph([parent.head, child.head]);
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(
      [parent.head.id, child.head.id].sort(),
    );
    expect(graph.edges).toEqual([{ source: "parent", target: child.head.id }]);
    expect(graph.misc).toEqual([]);
  });

  it("keeps misc forks out of the graph until they become substantive", () => {
    const parent = record({
      head: head({ id: "aside", classification: "misc", classificationSource: "auto" }),
      messages: [message("m1", "user", "hi")],
    });
    const child = buildForkedChatSession(parent, null, undefined, now);
    expect(child.head.classification).toBe("misc");
    const graph = buildSessionGraph([parent.head, child.head]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.misc.map((item) => item.id).sort()).toEqual(
      [parent.head.id, child.head.id].sort(),
    );
  });

  it("does not prune a session that still has children", () => {
    const heads = [
      head({ id: "parent", lastUpdatedAt: "2026-08-01T00:00:00.000Z" }),
      head({ id: "child", parentSessionId: "parent", lastUpdatedAt: "2026-08-03T00:00:00.000Z" }),
      head({ id: "old", lastUpdatedAt: "2026-08-02T00:00:00.000Z" }),
    ];
    expect(chatSessionHasChildren(heads, "parent")).toBe(true);
    expect(chatSessionIdsToPrune(heads, [], 2)).toEqual(["old"]);
  });

  it("insets the floating card inside the squeezed center", () => {
    expect(
      sessionGraphCardInsets({
        leftOpen: true,
        rightOpen: true,
        terminalOpen: true,
        leftWidth: 253,
        rightWidth: 380,
        terminalHeight: 320,
      }),
    ).toEqual({ top: 12, right: 392, bottom: 332, left: 265 });
    expect(
      sessionGraphCardInsets({
        leftOpen: false,
        rightOpen: false,
        terminalOpen: false,
        leftWidth: 253,
        rightWidth: 380,
        terminalHeight: 320,
      }),
    ).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
  });

  it("appends inherited and current context with current winning on conflict", () => {
    const markdown = appendSessionContextMarkdown("Project notes", {
      inheritedDigest: {
        responsibility: "Parent duty",
        decisions: [],
        openQuestions: [],
        refs: [],
        updatedAt: now,
        throughMessageId: "m1",
      },
      contextDigest: {
        responsibility: "Child duty",
        decisions: [],
        openQuestions: [],
        refs: [],
        updatedAt: now,
        throughMessageId: "m2",
      },
    });
    expect(markdown).toContain("Project notes");
    expect(markdown).toContain("Parent duty");
    expect(markdown).toContain("Child duty");
    expect(markdown.indexOf("supersedes")).toBeGreaterThan(-1);
  });

  it("parses a model context payload", () => {
    const parsed = parseSessionContextModelOutput(
      '{"title":"Login redirect","substantive":true,"responsibility":"Fix the login redirect","decisions":["Keep callback"],"openQuestions":[],"refs":["app/login.tsx"]}',
      "m2",
      now,
    );
    expect(parsed?.title).toBe("Login redirect");
    expect(parsed?.digest?.refs).toEqual(["app/login.tsx"]);
    expect(parsed?.digest?.throughMessageId).toBe("m2");
  });
});
