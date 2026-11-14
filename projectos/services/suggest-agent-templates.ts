import type { AgentCatalogListing } from "../contracts/agent-marketplace.js";
import type { LoopAgentRole } from "../contracts/loop-node-architecture.js";

export type SuggestedAgentTemplate = {
  listingId: string;
  name: string;
  department?: string;
  score: number;
  rationale: string;
  suggestedLoopAgentRole?: LoopAgentRole;
};

const ROLE_KEYWORDS: Array<{ role: LoopAgentRole; tokens: string[] }> = [
  {
    role: "planner",
    tokens: ["prd", "roadmap", "requirement", "user story", "acceptance", "plan", "优先级", "需求"],
  },
  {
    role: "architect",
    tokens: ["architecture", "adr", "c4", "system design", "module boundary", "架构", "技术方案"],
  },
  {
    role: "documenter",
    tokens: ["ux", "ui design", "wireframe", "design system", "usability", "原型", "交互"],
  },
  {
    role: "coder",
    tokens: [
      "frontend",
      "backend",
      "full-stack",
      "fullstack",
      "react",
      "api",
      "implement",
      "feature",
      "前端",
      "后端",
    ],
  },
  {
    role: "reviewer",
    tokens: ["code review", "review diff", "pr review", "审查", "code-reviewer"],
  },
  {
    role: "tester",
    tokens: ["qa", "test plan", "e2e", "regression", "security", "漏洞", "测试"],
  },
  {
    role: "debugger",
    tokens: ["devops", "ci/cd", "docker", "deploy", "incident", "observability", "部署"],
  },
  {
    role: "researcher",
    tokens: ["prompt", "rag", "llm", "embedding", "domain specialist", "研究"],
  },
];

function scoreTextMatch(promptLower: string, ...parts: Array<string | undefined>): number {
  let score = 0;
  for (const part of parts) {
    if (!part) continue;
    const lower = part.toLowerCase();
    if (!lower) continue;
    if (promptLower.includes(lower)) {
      score += Math.min(14, Math.max(4, lower.length));
      continue;
    }
    const tokens = lower.split(/[\s/_.:·,|-]+/).filter((t) => t.length >= 3);
    for (const token of tokens) {
      if (promptLower.includes(token)) score += Math.min(7, token.length);
    }
  }
  return score;
}

/**
 * Thin heuristic: rank Agent Templates for a free-text goal or Loop role hint.
 * Suggestions only — never installs or binds Instances.
 */
export function suggestAgentTemplatesFromPrompt(input: {
  prompt: string;
  listings: AgentCatalogListing[];
  preferredLoopRole?: LoopAgentRole | null;
  limit?: number;
}): SuggestedAgentTemplate[] {
  const promptLower = input.prompt.trim().toLowerCase();
  if (!promptLower && !input.preferredLoopRole) return [];

  const roleBoost = new Map<LoopAgentRole, number>();
  if (input.preferredLoopRole) {
    roleBoost.set(input.preferredLoopRole, 40);
  }
  for (const entry of ROLE_KEYWORDS) {
    for (const token of entry.tokens) {
      if (promptLower.includes(token)) {
        roleBoost.set(entry.role, (roleBoost.get(entry.role) ?? 0) + 12);
      }
    }
  }

  const scored: SuggestedAgentTemplate[] = [];
  for (const listing of input.listings) {
    let score =
      scoreTextMatch(
        promptLower,
        listing.id,
        listing.name,
        listing.tagline,
        listing.description,
        listing.roleLabel,
        ...(listing.capabilityTags ?? []),
        ...(listing.taskTypes ?? []),
      ) + (listing.trustTier === "curated" ? 2 : 0);

    const role = listing.suggestedLoopAgentRole;
    if (role && roleBoost.has(role)) {
      score += roleBoost.get(role)!;
    }

    if (/frontend|react|css|vue|ui implement/u.test(promptLower) && listing.id.includes("frontend")) {
      score += 18;
    }
    if (/backend|graphql|rest api|database|auth/u.test(promptLower) && listing.id.includes("backend")) {
      score += 18;
    }
    if (/full.?stack|end-to-end|mvp/u.test(promptLower) && listing.id.includes("fullstack")) {
      score += 16;
    }
    if (/refactor|performance|complex debug|senior/u.test(promptLower) && listing.id.includes("senior")) {
      score += 16;
    }
    if (/mobile|ios|android|flutter|swift/u.test(promptLower) && listing.id.includes("mobile")) {
      score += 20;
    }
    if (/pipeline|warehouse|etl|data model/u.test(promptLower) && listing.id.includes("data-engineer")) {
      score += 20;
    }

    if (score <= 0) continue;

    const rationaleParts: string[] = [];
    if (role && roleBoost.has(role)) {
      rationaleParts.push(`Matches Loop role “${role}”`);
    }
    if (listing.capabilityTags?.some((tag) => promptLower.includes(tag.toLowerCase()))) {
      rationaleParts.push("Capability tags overlap the request");
    }
    if (rationaleParts.length === 0) {
      rationaleParts.push("Keyword overlap with template profile");
    }

    scored.push({
      listingId: listing.id,
      name: listing.name,
      ...(listing.department ? { department: listing.department } : {}),
      score,
      rationale: rationaleParts.join("; "),
      ...(role ? { suggestedLoopAgentRole: role } : {}),
    });
  }

  scored.sort((a, b) => b.score - a.score || a.listingId.localeCompare(b.listingId));
  const limit = Math.max(1, Math.min(input.limit ?? 5, 8));
  return scored.slice(0, limit);
}
