import { createFileOutboundBudget } from "./outbound-budget.js";

const path = process.env.LEDGER_PATH;
if (!path) {
  process.stdout.write("other");
  process.exit(0);
}
try {
  createFileOutboundBudget(path, 2).reserve();
  process.stdout.write("unexpected_ok");
} catch (error) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "other";
  process.stdout.write(code);
}
