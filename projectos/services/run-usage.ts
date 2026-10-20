export interface RunUsageSummary {
  runId: string;
  inputTokens: number;
  outputTokens: number;
  /** `missing` when a model call did not report usage. Zeros are not estimates. */
  usage: "reported" | "missing" | "not_model";
  /** Fixture calls are excluded from the token totals. */
  backend: "model" | "fixture";
  childRunIds: string[];
}

/**
 * Sum model-call usage already stored on one run's events.
 * Child runs stay in `childRunIds` and are not added again here.
 */
export function summarizeRunUsage(input: {
  runId: string;
  events: readonly { type: string; payload?: Record<string, unknown> | null }[];
  childRunIds?: readonly string[];
}): RunUsageSummary {
  let inputTokens = 0;
  let outputTokens = 0;
  let sawModel = false;
  let sawFixture = false;
  let usage: RunUsageSummary["usage"] = "reported";

  for (const event of input.events) {
    if (event.type !== "model_request" || !event.payload) continue;
    const backend = event.payload.backend === "fixture" ? "fixture" : "model";
    if (backend === "fixture") {
      sawFixture = true;
      continue;
    }
    sawModel = true;
    if (event.payload.usage === "missing") usage = "missing";
    const tokens = event.payload.tokenUsage;
    if (!tokens || typeof tokens !== "object") {
      usage = "missing";
      continue;
    }
    const record = tokens as { input?: unknown; output?: unknown };
    inputTokens += finiteToken(record.input);
    outputTokens += finiteToken(record.output);
    if (!Number.isInteger(record.input) || !Number.isInteger(record.output)) {
      usage = "missing";
    }
  }

  return {
    runId: input.runId,
    inputTokens: sawModel ? inputTokens : 0,
    outputTokens: sawModel ? outputTokens : 0,
    usage: sawModel ? usage : sawFixture ? "not_model" : "reported",
    backend: sawModel ? "model" : sawFixture ? "fixture" : "model",
    childRunIds: [...(input.childRunIds ?? [])],
  };
}

function finiteToken(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}
