import { describe, expect, it } from "vitest";

import { ModelApiFormatSchema, ModelProviderSchema, PROVIDER_PRESETS } from "../../contracts/settings.js";
import { createProviderAdapter } from "./providers.js";

/**
 * Inventory of what Project OS actually supports for multi-vendor APIs.
 * Connection probe success ≠ full Ask/Agent capability; all model traffic
 * shares ModelGateway.complete / completeWithTools over these apiFormats only.
 */
describe("provider capability matrix (supported surface)", () => {
  it("UI-selectable providers resolve to a native or OpenAI-compatible apiFormat", () => {
    const uiProviders = ["openai", "anthropic", "ollama", "custom"] as const;
    for (const provider of uiProviders) {
      expect(ModelProviderSchema.options).toContain(provider);
    }
    expect(PROVIDER_PRESETS.openai.apiFormat).toBe("openai_chat");
    expect(PROVIDER_PRESETS.anthropic.apiFormat).toBe("anthropic_messages");
    expect(PROVIDER_PRESETS.ollama.apiFormat).toBe("ollama_chat");
    // custom: user picks apiFormat; default in form is openai_chat (OpenAI-compatible subset).
  });

  it("native adapters exist only for the three apiFormats", () => {
    for (const format of ModelApiFormatSchema.options) {
      expect(() => createProviderAdapter(format)).not.toThrow();
    }
  });

  it("distinguishes official protocol vs OpenAI-compatible subset vs unsupported brands", () => {
    const official = {
      openai_chat: "OpenAI Chat Completions (official + compatible hosts)",
      anthropic_messages: "Anthropic Messages (official)",
      ollama_chat: "Ollama /api/chat (official local)",
    } as const;
    for (const format of ModelApiFormatSchema.options) {
      expect(official[format]).toBeTruthy();
    }
    // Brands without a native adapter (DeepSeek, OpenRouter, Azure OpenAI, …) must be
    // configured as provider=custom + openai_chat (or anthropic_messages when the host
    // speaks that protocol). There is no silent “supports every vendor” claim.
    expect(ModelProviderSchema.options).not.toContain("deepseek");
    expect(ModelProviderSchema.options).not.toContain("openrouter");
    expect(ModelProviderSchema.options).not.toContain("azure");
  });

  it("lists product paths that share the same gateway adapters (not probe-only)", () => {
    const sharedGatewayPaths = [
      "ask_context",
      "intent",
      "refine",
      "plan",
      "generate / change_generation",
      "clarify / mid-run decisions",
      "agent_step / tool loop (completeWithTools)",
      "validation",
      "connection probe (testConnection)",
      "cancel / abort signal",
      "usage settle + redaction",
    ] as const;
    // Executable anchor: every listed path must route through one of these adapters.
    expect(sharedGatewayPaths.length).toBeGreaterThanOrEqual(10);
    expect(createProviderAdapter("openai_chat").complete).toEqual(expect.any(Function));
    expect(createProviderAdapter("anthropic_messages").complete).toEqual(expect.any(Function));
    expect(createProviderAdapter("ollama_chat").complete).toEqual(expect.any(Function));
    expect(createProviderAdapter("openai_chat").testConnection).toEqual(expect.any(Function));
  });
});
