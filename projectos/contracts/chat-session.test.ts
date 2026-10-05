import { describe, expect, it } from "vitest";

import {
  ChatSessionHeadSchema,
  ChatSessionRecordSchema,
} from "../contracts/chat-session.js";

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
});
