import { createFileOutboundBudget } from "./outbound-budget.js";

const path = process.env.LEDGER_PATH;
const limit = Number(process.env.LEDGER_LIMIT);
const attempts = Number(process.env.ATTEMPTS ?? "8");
if (!path || !Number.isInteger(limit) || limit <= 0) {
  process.stderr.write("missing LEDGER_PATH/LIMIT\n");
  process.exit(2);
}

const budget = createFileOutboundBudget(path, limit);
let ok = 0;
let exhausted = 0;
let other = 0;
for (let i = 0; i < attempts; i += 1) {
  try {
    budget.reserve();
    ok += 1;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "other";
    if (code === "model_outbound_budget_exhausted") exhausted += 1;
    else other += 1;
  }
}
process.stdout.write(JSON.stringify({ ok, exhausted, other }));
