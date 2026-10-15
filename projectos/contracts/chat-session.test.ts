import { describe, expect, it } from "vitest";

import {
  ChatSessionHeadSchema,
  ChatSessionRecordSchema,
} from "../contracts/chat-session.js";
import { preserveChatSessionContext } from "../contracts/chat-session-context.js";

describe("chat-session contracts", () => {
  it("parses a minimal session record", () => {
    const record = ChatSessionRecordSchema.parse({
      version: "0.1.0",
      head: {
        id: "chat_1",
        title: "Hello",
        createdAt: "2026-08-02T00:00:00.000Z",
        lastUpdatedAt: "2026-08-02T00:00:00.000Z",
        chatMode: "plan",
        isArchived: false,
        status: "idle",
      },
      messages: [],
      snapshot: {
        agentFlowSubject: "plan",
        hasPendingPlan: false,
      },
    });
    expect(ChatSessionHeadSchema.parse(record.head).chatMode).toBe("plan");
  });

  it("parses debug mode sessions", () => {
    const record = ChatSessionRecordSchema.parse({
      version: "0.1.0",
      head: {
        id: "chat_debug",
        title: "Debug",
        createdAt: "2026-08-02T00:00:00.000Z",
        lastUpdatedAt: "2026-08-02T00:00:00.000Z",
        chatMode: "debug",
        isArchived: false,
        status: "running",
      },
      messages: [],
      snapshot: {
        agentFlowSubject: "debug",
      },
    });
    expect(record.head.chatMode).toBe("debug");
  });

  it("parses lineage, classification, and digests", () => {
    const record = ChatSessionRecordSchema.parse({
      version: "0.2.0",
      head: {
        id: "chat_child",
        title: "Login branch",
        createdAt: "2026-08-02T00:00:00.000Z",
        lastUpdatedAt: "2026-08-02T00:00:00.000Z",
        chatMode: "ask",
        isArchived: false,
        status: "idle",
        parentSessionId: "chat_parent",
        forkMessageId: "msg_2",
        classification: "topic",
        classificationSource: "auto",
        responsibility: "Own the login redirect fix",
      },
      messages: [],
      inheritedDigest: {
        responsibility: "Own the login redirect fix",
        decisions: ["Keep the callback route"],
        openQuestions: ["Which cookie name?"],
        refs: ["app/login.tsx"],
        updatedAt: "2026-08-02T00:00:00.000Z",
        throughMessageId: "msg_2",
      },
    });
    expect(record.head.parentSessionId).toBe("chat_parent");
    expect(record.inheritedDigest?.refs).toEqual(["app/login.tsx"]);
  });

  it("keeps digest fields when a later save omits them", () => {
    const existing = ChatSessionRecordSchema.parse({
      version: "0.2.0",
      head: {
        id: "chat_1",
        title: "Login redirect",
        titleSource: "auto",
        createdAt: "2026-08-02T00:00:00.000Z",
        lastUpdatedAt: "2026-08-02T00:00:00.000Z",
        chatMode: "ask",
        isArchived: false,
        status: "idle",
        classification: "topic",
        responsibility: "Fix the login redirect",
        parentSessionId: "chat_parent",
      },
      messages: [],
      contextDigest: {
        responsibility: "Fix the login redirect",
        decisions: [],
        openQuestions: [],
        refs: [],
        updatedAt: "2026-08-02T00:00:00.000Z",
        throughMessageId: "msg_1",
      },
      inheritedDigest: {
        responsibility: "Parent topic",
        decisions: [],
        openQuestions: [],
        refs: [],
        updatedAt: "2026-08-02T00:00:00.000Z",
        throughMessageId: "msg_0",
      },
    });
    const incoming = ChatSessionRecordSchema.parse({
      version: "0.2.0",
      head: {
        id: "chat_1",
        title: "",
        createdAt: existing.head.createdAt,
        lastUpdatedAt: "2026-08-02T00:01:00.000Z",
        chatMode: "ask",
        isArchived: false,
        status: "idle",
      },
      messages: [
        {
          id: "msg_1",
          role: "user",
          content: "Fix the login redirect",
          timestamp: "2026-08-02T00:01:00.000Z",
        },
      ],
    });
    const merged = preserveChatSessionContext(existing, incoming);
    expect(merged.head.title).toBe("Login redirect");
    expect(merged.head.classification).toBe("topic");
    expect(merged.head.parentSessionId).toBe("chat_parent");
    expect(merged.contextDigest?.throughMessageId).toBe("msg_1");
    expect(merged.inheritedDigest?.responsibility).toBe("Parent topic");
    expect(merged.messages).toHaveLength(1);
  });
});
