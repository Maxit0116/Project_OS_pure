import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelProfile } from "../../contracts/settings.js";
import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { containsHighConfidenceSecret } from "../high-confidence-secret-patterns.js";
import { ModelGateway } from "./gateway.js";
import { redactText } from "./redaction.js";

const SECRET_CASES = [
  ["OpenAI project key", `sk-proj-${"A".repeat(32)}`],
  ["Anthropic key", `sk-ant-api03-${"B".repeat(32)}`],
  ["AWS access key", "AKIA1234567890ABCDEF"],
  ["GitHub token", `ghp_${"c".repeat(36)}`],
  ["Google API key", `AIza${"D".repeat(35)}`],
  [
    "PEM private key",
    "-----BEGIN PRIVATE KEY-----\nvery-secret-private-key-material\n-----END PRIVATE KEY-----",
  ],
  [
    "JWT",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlX3ZhbHVlXzEyMzQ1Njc4OTA",
  ],
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("redactText", () => {
  it.each(SECRET_CASES)("redacts a %s using the shared classifier", (_label, secret) => {
    expect(containsHighConfidenceSecret(secret)).toBe(true);
    expect(redactText(`before ${secret} after`, "secrets_and_paths")).toBe(
      "before [REDACTED] after",
    );
  });

  it("leaves benign text untouched", () => {
    const benign = "Use sketch-project and AKIRA as ordinary identifiers.";
    expect(containsHighConfidenceSecret(benign)).toBe(false);
    expect(redactText(benign, "secrets_and_paths")).toBe(benign);
  });

  it("keeps path-only policy behavior separate from secret redaction", () => {
    const secret = `sk-proj-${"A".repeat(32)}`;
    expect(redactText(`${secret} /Users/alice/project/file.ts`, "local_paths_only"))
      .toBe(`${secret} [PATH]`);
  });
});

describe("ModelGateway redaction boundary", () => {
  it("redacts outbound prompts plus provider output and reasoning", async () => {
    const outboundSecret = `sk-proj-${"A".repeat(32)}`;
    const outputSecret = `ghp_${"c".repeat(36)}`;
    const reasoningSecret =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlX3ZhbHVlXzEyMzQ1Njc4OTA";
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({
        choices: [{
          message: {
            content: `answer ${outputSecret} /Users/provider/output.txt`,
            reasoning_content: `reasoning ${reasoningSecret} /tmp/provider-trace.txt`,
          },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const secretStore = new InMemorySecretStore();
    await secretStore.set("gateway-key", "provider-auth-key");
    const gateway = new ModelGateway({ secretStore });
    const response = await gateway.complete(profile, {
      projectId: "project-redaction",
      requestKind: "question_answer",
      input: {
        question: `Explain ${outboundSecret} from /Users/alice/project/file.ts`,
      },
      systemPrompt: `Do not reveal ${outboundSecret}`,
      redactionPolicy: "secrets_and_paths",
    });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const requestBody = JSON.parse(String(requestInit?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(requestBody.messages).toEqual([
      { role: "system", content: "Do not reveal [REDACTED]" },
      {
        role: "user",
        content: expect.stringContaining("Explain [REDACTED] from [PATH]"),
      },
    ]);
    expect(JSON.stringify(requestBody)).not.toContain(outboundSecret);
    expect(response.output).toBe("answer [REDACTED] [PATH]");
    expect(response.reasoning).toBe("reasoning [REDACTED] [PATH]");
  });
});

const profile: ModelProfile = {
  id: "redaction-model",
  name: "Redaction model",
  provider: "openai",
  model: "test-model",
  apiKeyRef: "gateway-key",
  isDefault: true,
};
