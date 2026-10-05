import { redactText } from "./model-gateway/redaction.js";

export const REASONING_MAX_CHARACTERS = 12_000;
export const REASONING_MAX_BYTES = 32_000;

export interface ProviderReasoningTrace {
  content: string;
  source: "provider_supplied";
  truncated: boolean;
}

export function createProviderReasoningTrace(
  rawReasoning: string,
): ProviderReasoningTrace | undefined {
  const redacted = redactText(rawReasoning, "secrets_and_paths").trim();
  if (!redacted) return undefined;

  const encoder = new TextEncoder();
  const accepted: string[] = [];
  let characters = 0;
  let bytes = 0;
  let truncated = false;
  for (const character of redacted) {
    const characterBytes = encoder.encode(character).byteLength;
    if (
      characters + 1 > REASONING_MAX_CHARACTERS ||
      bytes + characterBytes > REASONING_MAX_BYTES
    ) {
      truncated = true;
      break;
    }
    accepted.push(character);
    characters += 1;
    bytes += characterBytes;
  }
  return {
    content: accepted.join(""),
    source: "provider_supplied",
    truncated,
  };
}
