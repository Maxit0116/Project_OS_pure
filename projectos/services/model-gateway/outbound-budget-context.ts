/**
 * Propagates the opt-in outbound budget into provider HTTP so each fetch
 * attempt (including transient retries) reserves before the network call.
 * Daily runs leave the store unset and are unaffected.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import type { OutboundBudgetGate } from "./outbound-budget.js";

const outboundBudgetAls = new AsyncLocalStorage<OutboundBudgetGate>();

export function runWithOutboundBudgetGate<T>(
  gate: OutboundBudgetGate | undefined,
  fn: () => T,
): T {
  if (!gate) return fn();
  return outboundBudgetAls.run(gate, fn);
}

export function getOutboundBudgetGate(): OutboundBudgetGate | undefined {
  return outboundBudgetAls.getStore();
}
