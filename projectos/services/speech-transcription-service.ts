import type { ModelProfile } from "../contracts/settings.js";
import { ProjectOSError } from "../errors.js";
import type { SecretStore } from "../persistence/secret-store.js";
import {
  normalizeBaseUrl,
  resolveApiKey,
  resolveProfileForGateway,
} from "./model-gateway/providers.js";

export function openAiTranscriptionsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith("/audio/transcriptions")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/audio/transcriptions`;
  }
  return `${normalized}/v1/audio/transcriptions`;
}

function whisperLanguage(language?: string): string | undefined {
  if (!language) {
    return undefined;
  }
  return language.split("-")[0]?.toLowerCase();
}

export async function transcribeAudioWithProfile(
  audio: Uint8Array,
  mimeType: string,
  profile: ModelProfile,
  secretStore: SecretStore,
  options?: { language?: string; model?: string },
): Promise<string> {
  const resolved = resolveProfileForGateway(profile);
  if (resolved.apiFormat !== "openai_chat") {
    throw new ProjectOSError(
      "speech_transcription_failed",
      "Speech transcription requires an OpenAI-compatible model profile",
    );
  }

  const apiKey = await resolveApiKey(secretStore, resolved);
  if (!apiKey) {
    throw new ProjectOSError(
      "speech_transcription_failed",
      "Model profile is missing an API key for speech transcription",
    );
  }

  const url = openAiTranscriptionsUrl(resolved.baseUrl ?? "https://api.openai.com/v1");
  const extension = mimeType.includes("webm")
    ? "webm"
    : mimeType.includes("mp4")
      ? "m4a"
      : "audio";
  const form = new FormData();
  form.append(
    "file",
    // Copy into a plain ArrayBuffer-backed view: Blob rejects SharedArrayBuffer views.
    new Blob([new Uint8Array(audio)], { type: mimeType }),
    `recording.${extension}`,
  );
  form.append("model", options?.model ?? "whisper-1");
  const lang = whisperLanguage(options?.language);
  if (lang) {
    form.append("language", lang);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new ProjectOSError(
      "speech_transcription_failed",
      text || `HTTP ${response.status}`,
    );
  }

  let parsed: { text?: string };
  try {
    parsed = JSON.parse(text) as { text?: string };
  } catch {
    throw new ProjectOSError(
      "speech_transcription_failed",
      "Invalid transcription response",
    );
  }

  const transcript = parsed.text?.trim() ?? "";
  if (!transcript) {
    throw new ProjectOSError("speech_transcription_failed", "No speech detected");
  }
  return transcript;
}
