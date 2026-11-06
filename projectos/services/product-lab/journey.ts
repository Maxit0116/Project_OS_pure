import type { LabSession } from "../../contracts/product-lab.js";

export interface LabJourneyStep {
  id: string;
  label: string;
  hint?: string;
}

export interface LabJourneyPlan {
  label: string;
  startUrl: string | null;
  steps: LabJourneyStep[];
  source: "acceptance" | "responsibility" | "generic";
}

export function buildLabJourneyPrompt(
  session: LabSession,
  plan: LabJourneyPlan,
): string {
  const steps =
    plan.steps.length === 0
      ? "- Explore the primary user path from the start URL and note any breakage."
      : plan.steps
          .map((step, index) => `${index + 1}. ${step.label}${step.hint ? ` (${step.hint})` : ""}`)
          .join("\n");

  return [
    "Product Lab synthetic journey — act as a careful end user of the app under test.",
    "Prefer Playwright MCP (or Chrome DevTools MCP) against the preview URL below.",
    "Do not invent product requirements. Report failures honestly.",
    "",
    `Journey: ${plan.label}`,
    `Source: ${plan.source}`,
    `Start URL: ${plan.startUrl ?? "(current preview)"}`,
    `Scope node ids: ${session.scopeNodeIds.join(", ") || "(whole project)"}`,
    "",
    "Steps:",
    steps,
    "",
    "When a step fails (error overlay, failed request, dead end, wrong page):",
    "1. Stop that path.",
    "2. Describe the failure with URL + visible symptom.",
    "3. Do not silently skip acceptance criteria.",
    "",
    "If the journey completes without product failures, say JOURNEY_PASSED.",
    "If it fails, say JOURNEY_FAILED and list the failing step.",
  ].join("\n");
}

export function inferJourneyFailureFromAgentText(text: string): {
  failed: boolean;
  title: string;
  detail: string;
} {
  const trimmed = text.trim();
  const failed =
    /\bJOURNEY_FAILED\b/i.test(trimmed) ||
    (/\bfail(ed|ure)\b/i.test(trimmed) && !/\bJOURNEY_PASSED\b/i.test(trimmed));
  if (!failed) {
    return {
      failed: false,
      title: "Synthetic journey passed",
      detail: trimmed.slice(0, 2000),
    };
  }
  const firstLine =
    trimmed
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "Synthetic journey failed";
  return {
    failed: true,
    title: firstLine.replace(/^JOURNEY_FAILED[:\s-]*/i, "").slice(0, 120) ||
      "Synthetic journey failed",
    detail: trimmed.slice(0, 4000),
  };
}
