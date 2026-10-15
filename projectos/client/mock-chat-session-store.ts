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
  preserveChatSessionContext,
  type ChatSessionContextUpdate,
} from "../contracts/chat-session-context.js";
import { cloneJson } from "../utils/json.js";

interface ProjectChatSessions {
  index: ChatSessionIndex;
  records: Map<string, ChatSessionRecord>;
}

const sessionsByProject = new Map<string, ProjectChatSessions>();

function getProjectStore(projectId: string): ProjectChatSessions {
  let store = sessionsByProject.get(projectId);
  if (!store) {
    store = {
      index: { version: "0.1.0", pinnedIds: [], heads: [] },
      records: new Map(),
    };
    sessionsByProject.set(projectId, store);
  }
  return store;
}

function pruneIndex(index: ChatSessionIndex): ChatSessionIndex {
  const remove = new Set(chatSessionIdsToPrune(index.heads, index.pinnedIds));
  if (remove.size === 0) return index;
  return {
    ...index,
    heads: index.heads.filter((head) => !remove.has(head.id)),
    pinnedIds: index.pinnedIds.filter((id) => !remove.has(id)),
    lastActiveId:
      index.lastActiveId && !remove.has(index.lastActiveId)
        ? index.lastActiveId
        : undefined,
  };
}

export function mockListChatSessionHeads(projectId: string): ChatSessionHead[] {
  const { index } = getProjectStore(projectId);
  return [...index.heads].sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt));
}

export function mockGetChatSessionIndex(projectId: string): ChatSessionIndex {
  return cloneJson(getProjectStore(projectId).index);
}

export function mockGetChatSession(
  projectId: string,
  sessionId: string,
): ChatSessionRecord | null {
  const record = getProjectStore(projectId).records.get(sessionId);
  return record ? cloneJson(record) : null;
}

export function mockUpsertChatSession(
  projectId: string,
  record: ChatSessionRecord,
): ChatSessionRecord {
  const store = getProjectStore(projectId);
  const parsed = preserveChatSessionContext(
    store.records.get(record.head.id) ?? null,
    ChatSessionRecordSchema.parse(record),
  );
  store.records.set(parsed.head.id, cloneJson(parsed));
  const heads = store.index.heads.filter((head) => head.id !== parsed.head.id);
  store.index = pruneIndex({
    ...store.index,
    heads: [ChatSessionHeadSchema.parse(parsed.head), ...heads].sort((a, b) =>
      b.lastUpdatedAt.localeCompare(a.lastUpdatedAt),
    ),
    lastActiveId: store.index.lastActiveId ?? parsed.head.id,
  });
  return cloneJson(parsed);
}

export function mockSetChatSessionArchived(
  projectId: string,
  sessionId: string,
  archived: boolean,
): ChatSessionHead | null {
  const store = getProjectStore(projectId);
  const record = store.records.get(sessionId);
  if (!record) return null;
  const nextHead = ChatSessionHeadSchema.parse({
    ...record.head,
    isArchived: archived,
    lastUpdatedAt: new Date().toISOString(),
  });
  store.records.set(sessionId, { ...record, head: nextHead });
  store.index = {
    ...store.index,
    heads: store.index.heads.map((head) => (head.id === sessionId ? nextHead : head)),
    pinnedIds: archived
      ? store.index.pinnedIds.filter((id) => id !== sessionId)
      : store.index.pinnedIds,
  };
  return cloneJson(nextHead);
}

export function mockSetChatSessionPinned(
  projectId: string,
  sessionId: string,
  pinned: boolean,
): ChatSessionIndex {
  const store = getProjectStore(projectId);
  if (!store.index.heads.some((head) => head.id === sessionId)) {
    return cloneJson(store.index);
  }
  if (pinned) {
    const nextPinned = [sessionId, ...store.index.pinnedIds.filter((id) => id !== sessionId)].slice(
      0,
      CHAT_SESSION_MAX_PINNED,
    );
    store.index = { ...store.index, pinnedIds: nextPinned };
  } else {
    store.index = {
      ...store.index,
      pinnedIds: store.index.pinnedIds.filter((id) => id !== sessionId),
    };
  }
  return cloneJson(ChatSessionIndexSchema.parse(store.index));
}

export function mockRenameChatSession(
  projectId: string,
  sessionId: string,
  title: string,
): ChatSessionHead | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const store = getProjectStore(projectId);
  const record = store.records.get(sessionId);
  if (!record) return null;
  const nextHead = ChatSessionHeadSchema.parse({
    ...record.head,
    title: trimmed,
    titleSource: "manual",
    lastUpdatedAt: new Date().toISOString(),
  });
  store.records.set(sessionId, { ...record, head: nextHead });
  store.index = {
    ...store.index,
    heads: store.index.heads.map((head) => (head.id === sessionId ? nextHead : head)),
  };
  return cloneJson(nextHead);
}

export function mockApplyAutoChatSessionTitle(
  projectId: string,
  sessionId: string,
  title: string,
): ChatSessionHead | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const store = getProjectStore(projectId);
  const record = store.records.get(sessionId);
  if (!record) return null;

  const now = new Date().toISOString();
  const nextHead = ChatSessionHeadSchema.parse({
    ...record.head,
    title: trimmed,
    titleSource: "auto",
    titleGeneratedAt: now,
    lastUpdatedAt: now,
  });
  store.records.set(sessionId, { ...record, head: nextHead });
  store.index = {
    ...store.index,
    heads: store.index.heads.map((head) => (head.id === sessionId ? nextHead : head)),
  };
  return cloneJson(nextHead);
}

export function mockSaveChatSessionContext(
  projectId: string,
  sessionId: string,
  update: ChatSessionContextUpdate,
): ChatSessionHead | null {
  const store = getProjectStore(projectId);
  const record = store.records.get(sessionId);
  if (!record) return null;
  const next = ChatSessionRecordSchema.parse(applyChatSessionContextUpdate(record, update));
  store.records.set(sessionId, cloneJson(next));
  store.index = {
    ...store.index,
    heads: store.index.heads.map((head) => (head.id === sessionId ? next.head : head)),
  };
  return cloneJson(next.head);
}

export function mockSetChatSessionClassification(
  projectId: string,
  sessionId: string,
  classification: ChatSessionClassification,
): ChatSessionHead | null {
  const store = getProjectStore(projectId);
  const record = store.records.get(sessionId);
  if (!record) return null;
  const nextHead: ChatSessionHead = {
    ...record.head,
    classification,
    classificationSource: "manual",
    lastUpdatedAt: new Date().toISOString(),
  };
  if (classification === "misc") delete nextHead.responsibility;
  const parsedHead = ChatSessionHeadSchema.parse(nextHead);
  store.records.set(sessionId, { ...record, head: parsedHead });
  store.index = {
    ...store.index,
    heads: store.index.heads.map((head) => (head.id === sessionId ? parsedHead : head)),
  };
  return cloneJson(parsedHead);
}

export function mockDeleteChatSession(projectId: string, sessionId: string): boolean {
  const store = getProjectStore(projectId);
  if (chatSessionHasChildren(store.index.heads, sessionId)) return false;
  const existed = store.records.delete(sessionId) || store.index.heads.some((h) => h.id === sessionId);
  store.index = {
    ...store.index,
    heads: store.index.heads.filter((head) => head.id !== sessionId),
    pinnedIds: store.index.pinnedIds.filter((id) => id !== sessionId),
    lastActiveId: store.index.lastActiveId === sessionId ? undefined : store.index.lastActiveId,
  };
  return existed;
}

export function mockSetLastActiveChatSession(projectId: string, sessionId: string): void {
  const store = getProjectStore(projectId);
  if (!store.index.heads.some((head) => head.id === sessionId)) return;
  store.index = { ...store.index, lastActiveId: sessionId };
}

export function mockClearChatSessions(projectId: string): void {
  sessionsByProject.delete(projectId);
}
