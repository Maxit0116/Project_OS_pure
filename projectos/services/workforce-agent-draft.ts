import type { SkillDescriptor } from "../contracts/skills.js";
import {
  DraftWorkforceAgentResultSchema,
  WorkforceAgentDraftSchema,
  type DraftWorkforceAgentResult,
  type WorkforceAgentDraft,
} from "../contracts/agent-workforce.js";

const ROLE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(qa|quality|test(?:er|ing)?)\b|测试|质量/i, label: "QA" },
  { re: /\b(security|secure|漏洞|安全)\b/i, label: "Security" },
  { re: /\b(architect|architecture|架构)\b/i, label: "Architect" },
  { re: /\b(review|code\s*review|评审)\b/i, label: "Reviewer" },
  { re: /\b(doc(?:s|ument(?:ation)?)?|文档)\b/i, label: "Documentation" },
  { re: /\b(product|prd|产品)\b/i, label: "Product" },
  { re: /\b(debug|debugger|排查)\b/i, label: "Debugger" },
  { re: /\b(research|调研)\b/i, label: "Researcher" },
  { re: /\b(develop|coder|implement|开发)\b/i, label: "Developer" },
];

function titleCaseName(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Specialized Agent";
  return cleaned.slice(0, 80);
}

function inferDisplayName(prompt: string, roleLabel: string | undefined): string {
  const named = prompt.match(
    /(?:called|named|叫|名为)\s*[「"']?([A-Za-z0-9_\-\u4e00-\u9fff ]{2,60})[」"']?/i,
  );
  if (named?.[1]) return titleCaseName(named[1]);
  if (roleLabel) return titleCaseName(`${roleLabel} Agent`);
  const firstLine = prompt.split(/\n/)[0]?.trim() ?? prompt;
  if (firstLine.length <= 48) return titleCaseName(firstLine.replace(/[.。!！?？]+$/u, ""));
  return titleCaseName(firstLine.slice(0, 40).trim());
}

function inferRoleLabel(prompt: string): string | undefined {
  for (const entry of ROLE_PATTERNS) {
    if (entry.re.test(prompt)) return entry.label;
  }
  return undefined;
}

function matchSkillIds(prompt: string, skills: SkillDescriptor[]): string[] {
  const lower = prompt.toLowerCase();
  const matched: string[] = [];
  for (const skill of skills) {
    const id = skill.id.toLowerCase();
    const name = skill.name.toLowerCase();
    if (lower.includes(id) || lower.includes(name)) {
      matched.push(skill.id);
      continue;
    }
    const tokens = name.split(/[\s/_-]+/).filter((t) => t.length >= 3);
    if (tokens.some((t) => lower.includes(t))) matched.push(skill.id);
  }
  return [...new Set(matched)].slice(0, 16);
}

function matchMcpServerIds(
  prompt: string,
  servers: Array<{ id: string; name: string }>,
): string[] {
  const lower = prompt.toLowerCase();
  const matched: string[] = [];
  for (const server of servers) {
    const id = server.id.toLowerCase();
    const name = server.name.toLowerCase();
    if (lower.includes(id) || lower.includes(name) || lower.includes("mcp")) {
      if (lower.includes(id) || lower.includes(name)) matched.push(server.id);
    }
  }
  // If user said "MCP" generically but no id matched, leave empty — card can add.
  return [...new Set(matched)].slice(0, 16);
}

function inferPermissionNotes(prompt: string): string | undefined {
  const notes: string[] = [];
  if (/read[\s-]?only|只读|不得改|don't\s+edit|do\s+not\s+modify/i.test(prompt)) {
    notes.push("Prefer read-only; avoid writing or applying diffs unless explicitly asked.");
  }
  if (/no\s+shell|禁止\s*shell|without\s+shell/i.test(prompt)) {
    notes.push("Do not use shell commands.");
  }
  if (/approval|需(要)?审批|human\s+in\s+the\s+loop|HITL/i.test(prompt)) {
    notes.push("Escalate risky actions for human approval.");
  }
  return notes.length ? notes.join(" ") : undefined;
}

/**
 * Deterministic NL → workforce draft (MVP). Does not call a model.
 */
export function draftWorkforceAgentFromPrompt(input: {
  prompt: string;
  skills?: SkillDescriptor[];
  mcpServers?: Array<{ id: string; name: string }>;
}): DraftWorkforceAgentResult {
  const prompt = input.prompt.trim();
  const roleLabel = inferRoleLabel(prompt);
  const displayName = inferDisplayName(prompt, roleLabel);
  const skillIds = matchSkillIds(prompt, input.skills ?? []);
  const mcpServerIds = matchMcpServerIds(prompt, input.mcpServers ?? []);
  const permissionNotes = inferPermissionNotes(prompt);

  const instructionsParts = [
    `You are ${displayName}${roleLabel ? ` (${roleLabel})` : ""}.`,
    "Follow the specialized responsibilities described by the user:",
    prompt.slice(0, 3500),
  ];
  if (permissionNotes) {
    instructionsParts.push(`Constraints: ${permissionNotes}`);
  }

  const draft: WorkforceAgentDraft = WorkforceAgentDraftSchema.parse({
    displayName,
    ...(roleLabel ? { roleLabel } : {}),
    instructions: instructionsParts.join("\n\n"),
    modelProfileId: null,
    skillIds,
    mcpServerIds,
    ...(permissionNotes ? { permissionNotes } : {}),
  });

  return DraftWorkforceAgentResultSchema.parse({
    draft,
    sourcePrompt: prompt,
  });
}
