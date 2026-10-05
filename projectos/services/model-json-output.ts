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
