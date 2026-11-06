import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelProfile } from "../../contracts/settings.js";
import { buildDocRewrites } from "./llm-rewrite.js";
import {
  cleanLlmRewriteOutput,
  evaluateLlmRewrite,
} from "./llm-rewrite-eval.js";
import type { ReminderTimelineItem } from "../../contracts/reminder-graph.js";

const profile = {
  id: "test",
  label: "test",
  provider: "openai",
  model: "gpt-test",
  apiFormat: "openai_chat",
  isDefault: true,
} as ModelProfile;

const now = "2026-11-05T00:00:00.000Z";

function sampleItem(path: string, excerpt: string): ReminderTimelineItem {
  return {
    id: "reminder_marketplace_after_mvp",
    kind: "reminder",
    title: "Capability Marketplace after MVP",
    phaseIndex: 11,
    manualOrder: 0,
    reminderStatus: "parked",
    dependsOn: ["milestone_mvp_acceptance"],
    sourceRefs: [{ path, excerpt, updatedAt: now }],
    supersededSources: [],
    userPinned: false,
    locked: false,
    featureIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("llm rewrite evaluation", () => {
  it("strips fences and scores accept/fallback/reject", () => {
    expect(cleanLlmRewriteOutput("```md\n# Hello\n```")).toBe("# Hello");

    const before = `# Dev Plan\n\nMarketplace ships after MVP acceptance.\n`;
    const good = evaluateLlmRewrite({
      before,
      after: `# Dev Plan\n\nMarketplace moves before MVP — phase 0 now.\n`,
      reason: "Move Marketplace to phase 0 before MVP",
      excerpt: "Marketplace ships after MVP acceptance.",
    });
    expect(good.verdict).toBe("accept");

    const leaked = evaluateLlmRewrite({
      before,
      after: "You update project planning docs for Reminder Graph.",
      reason: "Move Marketplace earlier",
    });
    expect(leaked.verdict).toBe("reject");

    const unchanged = evaluateLlmRewrite({
      before,
      after: before,
      reason: "Move Marketplace earlier",
    });
    expect(unchanged.verdict).toBe("fallback");
  });

  it("accepts strong model output and falls back on weak output", async () => {
    const root = mkdtempSync(join(tmpdir(), "reminder-llm-"));
    const docs = join(root, "docs", "features");
    mkdirSync(docs, { recursive: true });
    const rel = "docs/features/Sample-Dev-Plan.md";
    const before = `# Sample\n\nCapability Marketplace ships after MVP acceptance.\n`;
    writeFileSync(join(root, rel), before, "utf8");
    const item = sampleItem(rel, "Capability Marketplace ships after MVP acceptance.");

    const goodGateway = {
      complete: async () => ({
        requestId: "r1",
        provider: "test",
        model: "gpt-test",
        output: `# Sample\n\nCapability Marketplace is pulled forward to phase 0 before MVP.\n`,
        usage: { inputTokens: 1, outputTokens: 1 },
        usageStatus: "reported" as const,
        latencyMs: 1,
      }),
    };
    const accepted = await buildDocRewrites({
      workspaceRoot: root,
      item,
      reason: "Move Marketplace to phase 0 before MVP",
      gateway: goodGateway,
      profile,
    });
    expect(accepted[0]?.after).toMatch(/phase 0 before MVP/i);
    expect(accepted[0]?.after).not.toMatch(/〔已按 Reminder Graph/);

    const weakGateway = {
      complete: async () => ({
        requestId: "r2",
        provider: "test",
        model: "gpt-test",
        output: "ok",
        usage: { inputTokens: 1, outputTokens: 1 },
        usageStatus: "reported" as const,
        latencyMs: 1,
      }),
    };
    const fallback = await buildDocRewrites({
      workspaceRoot: root,
      item,
      reason: "Move Marketplace to phase 0 before MVP",
      gateway: weakGateway,
      profile,
    });
    expect(fallback[0]?.after).toMatch(/已按 Reminder Graph/);
  });
});
