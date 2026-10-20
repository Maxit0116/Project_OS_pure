import type { AgentRunEvent } from "../../contracts/events.js";

/**
 * Token total for one run (GW-0).
 * Child runs are listed, not added. A fixture run is not model quality.
 */
export interface RunUsageSummary {
  backend: "model" | "fixture";
  usage: "reported" | "missing" | "not_model";
  inputTokens: number;
  outputTokens: number;
  childRunIds: string[];
}

export function summarizeRunUsage(input: {
  events: readonly AgentRunEvent[];
  childRunIds?: readonly string[];
  backend: "model" | "fixture";
}): RunUsageSummary {
  const childRunIds = [...new Set(input.childRunIds ?? [])];
  if (input.backend === "fixture") {
    return {
      backend: "fixture",
      usage: "not_model",
      inputTokens: 0,
      outputTokens: 0,
      childRunIds,
    };
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let missing = false;
  for (const event of input.events) {
    if (event.type !== "model_request") continue;
    if (event.payload.backend === "fixture") continue;
    inputTokens += event.payload.tokenUsage.input;
    outputTokens += event.payload.tokenUsage.output;
    if (event.payload.usage === "missing") missing = true;
  }
  return {
    backend: "model",
    usage: missing ? "missing" : "reported",
    inputTokens,
    outputTokens,
    childRunIds,
  };
}
