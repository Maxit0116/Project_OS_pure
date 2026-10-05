import { describe, expect, it } from "vitest";

import {
  isTruncatedModelOutput,
  orderedModelOutputSources,
  resolveDelegationPlanMaxOutputTokens,
  resolveDelegatedBatchValidationMaxOutputTokens,
  resolveFileEditPlanMaxOutputTokens,
  resolveGenerateDiffMaxOutputTokens,
  resolveModelStructuredOutput,
  resolveProposalValidationMaxOutputTokens,
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
  it("uses 4096 first and 8192 after truncation", () => {
    expect(resolveProposalValidationMaxOutputTokens(false)).toBe(4096);
    expect(resolveProposalValidationMaxOutputTokens(true, "response_truncated")).toBe(8192);
  });
});

describe("resolveFileEditPlanMaxOutputTokens", () => {
  it("uses 4096 first and 8192 after truncation", () => {
    expect(resolveFileEditPlanMaxOutputTokens(false)).toBe(4096);
    expect(resolveFileEditPlanMaxOutputTokens(true, "response_truncated")).toBe(8192);
    expect(resolveFileEditPlanMaxOutputTokens(true)).toBe(6144);
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
