import { describe, expect, it } from "vitest";
import { openAiTranscriptionsUrl } from "./speech-transcription-service.js";

describe("openAiTranscriptionsUrl", () => {
  it("appends the transcriptions path to a v1 base URL", () => {
    expect(openAiTranscriptionsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/audio/transcriptions",
    );
  });

  it("normalizes trailing slashes", () => {
    expect(openAiTranscriptionsUrl("https://example.com/v1/")).toBe(
      "https://example.com/v1/audio/transcriptions",
    );
  });
});
