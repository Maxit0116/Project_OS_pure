import { describe, expect, it } from "vitest";

import { InMemorySecretStore } from "../persistence/secret-store.js";
import type { ModelGatewayRequest } from "../contracts/model-gateway.js";
import type { LocalContextBundle } from "../contracts/local-context.js";
import type { ModelProfile } from "../contracts/settings.js";
import {
  resolveResponseLanguage,
  validateGrossLanguageMatch,
} from "./agent-language-policy.js";
import { GroundedAnswerService } from "./grounded-answer-service.js";
import { ModelGateway } from "./model-gateway/index.js";

describe("agent response language policy", () => {
  it("detects high-confidence scripts without treating Latin as English", () => {
    expect(resolveResponseLanguage("请解释这个文件的作用")).toMatchObject({
      tag: "zh",
      source: "detected",
    });
    expect(resolveResponseLanguage("Explain cómo funciona this file")).toEqual({
      tag: "und",
      source: "undetermined",
      expectedScripts: [],
    });
  });

  it("respects and canonicalizes a BCP-47 override", () => {
    expect(resolveResponseLanguage("Explain this", {
      mode: "override",
      tag: "zh-hant",
    })).toMatchObject({ tag: "zh-Hant", source: "override" });
  });

  it("ignores technical segments during gross mismatch validation", () => {
    const language = resolveResponseLanguage("请解释这个文件");
    expect(validateGrossLanguageMatch(
      "这个函数负责认证。`authenticateUser()` returns Promise<User>.",
      language,
    )).toBe("passed");
  });

  it("does not claim a language match from Latin script alone", () => {
    const spanish = resolveResponseLanguage("Explain this", {
      mode: "override",
      tag: "es",
    });

    expect(validateGrossLanguageMatch(
      "This answer is English, not Spanish.",
      spanish,
    )).toBe("not_checkable");
  });

  it("retries once on a gross mismatch and accepts the corrected language", async () => {
    const gateway = new QueuedGateway([
      "This response is entirely in the wrong language.",
      "这个回答现在使用正确的语言。",
    ]);
    const service = new GroundedAnswerService(gateway);
    const result = await service.answer(answerInput());

    expect(result).toEqual({
      answer: "这个回答现在使用正确的语言。",
      validation: "retry_passed",
    });
    expect(gateway.requests).toHaveLength(2);
  });

  it("returns the retry answer when one retry remains a gross mismatch", async () => {
    const gateway = new QueuedGateway([
      "This response is entirely in the wrong language.",
      "This second response is still in the wrong language.",
    ]);
    const service = new GroundedAnswerService(gateway);

    await expect(service.answer(answerInput())).resolves.toEqual({
      answer: "This second response is still in the wrong language.",
      validation: "mismatch_after_retry",
    });
    expect(gateway.requests).toHaveLength(2);
  });

  it("recognizes mixed-script answers as a coarse mismatch without discarding them", async () => {
    const language = resolveResponseLanguage("strawberry里面有几个r");
    expect(validateGrossLanguageMatch(
      "strawberry 里面有 3 个 r。",
      language,
    )).toBe("mismatch");

    const gateway = new QueuedGateway([
      "There are three r's.",
      "strawberry 里面有 3 个 r。",
    ]);
    await expect(new GroundedAnswerService(gateway).answer({
      ...answerInput(),
      question: "strawberry里面有几个r",
      responseLanguage: language,
    })).resolves.toMatchObject({
      answer: "strawberry 里面有 3 个 r。",
      validation: "mismatch_after_retry",
    });
  });
});

const profile: ModelProfile = {
  id: "model_test",
  name: "Test Model",
  provider: "custom",
  apiFormat: "openai_chat",
  model: "test-model",
  baseUrl: "https://example.invalid",
  apiKeyRef: "model_profile:model_test",
};

function answerInput() {
  return {
    projectId: "project_test",
    question: "请解释这个文件",
    localContext: {
      responseLanguage: "zh",
      scope: {
        nodeId: "node_test",
        selectedFilePath: "src/test.ts",
      },
    } as LocalContextBundle,
    profile,
    thinkingDepth: "off" as const,
    responseLanguage: resolveResponseLanguage("请解释这个文件"),
  };
}

class QueuedGateway extends ModelGateway {
  readonly requests: ModelGatewayRequest[] = [];

  constructor(private readonly outputs: string[]) {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(_profile: ModelProfile, request: ModelGatewayRequest) {
    this.requests.push(request);
    return {
      requestId: `request_${this.requests.length}`,
      provider: "test",
      model: "test-model",
      output: this.outputs.shift() ?? "",
      usage: { inputTokens: 1, outputTokens: 1 },
      latencyMs: 1,
    };
  }
}
