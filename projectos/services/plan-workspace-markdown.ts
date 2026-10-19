import type { ImplementationPlan } from "../contracts/implementation-plan.js";
import {
  ImplementationPlanSchema,
  ImplementationPlanStatusSchema,
} from "../contracts/implementation-plan.js";
import { AgentConversationScopeSchema } from "../contracts/agent-conversation.js";

/**
 * Serialize / parse ImplementationPlan ↔ `.projectos/plans/<id>.md`.
 * Frontmatter carries machine fields; body stays human-readable.
 */
export function serializePlanMarkdown(plan: ImplementationPlan): string {
  const frontmatter = [
    "---",
    `version: ${JSON.stringify(plan.version)}`,
    `id: ${JSON.stringify(plan.id)}`,
    `projectId: ${JSON.stringify(plan.projectId)}`,
    `status: ${JSON.stringify(plan.status)}`,
    `scope: ${JSON.stringify(plan.scope)}`,
    `createdAt: ${JSON.stringify(plan.createdAt)}`,
    `updatedAt: ${JSON.stringify(plan.updatedAt)}`,
    "---",
    "",
  ].join("\n");

  const body = [
    `# ${plan.objective}`,
    "",
    "## Steps",
    ...plan.steps.map((step, index) => {
      const lines = [`${index + 1}. ${step.description}`];
      if (step.affectedFiles.length) {
        lines.push(`   - Files: ${step.affectedFiles.join(", ")}`);
      }
      if (step.acceptanceCriteria.length) {
        lines.push(`   - Acceptance: ${step.acceptanceCriteria.join("; ")}`);
      }
      return lines.join("\n");
    }),
    "",
    "## Todos",
    ...plan.todos.map(
      (todo) => `- [${todo.status === "done" ? "x" : " "}] ${todo.content}`,
    ),
    "",
    "## Rationale",
    plan.rationale,
    "",
  ].join("\n");

  return frontmatter + body;
}

export function parsePlanMarkdown(
  markdown: string,
  fallback: { projectId: string; planId: string },
): ImplementationPlan {
  const { meta, body } = splitFrontmatter(markdown);
  const objectiveMatch = body.match(/^#\s+(.+)$/m);
  const objective = (objectiveMatch?.[1] ?? fallback.planId).trim();
  const rationale = sectionBody(body, "Rationale")?.trim() || "Restored from workspace plan.";
  const steps = parseSteps(sectionBody(body, "Steps") ?? "");
  const todos = parseTodos(sectionBody(body, "Todos") ?? "");
  const now = new Date().toISOString();

  const statusParsed = ImplementationPlanStatusSchema.safeParse(meta.status);
  const scopeParsed = AgentConversationScopeSchema.safeParse(meta.scope);

  return ImplementationPlanSchema.parse({
    version: "0.1.0",
    id: typeof meta.id === "string" && meta.id ? meta.id : fallback.planId,
    projectId:
      typeof meta.projectId === "string" && meta.projectId
        ? meta.projectId
        : fallback.projectId,
    scope: scopeParsed.success ? scopeParsed.data : { kind: "global" },
    objective,
    steps,
    todos,
    ambiguities: [],
    rationale,
    status: statusParsed.success ? statusParsed.data : "ready",
    createdAt:
      typeof meta.createdAt === "string" && meta.createdAt ? meta.createdAt : now,
    updatedAt:
      typeof meta.updatedAt === "string" && meta.updatedAt ? meta.updatedAt : now,
  });
}

function splitFrontmatter(markdown: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  if (!markdown.startsWith("---")) {
    return { meta: {}, body: markdown };
  }
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body: markdown };
  const raw = markdown.slice(3, end).trim();
  const body = markdown.slice(end + 4).replace(/^\n/, "");
  const meta: Record<string, unknown> = {};
  for (const line of raw.split("\n")) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const valueRaw = line.slice(colon + 1).trim();
    try {
      meta[key] = JSON.parse(valueRaw);
    } catch {
      meta[key] = valueRaw.replace(/^["']|["']$/g, "");
    }
  }
  return { meta, body };
}

function sectionBody(markdown: string, heading: string): string | null {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "im");
  const match = re.exec(markdown);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = rest.search(/^##\s+/m);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

function parseSteps(section: string) {
  const steps: ImplementationPlan["steps"] = [];
  const lines = section.split("\n");
  let current: ImplementationPlan["steps"][number] | null = null;
  for (const line of lines) {
    const stepMatch = line.match(/^\d+\.\s+(.+)$/);
    if (stepMatch) {
      if (current) steps.push(current);
      current = {
        id: `step_${steps.length + 1}`,
        description: stepMatch[1]!.trim(),
        affectedFiles: [],
        acceptanceCriteria: ["Restored"],
      };
      continue;
    }
    if (!current) continue;
    const files = line.match(/^\s*-\s*Files:\s*(.+)$/i);
    if (files) {
      current.affectedFiles = files[1]!
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      continue;
    }
    const acceptance = line.match(/^\s*-\s*Acceptance:\s*(.+)$/i);
    if (acceptance) {
      current.acceptanceCriteria = acceptance[1]!
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
    }
  }
  if (current) steps.push(current);
  return steps;
}

function parseTodos(section: string) {
  const todos: ImplementationPlan["todos"] = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^- \[( |x|X)\]\s+(.+)$/);
    if (!match) continue;
    todos.push({
      id: `todo_${todos.length + 1}`,
      content: match[2]!.trim(),
      status: match[1]!.toLowerCase() === "x" ? "done" : "pending",
    });
  }
  return todos;
}
