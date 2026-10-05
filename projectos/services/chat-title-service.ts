import type { ChatMessage } from "../contracts/chat-session.js";
import {
  CHAT_SESSION_TITLE_MAX,
  deriveChatSessionTitle,
} from "../contracts/chat-session-title.js";
import type { ModelProfile } from "../contracts/settings.js";
import { ProjectOSError } from "../errors.js";
import { ModelGateway } from "./model-gateway/index.js";
import {
  responseLanguageInstruction,
  type ResolvedResponseLanguage,
} from "./agent-language-policy.js";

const TITLE_SYSTEM_PROMPT = `You generate short chat session titles for a developer IDE.
Given a conversation transcript, produce a concise title (max 60 characters) that captures the current topic.
Use the same language as the user's messages.
Return plain text only: no quotes, no markdown, no trailing punctuation unless required.`;

const MAX_TRANSCRIPT_MESSAGES = 20;
const MAX_TRANSCRIPT_CHARS = 2000;

export interface ChatTitleModelInput {
  projectId: string;
  messages: ChatMessage[];
  profile: ModelProfile;
  responseLanguage: ResolvedResponseLanguage;
}

export class ChatTitleService {
  constructor(private readonly gateway: ModelGateway) {}

  async summarizeWithModel(input: ChatTitleModelInput): Promise<string> {
    const response = await this.gateway.complete(input.profile, {
      projectId: input.projectId,
      requestKind: "chat_title",
      modelPreference: input.profile.id,
      systemPrompt: `${TITLE_SYSTEM_PROMPT}\n${responseLanguageInstruction(input.responseLanguage)}`,
      input: { transcript: formatChatTranscript(input.messages) },
      redactionPolicy: "secrets_and_paths",
      maxOutputTokens: 64,
      thinkingDepth: "off",
    });

    const title = sanitizeChatTitle(response.output);
    if (!title) {
      throw new ProjectOSError(
        "agent_orchestration_failed",
        "The model returned an empty chat title",
      );
    }
    return title;
  }

  summarizeDeterministic(messages: ChatMessage[]): string {
    const title = deriveChatSessionTitle(messages, "");
    if (!title) {
      throw new ProjectOSError(
        "agent_orchestration_failed",
        "No user messages available for chat title derivation",
      );
    }
    return title;
  }
}

export function formatChatTranscript(messages: ChatMessage[]): string {
  const recent = messages.slice(-MAX_TRANSCRIPT_MESSAGES);
  let transcript = recent
    .map((message) => `${message.role}: ${message.content.trim()}`)
    .join("\n");
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = transcript.slice(-MAX_TRANSCRIPT_CHARS);
  }
  return transcript;
}

export function sanitizeChatTitle(output: string): string {
  let title = output.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  title = title.replace(/\s+/g, " ");
  if (title.length > CHAT_SESSION_TITLE_MAX) {
    title = `${title.slice(0, CHAT_SESSION_TITLE_MAX - 1)}…`;
  }
  return title;
}
