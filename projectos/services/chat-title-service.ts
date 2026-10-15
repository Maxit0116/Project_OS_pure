import type { ChatMessage, SessionContextDigest } from "../contracts/chat-session.js";
import { parseSessionContextModelOutput } from "../contracts/chat-session-context.js";
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

const CONTEXT_SYSTEM_PROMPT = `You compress a developer IDE chat into a session context and a short title.
Return JSON only with this shape:
{"title":"","substantive":true,"responsibility":"","decisions":[],"openQuestions":[],"refs":[]}
title: max 60 characters, same language as the user, no surrounding quotes.
substantive: false for greetings, tests, and small talk; true when the conversation has a real task.
responsibility: one sentence describing what this session is responsible for.
decisions: up to 3 short strings already decided.
openQuestions: up to 3 short strings still open.
refs: up to 5 file paths or node names mentioned.
Do not include markdown fences.`;

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

  async summarizeContext(input: ChatTitleModelInput): Promise<{
    title: string;
    substantive: boolean;
    digest: SessionContextDigest | null;
  }> {
    const throughMessageId = [...input.messages].reverse().find((message) => message.id)?.id;
    if (!throughMessageId) {
      throw new ProjectOSError(
        "agent_orchestration_failed",
        "No messages available for chat context",
      );
    }
    const response = await this.gateway.complete(input.profile, {
      projectId: input.projectId,
      requestKind: "chat_title",
      modelPreference: input.profile.id,
      systemPrompt: `${CONTEXT_SYSTEM_PROMPT}\n${responseLanguageInstruction(input.responseLanguage)}`,
      input: { transcript: formatChatTranscript(input.messages) },
      redactionPolicy: "secrets_and_paths",
      maxOutputTokens: 400,
      thinkingDepth: "off",
    });
    const parsed = parseSessionContextModelOutput(response.output, throughMessageId);
    if (!parsed || !parsed.title) {
      throw new ProjectOSError(
        "agent_orchestration_failed",
        "The model returned an unusable chat context",
      );
    }
    return parsed;
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
