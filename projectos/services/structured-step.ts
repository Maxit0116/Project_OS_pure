import { z } from "zod";

import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
  ModelToolDefinition,
} from "../contracts/model-gateway.js";
import { ProjectOSError } from "../errors.js";
import { isTruncatedModelOutput, resolveModelStructuredOutput } from "./model-json-output.js";

/**
 * One model step whose answer has to fit a schema, run the same way everywhere.
 *
 * The step offers the model its answers as tools, so the provider shapes the JSON; whatever comes
 * back is still checked by the step's own schema. When it does not fit, the model is told exactly
 * which field and why and asks again, a bounded number of times. A reply that was cut off at the
 * output limit is asked again with more room and no scolding. Every attempt is reported, so a
 * person can see why a step took three tries instead of getting a bare "invalid shape".
 */

export interface StructuredAttempt {
  /** 1-based. */
  attempt: number;
  maxOutputTokens: number;
  outputTokens: number;
  finishReason?: string;
  /** Whether the answer came as a tool call or as plain text the harness had to dig JSON out of. */
  via: "tool" | "text";
  tool?: string;
  outcome: "accepted" | "cut_off" | "not_json" | "does_not_fit";
  issues?: string[];
}

export interface StructuredCandidate {
  /** The tool the model called, when it answered with one. */
  tool?: string;
  /** The parsed arguments, or the parsed JSON object when the model answered in text. */
  value: unknown;
}

/** Thrown by a step's `accept` for a problem the model can fix, with each problem in its own words. */
export class StructuredIssues extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("; "));
    this.name = "StructuredIssues";
  }
}

export interface StructuredStepSpec<T> {
  /** Names the step in errors and traces, e.g. "intent_discovery". */
  step: string;
  /** What the model may answer with. */
  tools: ModelToolDefinition[];
  /** Turn a candidate into the step's value, or throw a ZodError or StructuredIssues. */
  accept(candidate: StructuredCandidate): T;
  maxOutputTokens: number;
  /** Used from the second attempt on; a reasoning model often needs the room it did not get. */
  retryMaxOutputTokens: number;
  /** Default 3. */
  maxAttempts?: number;
  onAttempt?: (attempt: StructuredAttempt) => void;
}

export interface StructuredStepResult<T> {
  value: T;
  tool?: string;
  response: ModelGatewayResponse;
  attempts: StructuredAttempt[];
}

const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ISSUES_SHOWN = 6;

export function zodIssuesToText(error: z.ZodError): string[] {
  return error.issues
    .slice(0, MAX_ISSUES_SHOWN)
    .map((issue) => `${issue.path.join(".") || "(answer)"}: ${issue.message}`.slice(0, 300));
}

export async function runStructuredStep<T>(
  complete: (request: ModelGatewayRequest) => Promise<ModelGatewayResponse>,
  base: ModelGatewayRequest,
  spec: StructuredStepSpec<T>,
): Promise<StructuredStepResult<T>> {
  const maxAttempts = spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const attempts: StructuredAttempt[] = [];
  const baseInput = base.input !== null && typeof base.input === "object" && !Array.isArray(base.input)
    ? base.input as Record<string, unknown>
    : { task: base.input };
  let repair: Record<string, unknown> | undefined;
  let lastProblem = "no answer";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const maxOutputTokens = attempt === 1 ? spec.maxOutputTokens : spec.retryMaxOutputTokens;
    const response = await complete({
      ...base,
      input: repair ? { ...baseInput, repair } : baseInput,
      maxOutputTokens,
      structured: { tools: spec.tools },
    });
    const record = (partial: Pick<StructuredAttempt, "outcome"> & Partial<StructuredAttempt>): void => {
      const entry: StructuredAttempt = {
        attempt,
        maxOutputTokens,
        outputTokens: response.usage.outputTokens,
        via: response.toolName ? "tool" : "text",
        ...(response.finishReason ? { finishReason: response.finishReason } : {}),
        ...(response.toolName ? { tool: response.toolName } : {}),
        ...partial,
      };
      attempts.push(entry);
      spec.onAttempt?.(entry);
    };

    if (isTruncatedModelOutput(response, maxOutputTokens)) {
      lastProblem = "the answer was cut off at the output limit";
      record({ outcome: "cut_off" });
      continue;
    }

    const answerText = response.toolName
      ? response.output
      : resolveModelStructuredOutput(response.output, response.reasoning)
        .replace(/^```(?:json)?\s*/iu, "")
        .replace(/\s*```$/u, "");
    let value: unknown;
    try {
      value = JSON.parse(answerText);
    } catch (error) {
      const issue = response.toolName
        ? `the arguments of ${response.toolName} were not valid JSON (${error instanceof Error ? error.message : "parse error"})`
        : "the reply was neither a tool call nor a JSON object";
      lastProblem = issue;
      record({ outcome: "not_json", issues: [issue] });
      repair = repairNote([issue], answerText);
      continue;
    }

    try {
      const accepted = spec.accept({ ...(response.toolName ? { tool: response.toolName } : {}), value });
      record({ outcome: "accepted" });
      return {
        value: accepted,
        ...(response.toolName ? { tool: response.toolName } : {}),
        response,
        attempts,
      };
    } catch (error) {
      const issues = error instanceof StructuredIssues
        ? error.issues
        : error instanceof z.ZodError
          ? zodIssuesToText(error)
          : undefined;
      if (!issues) throw error;
      lastProblem = issues[0] ?? "the answer did not fit";
      record({ outcome: "does_not_fit", issues });
      repair = repairNote(issues, answerText);
    }
  }

  throw new ProjectOSError(
    "model_output_invalid",
    `The model's ${spec.step} answer did not fit after ${attempts.length} attempts (last problem: ${lastProblem})`,
    { details: { step: spec.step, attempts } },
  );
}

function repairNote(issues: string[], previousAnswer: string): Record<string, unknown> {
  return {
    problem: issues.join("; ").slice(0, 800),
    previousAnswerStartedWith: previousAnswer.trim().slice(0, 200),
    instruction:
      "Answer again by calling a tool, with exactly the problem above corrected. Do not repeat the rejected answer and do not explain it.",
  };
}
