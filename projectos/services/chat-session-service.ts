import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  CHAT_SESSION_MAX_PINNED,
  ChatSessionHeadSchema,
  ChatSessionIndexSchema,
  ChatSessionRecordSchema,
  type ChatSessionClassification,
  type ChatSessionHead,
  type ChatSessionIndex,
  type ChatSessionRecord,
} from "../contracts/chat-session.js";
import {
  applyChatSessionContextUpdate,
  chatSessionHasChildren,
  chatSessionIdsToPrune,
  demoteChatSessionToMisc,
  placeChatSessionOnGraph,
  preserveChatSessionContext,
  type ChatSessionContextUpdate,
} from "../contracts/chat-session-context.js";

const CHAT_SESSIONS_DIR = join(".projectos", "chat-sessions");
const INDEX_PATH = join(CHAT_SESSIONS_DIR, "index.json");

function sessionFilePath(sessionId: string): string {
  return join(CHAT_SESSIONS_DIR, `${sessionId}.json`);
}

function ensureSessionsDir(workspaceRoot: string): string {
  const dir = join(workspaceRoot, CHAT_SESSIONS_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readIndex(workspaceRoot: string): ChatSessionIndex {
  const indexPath = join(workspaceRoot, INDEX_PATH);
  if (!existsSync(indexPath)) {
    return { version: "0.1.0", pinnedIds: [], heads: [] };
  }
  try {
    return ChatSessionIndexSchema.parse(JSON.parse(readFileSync(indexPath, "utf8")));
  } catch {
    return { version: "0.1.0", pinnedIds: [], heads: [] };
  }
}

function writeIndex(workspaceRoot: string, index: ChatSessionIndex): void {
  ensureSessionsDir(workspaceRoot);
  const parsed = ChatSessionIndexSchema.parse(index);
  writeFileSync(join(workspaceRoot, INDEX_PATH), JSON.stringify(parsed, null, 2), "utf8");
}

function pruneSessions(workspaceRoot: string, index: ChatSessionIndex): ChatSessionIndex {
  const toRemove = chatSessionIdsToPrune(index.heads, index.pinnedIds);

  for (const id of toRemove) {
    const filePath = join(workspaceRoot, sessionFilePath(id));
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  const removeSet = new Set(toRemove);
  return {
    ...index,
    heads: index.heads.filter((head) => !removeSet.has(head.id)),
    pinnedIds: index.pinnedIds.filter((id) => !removeSet.has(id)),
    lastActiveId:
      index.lastActiveId && !removeSet.has(index.lastActiveId)
        ? index.lastActiveId
        : undefined,
  };
}

function upsertHeadInIndex(
  index: ChatSessionIndex,
  head: ChatSessionHead,
  workspaceRoot: string,
): ChatSessionIndex {
  const parsed = ChatSessionHeadSchema.parse(head);
  const heads = index.heads.filter((item) => item.id !== parsed.id);
  const next: ChatSessionIndex = {
    ...index,
    heads: [parsed, ...heads].sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt)),
  };
  return pruneSessions(workspaceRoot, next);
}

export function listChatSessionHeads(workspaceRoot: string): ChatSessionHead[] {
  const index = readIndex(workspaceRoot);
  return [...index.heads].sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt));
}

export function getChatSessionIndex(workspaceRoot: string): ChatSessionIndex {
  return readIndex(workspaceRoot);
}

export function getChatSession(
  workspaceRoot: string,
  sessionId: string,
): ChatSessionRecord | null {
  const filePath = join(workspaceRoot, sessionFilePath(sessionId));
  if (!existsSync(filePath)) return null;
  try {
    return ChatSessionRecordSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

export function upsertChatSession(
  workspaceRoot: string,
  record: ChatSessionRecord,
): ChatSessionRecord {
  const parsed = preserveChatSessionContext(
    getChatSession(workspaceRoot, record.head.id),
    ChatSessionRecordSchema.parse(record),
  );
  ensureSessionsDir(workspaceRoot);
  writeFileSync(
    join(workspaceRoot, sessionFilePath(parsed.head.id)),
    JSON.stringify(parsed, null, 2),
    "utf8",
  );

  let index = readIndex(workspaceRoot);
  index = upsertHeadInIndex(index, parsed.head, workspaceRoot);
  if (index.lastActiveId === parsed.head.id || !index.lastActiveId) {
    index = { ...index, lastActiveId: parsed.head.id };
  }
  writeIndex(workspaceRoot, index);
  return parsed;
}

export function setChatSessionArchived(
  workspaceRoot: string,
  sessionId: string,
  archived: boolean,
): ChatSessionHead | null {
  const record = getChatSession(workspaceRoot, sessionId);
  if (!record) return null;

  const nextHead = ChatSessionHeadSchema.parse({
    ...record.head,
    isArchived: archived,
    lastUpdatedAt: new Date().toISOString(),
  });
  upsertChatSession(workspaceRoot, { ...record, head: nextHead });

  let index = readIndex(workspaceRoot);
  if (archived) {
    index = {
      ...index,
      pinnedIds: index.pinnedIds.filter((id) => id !== sessionId),
    };
    writeIndex(workspaceRoot, index);
  }
  return nextHead;
}

export function setChatSessionPinned(
  workspaceRoot: string,
  sessionId: string,
  pinned: boolean,
): ChatSessionIndex {
  let index = readIndex(workspaceRoot);
  const head = index.heads.find((item) => item.id === sessionId);
  if (!head) return index;

  if (pinned) {
    if (!index.pinnedIds.includes(sessionId)) {
      const nextPinned = [sessionId, ...index.pinnedIds].slice(0, CHAT_SESSION_MAX_PINNED);
      index = { ...index, pinnedIds: nextPinned };
    }
  } else {
    index = { ...index, pinnedIds: index.pinnedIds.filter((id) => id !== sessionId) };
  }
  writeIndex(workspaceRoot, index);
  return index;
}

export function renameChatSession(
  workspaceRoot: string,
  sessionId: string,
  title: string,
): ChatSessionHead | null {
  const record = getChatSession(workspaceRoot, sessionId);
  if (!record) return null;
  const trimmed = title.trim();
  if (!trimmed) return null;

  const nextHead = ChatSessionHeadSchema.parse({
    ...record.head,
    title: trimmed,
    titleSource: "manual",
    lastUpdatedAt: new Date().toISOString(),
  });
  upsertChatSession(workspaceRoot, { ...record, head: nextHead });
  return nextHead;
}

export function applyAutoChatSessionTitle(
  workspaceRoot: string,
  sessionId: string,
  title: string,
): ChatSessionHead | null {
  const record = getChatSession(workspaceRoot, sessionId);
  if (!record) return null;
  const trimmed = title.trim();
  if (!trimmed) return null;

  const now = new Date().toISOString();
  const nextHead = ChatSessionHeadSchema.parse({
    ...record.head,
    title: trimmed,
    titleSource: "auto",
    titleGeneratedAt: now,
    lastUpdatedAt: now,
  });
  upsertChatSession(workspaceRoot, { ...record, head: nextHead });
  return nextHead;
}

export function deleteChatSession(workspaceRoot: string, sessionId: string): boolean {
  const indexBefore = readIndex(workspaceRoot);
  if (chatSessionHasChildren(indexBefore.heads, sessionId)) return false;

  const filePath = join(workspaceRoot, sessionFilePath(sessionId));
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }

  let index = readIndex(workspaceRoot);
  const existed = index.heads.some((head) => head.id === sessionId);
  index = {
    ...index,
    heads: index.heads.filter((head) => head.id !== sessionId),
    pinnedIds: index.pinnedIds.filter((id) => id !== sessionId),
    lastActiveId: index.lastActiveId === sessionId ? undefined : index.lastActiveId,
  };
  writeIndex(workspaceRoot, index);
  return existed;
}

export function saveChatSessionContext(
  workspaceRoot: string,
  sessionId: string,
  update: ChatSessionContextUpdate,
): ChatSessionHead | null {
  const record = getChatSession(workspaceRoot, sessionId);
  if (!record) return null;
  const next = ChatSessionRecordSchema.parse(applyChatSessionContextUpdate(record, update));
  upsertChatSession(workspaceRoot, next);
  return next.head;
}

export function setChatSessionClassification(
  workspaceRoot: string,
  sessionId: string,
  classification: ChatSessionClassification,
): ChatSessionHead | null {
  const record = getChatSession(workspaceRoot, sessionId);
  if (!record) return null;
  const nextHead =
    classification === "misc"
      ? demoteChatSessionToMisc(record.head)
      : placeChatSessionOnGraph(record.head, { mode: "new-graph" });
  const parsedHead = ChatSessionHeadSchema.parse(nextHead);
  upsertChatSession(workspaceRoot, { ...record, head: parsedHead });
  return parsedHead;
}

export function setLastActiveChatSession(
  workspaceRoot: string,
  sessionId: string,
): void {
  const index = readIndex(workspaceRoot);
  if (!index.heads.some((head) => head.id === sessionId)) return;
  writeIndex(workspaceRoot, { ...index, lastActiveId: sessionId });
}

export function createEmptyChatSessionRecord(
  input: Partial<Pick<ChatSessionHead, "title" | "chatMode" | "status">> & {
    messages?: ChatSessionRecord["messages"];
    draftInput?: string;
    snapshot?: ChatSessionRecord["snapshot"];
  } = {},
): ChatSessionRecord {
  const now = new Date().toISOString();
  const id = `chat_${randomUUID()}`;
  return ChatSessionRecordSchema.parse({
    version: "0.1.0",
    head: {
      id,
      title: input.title ?? "",
      createdAt: now,
      lastUpdatedAt: now,
      chatMode: input.chatMode ?? "ask",
      isArchived: false,
      status: input.status ?? "idle",
    },
    messages: input.messages ?? [],
    ...(input.draftInput !== undefined ? { draftInput: input.draftInput } : {}),
    ...(input.snapshot ? { snapshot: input.snapshot } : {}),
  });
}
