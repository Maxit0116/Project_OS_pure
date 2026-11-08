export function isTruncatedModelOutput(
  response: { finishReason?: string | undefined; usage: { outputTokens: number } },
  maxOutputTokens: number,
): boolean {
  if (response.finishReason?.toLowerCase() === "length") {
    return true;
  }
  return response.usage.outputTokens >= Math.max(1, maxOutputTokens - 4);
}

export function resolveDelegationPlanMaxOutputTokens(
  fileCount: number,
  retrying: boolean,
  firstFailure?: "response_truncated",
): number {
  const scaledBase = Math.min(8192, 4096 + Math.max(0, fileCount - 1) * 512);
  if (!retrying) {
    return scaledBase;
  }
  if (firstFailure === "response_truncated") {
    return Math.min(16_384, scaledBase * 2);
  }
  return Math.min(8192, scaledBase + 2048);
}

export function resolveDelegatedBatchValidationMaxOutputTokens(
  taskCount: number,
  retrying: boolean,
  firstFailure?: "response_truncated",
): number {
  const scaledBase = Math.min(8192, 4096 + Math.max(0, taskCount - 1) * 2048);
  if (!retrying) {
    return scaledBase;
  }
  if (firstFailure === "response_truncated") {
    return 16_384;
  }
  return Math.min(12_288, scaledBase + 2048);
}

export function resolveProposalValidationMaxOutputTokens(
  retrying: boolean,
  firstFailure?: "response_truncated",
): number {
  if (!retrying) {
    return 4096;
  }
  if (firstFailure === "response_truncated") {
    return 8192;
  }
  return 6144;
}

export function resolveFileEditPlanMaxOutputTokens(
  retrying: boolean,
  firstFailure?: "response_truncated",
): number {
  if (!retrying) {
    return 4096;
  }
  if (firstFailure === "response_truncated") {
    return 8192;
  }
  return 6144;
}

/**
 * Implementation-plan JSON often grows after clarifying answers are filled in.
 * Live acceptance (2026-11-08) hit exact outputTokens=4096 twice on that path
 * (gateway completes log has no finishReason field — length was not directly observed).
 * Raise the base when answers are present and grow further after confirmed truncation.
 */
export function resolveImplementationPlanMaxOutputTokens(
  retrying: boolean,
  firstFailure?: "response_truncated",
  options?: { hasClarifyingAnswers?: boolean },
): number {
  const base = options?.hasClarifyingAnswers ? 8192 : 4096;
  if (!retrying) {
    return base;
  }
  if (firstFailure === "response_truncated") {
    return Math.min(16_384, base * 2);
  }
  return Math.min(12_288, base + 4096);
}

/**
 * Plan-only truncation retry gate. A complete, schema-valid plan must be kept even
 * when outputTokens sits near the cap with finishReason=stop (or missing).
 * Budget retry is allowed only for:
 * - explicit finishReason "length", or
 * - missing/unknown finishReason with saturated token usage (live gateway settles omit finishReason)
 * after parse already failed. Explicit non-length finish reasons never burn a second HTTP call
 * for shape/schema errors.
 */
export function shouldRetryImplementationPlanForTruncation(
  response: { finishReason?: string | undefined; usage: { outputTokens: number } },
  maxOutputTokens: number,
): boolean {
  const reason = response.finishReason?.trim().toLowerCase();
  if (reason === "length") {
    return true;
  }
  if (reason) {
    // stop / end_turn / tool_calls / content_filter / etc. — not a length cut.
    return false;
  }
  return response.usage.outputTokens >= Math.max(1, maxOutputTokens - 4);
}

export function resolveGenerateDiffMaxOutputTokens(
  retrying: boolean,
  firstFailure?: "response_truncated" | "invalid_edit_shape" | "malformed_json" | "search_absent" | "search_ambiguous" | "overlapping_edits" | "no_effect" | "output_too_large",
): number {
  if (!retrying) {
    return 8192;
  }
  if (firstFailure === "response_truncated") {
    return 16_384;
  }
  // Shape/search retries still need headroom; keeping 4096 caused
  // saturated retries that surfaced as response_truncated.
  return 12_288;
}

export function resolveModelStructuredOutput(
  output: string,
  reasoning?: string | undefined,
): string {
  if (output.trim()) {
    return output;
  }
  return reasoning?.trim() ?? "";
}

export function orderedModelOutputSources(
  output: string,
  reasoning?: string | undefined,
): string[] {
  const sources: string[] = [];
  const trimmedOutput = output.trim();
  const trimmedReasoning = reasoning?.trim() ?? "";
  if (trimmedOutput) {
    sources.push(trimmedOutput);
  }
  if (trimmedReasoning && trimmedReasoning !== trimmedOutput) {
    sources.push(trimmedReasoning);
  }
  return sources;
}
