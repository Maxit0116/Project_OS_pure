import { describe, expect, it } from "vitest";

import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
} from "../contracts/model-gateway.js";
import type { ModelProfile } from "../contracts/settings.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import type { ResolvedResponseLanguage } from "./agent-language-policy.js";
import { ModelGateway } from "./model-gateway/index.js";
import { PromptRefinementService } from "./prompt-refinement-service.js";

const profile: ModelProfile = {
  id: "refinement-model",
  name: "Refinement model",
  provider: "openai",
  model: "test-model",
  apiKeyRef: "refinement-key",
  isDefault: true,
};

const responseLanguage: ResolvedResponseLanguage = {
  tag: "en",
  source: "detected",
  expectedScripts: ["latin"],
};

describe("PromptRefinementService model output validation", () => {
  it("fails closed when the model returns non-JSON text", async () => {
    const rawModelText = "RAW MODEL TEXT THAT MUST NOT BECOME UNDERSTOOD";
    const service = new PromptRefinementService(
      new StubGateway(rawModelText),
    );

    const failure = await refine(service).catch((error: unknown) => error);
    expect(failure).toMatchObject({
      code: "agent_orchestration_failed",
      message: "The model returned malformed prompt refinement JSON",
    });
    expect(failure).not.toHaveProperty("cause");
    expect((failure as Error).message).not.toContain(rawModelText);
  });

  it("fails closed when JSON does not match the required refinement shape", async () => {
    const service = new PromptRefinementService(
      new StubGateway(JSON.stringify({
        understood: "Change the login heading",
        ambiguities: "none",
        suggestions: [],
        affectedNodeIds: ["feat_login"],
        affectedFiles: ["app/login/page.tsx"],
        confidence: 0.9,
      })),
    );

    await expect(refine(service)).rejects.toMatchObject({
      code: "agent_orchestration_failed",
      message: "The model returned an invalid prompt refinement",
    });
  });

  it("keeps accepting a complete, valid model refinement", async () => {
    const service = new PromptRefinementService(
      new StubGateway(JSON.stringify({
        understood: "Change the login heading",
        ambiguities: [],
        suggestions: ["Keep the existing heading level"],
        affectedNodeIds: ["feat_login"],
        affectedFiles: ["app/login/page.tsx"],
        confidence: 0.9,
      })),
    );

    await expect(refine(service)).resolves.toMatchObject({
      understood: "Change the login heading",
      ambiguities: [],
      affectedFiles: ["app/login/page.tsx"],
      confidence: 0.9,
      mode: "model",
    });
  });

  it("redacts model output before returning refinement text", async () => {
    const secret = `sk-ant-api03-${"A".repeat(32)}`;
    const service = new PromptRefinementService(
      new StubGateway(JSON.stringify({
        understood: `Change the heading using ${secret}`,
        ambiguities: [],
        suggestions: ["Inspect /Users/alice/private.txt"],
        affectedNodeIds: ["feat_login"],
        affectedFiles: ["app/login/page.tsx"],
        confidence: 0.9,
      })),
    );

    const result = await refine(service);
    expect(result.understood).toBe("Change the heading using [REDACTED]");
    expect(result.suggestions).toEqual(["Inspect [PATH]"]);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("/Users/alice");
  });

  it("rejects a model-controlled affected-file traversal", async () => {
    const service = new PromptRefinementService(
      new StubGateway(JSON.stringify({
        understood: "Change the login heading",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: ["feat_login"],
        affectedFiles: ["../../evil.ts"],
        confidence: 0.9,
      })),
    );

    await expect(refine(service)).rejects.toMatchObject({
      code: "agent_orchestration_failed",
      message: "The model returned an invalid prompt refinement",
    });
  });

  it("rejects a model-controlled node id outside the server-known graph", async () => {
    const service = new PromptRefinementService(
      new StubGateway(JSON.stringify({
        understood: "Change the login heading",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: ["invented_node"],
        affectedFiles: ["app/login/page.tsx"],
        confidence: 0.9,
      })),
    );

    await expect(refine(service)).rejects.toMatchObject({
      code: "agent_orchestration_failed",
      message: "The model returned an invalid prompt refinement",
    });
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
      requestId: "request-refinement",
      provider: "test",
      model: "test-model",
      output: this.output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

function refine(service: PromptRefinementService) {
  return service.refineWithModel({
    request: {
      projectId: "project-test",
      nodeId: "feat_login",
      filePath: "app/login/page.tsx",
      rawPrompt: "Change the login heading",
    },
    profile,
    thinkingDepth: "medium",
    responseLanguage,
    knownNodeIds: new Set(["feat_login"]),
  });
}
