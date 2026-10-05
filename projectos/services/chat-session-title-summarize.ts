import type { ChatSessionRecord } from "../contracts/chat-session.js";
import type { ProjectOSSettings } from "../contracts/settings.js";
import { resolveResponseLanguage } from "./agent-language-policy.js";
import { ChatTitleService } from "./chat-title-service.js";
import { shouldUsePresentationFixture } from "./execution-router.js";
import type { SettingsService } from "./settings-service.js";

export interface SummarizeChatSessionTitleDeps {
  chatTitleService: ChatTitleService;
  settingsService: SettingsService;
  settings: ProjectOSSettings;
}

export async function summarizeChatSessionTitleForRecord(
  projectId: string,
  record: ChatSessionRecord,
  deps: SummarizeChatSessionTitleDeps,
): Promise<string | null> {
  const userMessages = record.messages.filter((message) => message.role === "user");
  if (userMessages.length === 0) return null;

  const firstUserText = userMessages[0]?.content ?? "";
  const responseLanguage = resolveResponseLanguage(firstUserText);
  const profile = deps.settingsService.resolveModelProfile(deps.settings);

  let title: string | undefined;
  if (profile && !shouldUsePresentationFixture(deps.settings)) {
    try {
      title = await deps.chatTitleService.summarizeWithModel({
        projectId,
        messages: record.messages,
        profile,
        responseLanguage,
      });
    } catch (error) {
      console.error("[projectos] chat title model summarization failed", error);
    }
  }

  if (!title) {
    try {
      title = deps.chatTitleService.summarizeDeterministic(record.messages);
    } catch {
      return null;
    }
  }

  return title;
}
