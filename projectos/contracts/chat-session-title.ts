import type { ChatMessage } from "./chat-session.js";

export const CHAT_SESSION_TITLE_MAX = 60;

export function deriveChatSessionTitle(
  messages: ChatMessage[],
  fallback = "",
): string {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser?.content.trim()) return fallback;
  const trimmed = firstUser.content.trim().replace(/\s+/g, " ");
  return trimmed.length <= CHAT_SESSION_TITLE_MAX
    ? trimmed
    : `${trimmed.slice(0, CHAT_SESSION_TITLE_MAX - 1)}…`;
}

export function resolveChatSessionTitleSource(
  titleSource: "auto" | "manual" | undefined,
): "auto" | "manual" {
  return titleSource ?? "auto";
}
