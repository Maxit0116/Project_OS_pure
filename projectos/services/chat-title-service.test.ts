import { describe, expect, it } from "vitest";

import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
} from "../contracts/model-gateway.js";
import type { ModelProfile } from "../contracts/settings.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import type { ResolvedResponseLanguage } from "./agent-language-policy.js";
import {
  ChatTitleService,
  formatChatTranscript,
  sanitizeChatTitle,
} from "./chat-title-service.js";
import { ModelGateway } from "./model-gateway/index.js";

const profile: ModelProfile = {
  id: "title-model",
  name: "Title model",
  provider: "openai",
  model: "test-model",
  apiKeyRef: "title-key",
  isDefault: true,
};

const responseLanguage: ResolvedResponseLanguage = {
  tag: "en",
  source: "detected",
  expectedScripts: ["latin"],
};

describe("chat-title-service", () => {
  it("sanitizes quoted model output", () => {
    expect(sanitizeChatTitle('"Login redirect fix"')).toBe("Login redirect fix");
  });

  it("summarizes with model gateway", async () => {
    const service = new ChatTitleService(new StubGateway("Billing module refactor"));
    const title = await service.summarizeWithModel({
      projectId: "project-test",
      messages: [
        {
          id: "m1",
          role: "user",
          content: "Help me refactor the billing module",
          timestamp: "2026-08-02T00:00:00.000Z",
        },
      ],
      profile,
      responseLanguage,
    });
    expect(title).toBe("Billing module refactor");
  });

  it("falls back to first user message deterministically", () => {
    const service = new ChatTitleService(new StubGateway(""));
    const title = service.summarizeDeterministic([
      {
        id: "m1",
        role: "assistant",
        content: "Welcome",
        timestamp: "2026-08-02T00:00:00.000Z",
      },
      {
        id: "m2",
        role: "user",
        content: "Explain the login flow",
        timestamp: "2026-08-02T00:00:01.000Z",
      },
    ]);
    expect(title).toBe("Explain the login flow");
  });

  it("formats transcript from recent messages", () => {
    const transcript = formatChatTranscript([
      {
        id: "m1",
        role: "user",
        content: "First",
        timestamp: "2026-08-02T00:00:00.000Z",
      },
      {
        id: "m2",
        role: "assistant",
        content: "Second",
        timestamp: "2026-08-02T00:00:01.000Z",
      },
    ]);
    expect(transcript).toBe("user: First\nassistant: Second");
  });
});

class StubGateway extends ModelGateway {
  constructor(private readonly output: string) {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    _profile: ModelProfile,
    _request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    return {
      requestId: "request-title",
      provider: "test",
      model: "test-model",
      output: this.output,
      usage: { inputTokens: 5, outputTokens: 5 },
      latencyMs: 1,
    };
  }
}
