import type { ChatSessionRecord } from "../contracts/chat-session.js";
import type { ProjectOSSettings } from "../contracts/settings.js";
import {
  deriveSessionContextDigest,
  isSubstantiveChat,
  type ChatSessionContextUpdate,
} from "../contracts/chat-session-context.js";
import { deriveChatSessionTitle } from "../contracts/chat-session-title.js";
import { resolveResponseLanguage } from "./agent-language-policy.js";
import { ChatTitleService } from "./chat-title-service.js";
import { shouldUsePresentationFixture } from "./execution-router.js";
import type { SettingsService } from "./settings-service.js";

export interface SummarizeChatSessionTitleDeps {
  chatTitleService: ChatTitleService;
  settingsService: SettingsService;
  settings: ProjectOSSettings;
}

export async function summarizeChatSessionContextForRecord(
  projectId: string,
  record: ChatSessionRecord,
  deps: SummarizeChatSessionTitleDeps,
): Promise<ChatSessionContextUpdate | null> {
  const isForkChild = Boolean(record.head.parentSessionId);
  const userMessages = record.messages.filter((message) => message.role === "user");
  if (userMessages.length === 0) {
    // Fresh fork / empty shell: do not demote. Fork children must stay on the
    // Session Graph until the user explicitly removes them.
    if (isForkChild) return null;
    return {
      classification: "misc",
      title: null,
      digest: null,
    };
  }

  const substantive = isSubstantiveChat(record.messages);
  const fallbackTitle = deriveChatSessionTitle(record.messages, "");
  if (!substantive) {
    if (isForkChild) {
      return {
        classification: "topic",
        title: fallbackTitle || null,
        digest: deriveSessionContextDigest(record.messages),
        ...(record.head.responsibility
          ? { responsibility: record.head.responsibility }
          : {}),
      };
    }
    return {
      classification: "misc",
      title: fallbackTitle || null,
      digest: null,
    };
  }

  const firstUserText = userMessages[0]?.content ?? "";
  const responseLanguage = resolveResponseLanguage(firstUserText);
  const profile = deps.settingsService.resolveModelProfile(deps.settings);
  if (profile && !shouldUsePresentationFixture(deps.settings)) {
    try {
      const summarized = await deps.chatTitleService.summarizeContext({
        projectId,
        messages: record.messages,
        profile,
        responseLanguage,
      });
      if (!summarized.substantive || !summarized.digest) {
        if (isForkChild) {
          return {
            classification: "topic",
            title: summarized.title || fallbackTitle || null,
            digest: deriveSessionContextDigest(record.messages),
            ...(record.head.responsibility
              ? { responsibility: record.head.responsibility }
              : {}),
          };
        }
        return {
          classification: "misc",
          title: summarized.title || fallbackTitle || null,
          digest: null,
        };
      }
      return {
        classification: "topic",
        title: summarized.title || fallbackTitle || null,
        responsibility: summarized.digest.responsibility,
        digest: summarized.digest,
      };
    } catch (error) {
      console.error("[projectos] chat context summarization failed", error);
    }
  }

  const digest = deriveSessionContextDigest(record.messages);
  if (!digest) return null;
  return {
    classification: "topic",
    title: fallbackTitle || null,
    responsibility: digest.responsibility,
    digest,
  };
}
