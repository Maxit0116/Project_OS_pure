/**
 * Opt-in per-request / per-process outbound bounds for live provider calls.
 *
 * Not a statistical p95 estimate — these are hard fail-closed clamps when set:
 *   PROJECTOS_MODEL_OUTBOUND_MAX_OUTPUT_TOKENS — clamp max_tokens sent to provider
 *   PROJECTOS_MODEL_OUTBOUND_MAX_INPUT_CHARS   — refuse oversized system+user prompt
 *   PROJECTOS_MODEL_OUTBOUND_SESSION_CAP       — max NEW ledger reserves this process
 *
 * Unset ⇒ daily desktop unchanged. SESSION_CAP wraps the existing count ledger
 * (each HTTP / retry / tool-loop round already reserves one slot).
 */
import { ProjectOSError } from "../../errors.js";
import type {
  OutboundBudgetGate,
  OutboundBudgetSettleInput,
} from "./outbound-budget.js";
import type { ProviderCompleteInput } from "./providers.js";

export const OUTBOUND_MAX_OUTPUT_TOKENS_ENV = "PROJECTOS_MODEL_OUTBOUND_MAX_OUTPUT_TOKENS";
export const OUTBOUND_MAX_INPUT_CHARS_ENV = "PROJECTOS_MODEL_OUTBOUND_MAX_INPUT_CHARS";
export const OUTBOUND_SESSION_CAP_ENV = "PROJECTOS_MODEL_OUTBOUND_SESSION_CAP";

/** Conservative live-batch defaults used when probes explicitly opt in. */
export const LIVE_BATCH_DEFAULT_MAX_OUTPUT_TOKENS = 2048;
export const LIVE_BATCH_DEFAULT_MAX_INPUT_CHARS = 48_000;
export const LIVE_BATCH_DEFAULT_SESSION_CAP = 8;

export type OutboundRequestBounds = {
  /** Hard clamp on provider max_tokens (and request.maxOutputTokens). */
  maxOutputTokens?: number;
  /** Fail-closed when systemPrompt + userPrompt (or messages) char length exceeds this. */
  maxInputChars?: number;
  /** Max new outbound reserves counted in this process (tool-loop rounds included). */
  sessionCap?: number;
};

function parsePositiveInt(raw: string | undefined, max: number): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  if (!/^\d+$/u.test(raw.trim())) {
    throw new ProjectOSError(
      "model_outbound_budget_unavailable",
      "Outbound request bound must be a positive integer",
    );
  }
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n <= 0 || n > max) {
    throw new ProjectOSError(
      "model_outbound_budget_unavailable",
      `Outbound request bound out of range (1..${max})`,
    );
  }
  return n;
}

export function resolveOutboundRequestBoundsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OutboundRequestBounds | null {
  const maxOutputTokens = parsePositiveInt(env[OUTBOUND_MAX_OUTPUT_TOKENS_ENV], 128_000);
  const maxInputChars = parsePositiveInt(env[OUTBOUND_MAX_INPUT_CHARS_ENV], 2_000_000);
  const sessionCap = parsePositiveInt(env[OUTBOUND_SESSION_CAP_ENV], 1_000_000);
  if (
    maxOutputTokens === undefined &&
    maxInputChars === undefined &&
    sessionCap === undefined
  ) {
    return null;
  }
  return {
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(maxInputChars !== undefined ? { maxInputChars } : {}),
    ...(sessionCap !== undefined ? { sessionCap } : {}),
  };
}

function measureInputChars(input: ProviderCompleteInput): number {
  const systemLen = input.systemPrompt?.length ?? 0;
  const userLen = input.userPrompt?.length ?? 0;
  let messagesLen = 0;
  if (input.messages?.length) {
    for (const message of input.messages) {
      if (typeof message.content === "string") messagesLen += message.content.length;
    }
  }
  return Math.max(systemLen + userLen, messagesLen);
}

/** Clamp/refuse provider input before HTTP. */
export function applyOutboundRequestBounds(
  input: ProviderCompleteInput,
  bounds: OutboundRequestBounds | null | undefined,
): ProviderCompleteInput {
  if (!bounds) return input;
  const inputChars = measureInputChars(input);
  if (bounds.maxInputChars !== undefined && inputChars > bounds.maxInputChars) {
    throw new ProjectOSError(
      "model_outbound_budget_exhausted",
      `Model outbound input ${inputChars} chars exceeds hard max ${bounds.maxInputChars}; request not sent`,
      {
        details: {
          inputChars,
          maxInputChars: bounds.maxInputChars,
          bound: "max_input_chars",
        },
      },
    );
  }
  const requested = input.maxOutputTokens ?? 2048;
  const maxOutputTokens =
    bounds.maxOutputTokens !== undefined
      ? Math.min(requested, bounds.maxOutputTokens)
      : requested;
  return {
    ...input,
    maxOutputTokens,
  };
}

/** Wrap a ledger gate so this process cannot reserve more than sessionCap new slots. */
export function withOutboundSessionCap(
  gate: OutboundBudgetGate,
  sessionCap: number,
): OutboundBudgetGate {
  if (!Number.isInteger(sessionCap) || sessionCap <= 0) {
    throw new ProjectOSError(
      "model_outbound_budget_unavailable",
      "Outbound session cap must be a positive integer",
    );
  }
  let sessionReserves = 0;
  return {
    path: gate.path,
    limit: gate.limit,
    reserve(): { reservationId: string } {
      if (sessionReserves >= sessionCap) {
        throw new ProjectOSError(
          "model_outbound_budget_exhausted",
          `Model outbound session cap exhausted (${sessionReserves}/${sessionCap}); request not sent`,
          {
            details: {
              sessionReserves,
              sessionCap,
              bound: "session_cap",
              ledgerPath: gate.path,
              ledgerLimit: gate.limit,
            },
          },
        );
      }
      const reserved = gate.reserve();
      sessionReserves += 1;
      return reserved;
    },
    settle(reservationId: string, outcome: OutboundBudgetSettleInput): void {
      gate.settle(reservationId, outcome);
    },
    annotateReservationUsage(reservationId, usage) {
      return gate.annotateReservationUsage(reservationId, usage);
    },
    snapshot() {
      return gate.snapshot();
    },
  };
}
