import { describe, expect, it } from "vitest";

import {
  isTruncatedModelOutput,
  orderedModelOutputSources,
  resolveDelegationPlanMaxOutputTokens,
  resolveDelegatedBatchValidationMaxOutputTokens,
  resolveFileEditPlanMaxOutputTokens,
  resolveGenerateDiffMaxOutputTokens,
  resolveImplementationPlanMaxOutputTokens,
  resolveModelStructuredOutput,
  resolveProposalValidationMaxOutputTokens,
  shouldRetryImplementationPlanForTruncation,
} from "./model-json-output.js";

describe("resolveModelStructuredOutput", () => {
  it("prefers non-empty answer output", () => {
    expect(resolveModelStructuredOutput('{"ok":true}', "ignored")).toBe('{"ok":true}');
  });

  it("falls back to reasoning when answer output is empty", () => {
    const json = '{"summary":"x","path":"a.ts","edits":[{"search":"a","replace":"b"}]}';
    expect(resolveModelStructuredOutput("", json)).toBe(json);
    expect(resolveModelStructuredOutput("   ", json)).toBe(json);
  });
});

describe("isTruncatedModelOutput", () => {
  it("detects finish_reason length", () => {
    expect(isTruncatedModelOutput(
      { finishReason: "length", usage: { outputTokens: 10 } },
      4096,
    )).toBe(true);
  });

  it("detects token-limit saturation when finish_reason is missing", () => {
    expect(isTruncatedModelOutput(
      { usage: { outputTokens: 2048 } },
      2048,
    )).toBe(true);
  });
});

describe("resolveProposalValidationMaxOutputTokens", () => {
  it("uses 8192 first and 16384 after truncation", () => {
    expect(resolveProposalValidationMaxOutputTokens(false)).toBe(8192);
    expect(resolveProposalValidationMaxOutputTokens(true, "response_truncated")).toBe(16_384);
  });
});

describe("resolveFileEditPlanMaxOutputTokens", () => {
  it("uses 4096 first and 8192 after truncation", () => {
    expect(resolveFileEditPlanMaxOutputTokens(false)).toBe(4096);
    expect(resolveFileEditPlanMaxOutputTokens(true, "response_truncated")).toBe(8192);
    expect(resolveFileEditPlanMaxOutputTokens(true)).toBe(6144);
  });
});

describe("resolveImplementationPlanMaxOutputTokens", () => {
  it("keeps 4096 for first draft and raises after truncation", () => {
    expect(resolveImplementationPlanMaxOutputTokens(false)).toBe(4096);
    expect(resolveImplementationPlanMaxOutputTokens(true, "response_truncated")).toBe(8192);
  });

  it("starts higher once clarifying answers are present", () => {
    expect(
      resolveImplementationPlanMaxOutputTokens(false, undefined, {
        hasClarifyingAnswers: true,
      }),
    ).toBe(8192);
    expect(
      resolveImplementationPlanMaxOutputTokens(true, "response_truncated", {
        hasClarifyingAnswers: true,
      }),
    ).toBe(16_384);
  });
});

describe("shouldRetryImplementationPlanForTruncation", () => {
  it("retries on explicit length even below the soft saturation band", () => {
    expect(
      shouldRetryImplementationPlanForTruncation(
        { finishReason: "length", usage: { outputTokens: 100 } },
        4096,
      ),
    ).toBe(true);
  });

  it("does not retry on finishReason=stop even when tokens sit on the cap", () => {
    expect(
      shouldRetryImplementationPlanForTruncation(
        { finishReason: "stop", usage: { outputTokens: 4096 } },
        4096,
      ),
    ).toBe(false);
  });

  it("retries when finishReason is missing and tokens saturate (live gateway settles shape)", () => {
    expect(
      shouldRetryImplementationPlanForTruncation(
        { usage: { outputTokens: 4096 } },
        4096,
      ),
    ).toBe(true);
  });

  it("does not retry when finishReason is missing but tokens are well under the cap", () => {
    expect(
      shouldRetryImplementationPlanForTruncation(
        { usage: { outputTokens: 1800 } },
        4096,
      ),
    ).toBe(false);
  });
});

describe("resolveGenerateDiffMaxOutputTokens", () => {
  it("starts at 8192 and grows on retry, especially after truncation", () => {
    expect(resolveGenerateDiffMaxOutputTokens(false)).toBe(8192);
    expect(resolveGenerateDiffMaxOutputTokens(true, "invalid_edit_shape")).toBe(12_288);
    expect(resolveGenerateDiffMaxOutputTokens(true, "response_truncated")).toBe(16_384);
  });
});

describe("resolveDelegatedBatchValidationMaxOutputTokens", () => {
  it("scales with task count and retry truncation", () => {
    expect(resolveDelegatedBatchValidationMaxOutputTokens(1, false)).toBe(4096);
    expect(resolveDelegatedBatchValidationMaxOutputTokens(3, false)).toBe(8192);
    expect(resolveDelegatedBatchValidationMaxOutputTokens(3, true, "response_truncated")).toBe(16_384);
  });
});

describe("resolveDelegationPlanMaxOutputTokens", () => {
  it("scales with file count and retry truncation", () => {
    expect(resolveDelegationPlanMaxOutputTokens(5, false)).toBe(6144);
    expect(resolveDelegationPlanMaxOutputTokens(5, true, "response_truncated")).toBe(12_288);
  });
});

describe("orderedModelOutputSources", () => {
  it("returns output first and deduplicates identical reasoning", () => {
    expect(orderedModelOutputSources('{"a":1}', '{"a":1}')).toEqual(['{"a":1}']);
    expect(orderedModelOutputSources('{"a":1}', '{"b":2}')).toEqual(['{"a":1}', '{"b":2}']);
    expect(orderedModelOutputSources("", '{"b":2}')).toEqual(['{"b":2}']);
  });
});
