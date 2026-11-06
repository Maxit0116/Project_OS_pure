import {
  labFindingHandoffMode,
  type LabFinding,
  type LabSession,
} from "../../contracts/product-lab.js";

export function buildLabHandoffPrompt(
  finding: LabFinding,
  session: LabSession,
): { mode: "change" | "debug"; prompt: string } {
  const mode = labFindingHandoffMode(finding.kind);
  const evidenceBlock =
    finding.evidence.length === 0
      ? "(no structured evidence)"
      : finding.evidence
          .map((e) => `- [${e.kind}] ${e.label}: ${e.body}`)
          .join("\n");
  const location = finding.location
    ? [
        finding.location.url ? `URL: ${finding.location.url}` : null,
        finding.location.route ? `Route: ${finding.location.route}` : null,
        finding.location.title ? `Title: ${finding.location.title}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "(unknown location)";
  const scope =
    session.scopeNodeIds.length > 0
      ? session.scopeNodeIds.join(", ")
      : finding.nodeIds.length > 0
        ? finding.nodeIds.join(", ")
        : "(whole project / unmapped)";

  const prompt = [
    "Product Lab handed off a finding from a live product experience session.",
    "Fix the root cause. Prefer the scoped Function Map nodes. Do not invent unrelated refactors.",
    "",
    `Finding: ${finding.title}`,
    `Kind: ${finding.kind}`,
    `Detail: ${finding.detail || "(none)"}`,
    `Scope node ids: ${scope}`,
    `Location:\n${location}`,
    `Evidence:\n${evidenceBlock}`,
    "",
    "After proposing a fix, keep changes minimal and verifiable by re-walking the same user path in Product Lab.",
  ].join("\n");

  return { mode, prompt };
}
