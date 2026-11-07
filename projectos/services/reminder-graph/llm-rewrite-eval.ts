import type { ReminderDocRewrite } from "../../contracts/reminder-graph.js";

export type RewriteEvalVerdict = "accept" | "fallback" | "reject";

export type RewriteEvalResult = {
  verdict: RewriteEvalVerdict;
  score: number;
  reasons: string[];
  cleaned: string;
};

/** Strip accidental whole-file markdown fences from model output. */
export function cleanLlmRewriteOutput(output: string): string {
  return output
    .trim()
    .replace(/^```(?:markdown|md)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trimEnd();
}

/**
 * Score a candidate rewrite for Reminder Graph doc updates.
 * Used both by production acceptance and golden-fixture eval tests.
 */
export function evaluateLlmRewrite(args: {
  before: string;
  after: string;
  reason: string;
  excerpt?: string | null | undefined;
}): RewriteEvalResult {
  const reasons: string[] = [];
  const cleaned = cleanLlmRewriteOutput(args.after);
  let score = 0;

  if (!cleaned || cleaned.length < 20) {
    return { verdict: "fallback", score: 0, reasons: ["too_short"], cleaned };
  }
  if (cleaned === args.before.trim()) {
    return { verdict: "fallback", score: 0, reasons: ["unchanged"], cleaned };
  }

  // Prefer preserving a major heading from the original
  const beforeHeading = /^#\s+.+$/m.exec(args.before)?.[0];
  if (beforeHeading && cleaned.includes(beforeHeading.replace(/^#\s+/, "").trim().slice(0, 12))) {
    score += 2;
  } else if (beforeHeading) {
    reasons.push("heading_drift");
    score -= 1;
  }

  const reasonTokens = args.reason
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter((token) => token.length >= 3)
    .slice(0, 6);
  const hit = reasonTokens.filter((token) => cleaned.toLowerCase().includes(token)).length;
  if (hit > 0) {
    score += Math.min(3, hit);
  } else {
    reasons.push("reason_not_reflected");
    score -= 1;
  }

  if (args.excerpt && cleaned.includes(args.excerpt.slice(0, 40))) {
    // Still mentioning old deferral phrasing without change signal → weaker
    if (
      /〔已按 Reminder Graph|after MVP|MVP\s*后|延后|deferred/i.test(cleaned) &&
      /phase|提前|before|now|立即|现在/i.test(args.reason)
    ) {
      reasons.push("stale_deferral_language");
      score -= 1;
    } else {
      score += 1;
    }
  }

  // Reject obviously truncated or prompt-leaked outputs
  if (/^you update project planning/i.test(cleaned) || cleaned.includes("Return ONLY")) {
    return {
      verdict: "reject",
      score: 0,
      reasons: [...reasons, "prompt_leak"],
      cleaned,
    };
  }

  if (score >= 2) {
    return { verdict: "accept", score, reasons, cleaned };
  }
  if (score <= -1) {
    return { verdict: "reject", score, reasons, cleaned };
  }
  return { verdict: "fallback", score, reasons, cleaned };
}

export function rewriteFromEvaluation(args: {
  path: string;
  before: string;
  evaluation: RewriteEvalResult;
}): ReminderDocRewrite | null {
  if (args.evaluation.verdict !== "accept") return null;
  return {
    path: args.path,
    before: args.before,
    after: `${args.evaluation.cleaned}\n`,
  };
}
