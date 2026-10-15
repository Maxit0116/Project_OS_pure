import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildForkedChatSession } from "../contracts/chat-session-context.js";
import {
  applyAutoChatSessionTitle,
  createEmptyChatSessionRecord,
  deleteChatSession,
  getChatSession,
  getChatSessionIndex,
  listChatSessionHeads,
  renameChatSession,
  setChatSessionArchived,
  setChatSessionPinned,
  upsertChatSession,
} from "./chat-session-service.js";

describe("chat-session-service", () => {
  it("creates, lists, archives, pins, and deletes sessions", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "chat-sessions-"));
    try {
      const record = createEmptyChatSessionRecord({
        title: "First chat",
        messages: [
          {
            id: "m1",
            role: "user",
            content: "Hello",
            timestamp: new Date().toISOString(),
          },
        ],
      });

      upsertChatSession(workspaceRoot, record);
      expect(listChatSessionHeads(workspaceRoot)).toHaveLength(1);

      setChatSessionPinned(workspaceRoot, record.head.id, true);
      expect(getChatSessionIndex(workspaceRoot).pinnedIds).toContain(record.head.id);

      setChatSessionArchived(workspaceRoot, record.head.id, true);
      const archived = getChatSession(workspaceRoot, record.head.id);
      expect(archived?.head.isArchived).toBe(true);

      deleteChatSession(workspaceRoot, record.head.id);
      expect(listChatSessionHeads(workspaceRoot)).toHaveLength(0);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("falls back to empty index for corrupt files", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "chat-sessions-corrupt-"));
    try {
      expect(getChatSessionIndex(workspaceRoot).heads).toEqual([]);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("marks rename as manual and applies auto titles", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "chat-sessions-title-"));
    try {
      const record = createEmptyChatSessionRecord({
        title: "",
        messages: [
          {
            id: "m1",
            role: "user",
            content: "Hello",
            timestamp: new Date().toISOString(),
          },
        ],
      });
      upsertChatSession(workspaceRoot, record);

      const renamed = renameChatSession(workspaceRoot, record.head.id, "Pinned topic");
      expect(renamed?.titleSource).toBe("manual");

      const autoHead = applyAutoChatSessionTitle(
        workspaceRoot,
        record.head.id,
        "Generated title",
      );
      expect(autoHead?.title).toBe("Generated title");
      expect(autoHead?.titleSource).toBe("auto");
      expect(autoHead?.titleGeneratedAt).toBeTruthy();
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("keeps a parent that still has a branch and stores the child without parent messages", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "chat-sessions-branch-"));
    try {
      const parent = createEmptyChatSessionRecord({
        title: "Login",
        messages: [
          {
            id: "m1",
            role: "user",
            content: "Fix the login redirect after callback",
            timestamp: "2026-08-02T00:00:00.000Z",
          },
        ],
      });
      upsertChatSession(workspaceRoot, parent);
      const child = buildForkedChatSession(
        parent,
        {
          responsibility: "Fix the login redirect",
          decisions: [],
          openQuestions: [],
          refs: [],
          updatedAt: "2026-08-02T00:00:00.000Z",
          throughMessageId: "m1",
        },
        "m1",
      );
      upsertChatSession(workspaceRoot, child);

      expect(getChatSession(workspaceRoot, child.head.id)?.messages).toEqual([]);
      expect(getChatSession(workspaceRoot, parent.head.id)?.messages).toHaveLength(1);
      expect(deleteChatSession(workspaceRoot, parent.head.id)).toBe(false);
      expect(listChatSessionHeads(workspaceRoot).map((head) => head.id)).toContain(parent.head.id);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
