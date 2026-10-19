import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MEMORY_INDEX_MAX_LINES } from "../../contracts/agent-memory.js";
import {
  AgentMemoryStore,
  hashMemoryIndex,
  parseExplicitMemoryCommand,
} from "./memory.js";
import { renderMemoryFence } from "./memory.js";
import { buildHarnessInstructions } from "./instructions.js";

function store(now = new Date("2026-10-19T03:00:00.000Z")) {
  const root = mkdtempSync(join(tmpdir(), "pos-memory-"));
  const workspaceRoot = mkdtempSync(join(tmpdir(), "pos-ws-"));
  return new AgentMemoryStore({
    root,
    workspaceRoot,
    now: () => now,
  });
}

describe("parseExplicitMemoryCommand", () => {
  it("reads remember and forget phrases", () => {
    expect(parseExplicitMemoryCommand("记住：测试用 bun")).toEqual({
      op: "upsert",
      type: "user",
      text: "测试用 bun",
    });
    expect(parseExplicitMemoryCommand("Please remember that reviews stay small")).toMatchObject({
      op: "upsert",
      text: "reviews stay small",
    });
    expect(parseExplicitMemoryCommand("忘掉：测试用 bun")).toMatchObject({
      op: "forget",
      text: "测试用 bun",
    });
  });

  it("ignores ordinary prompts", () => {
    expect(parseExplicitMemoryCommand("remember to look, then change the file")).toBeNull();
    expect(parseExplicitMemoryCommand("请记住这一点\n还有第二行")).toBeNull();
  });
});

describe("AgentMemoryStore", () => {
  it("stays empty and uninjected until enabled", () => {
    const memory = store();
    expect(memory.injectionMarkdown()).toBe("");
    const rejected = memory.applyCandidate({
      op: "upsert",
      type: "user",
      text: "use bun",
    });
    expect(rejected.accepted).toBe(false);
    expect(rejected.reason).toBe("disabled");
  });

  it("injects only candidate and corroborated lines, and hashes that text", () => {
    const memory = store();
    memory.saveSettings({ enabled: true, useMemories: true });
    expect(memory.applyCandidate({
      op: "upsert",
      type: "feedback",
      text: "use bun, not npm",
    }).accepted).toBe(true);
    memory.saveSettings({ enabled: true, useMemories: false, generateMemories: false });
    expect(memory.injectionMarkdown()).toBe("");
    expect(memory.applyCandidate({
      op: "upsert",
      type: "project",
      text: "ship the memory plan first",
    }).accepted).toBe(true);
    memory.saveSettings({ enabled: true, useMemories: true });
    const injected = memory.injectionMarkdown();
    expect(injected).toContain("use bun, not npm");
    expect(injected).toContain("ship the memory plan first");
    expect(hashMemoryIndex(injected)).toMatch(/^sha256:[a-f0-9]{64}$/u);
    memory.setEntryState("ship the memory plan first", "superseded");
    expect(memory.injectionMarkdown()).not.toContain("ship the memory plan first");

    memory.applyCandidate({ op: "forget", text: "use bun, not npm" });
    expect(memory.injectionMarkdown()).not.toContain("use bun");
    expect(memory.load().entries.some((entry) => entry.state === "superseded")).toBe(true);
  });

  it("rejects secrets, escaped links, and multiline text", () => {
    const memory = store();
    memory.saveSettings({ enabled: true, useMemories: true });
    expect(memory.applyCandidate({
      op: "upsert",
      text: "key sk-abcdefghijklmnopqrstuvwxyz",
    }).reason).toBe("secret");
    expect(memory.applyCandidate({
      op: "upsert",
      text: "see [[../secrets]]",
    }).reason).toBe("link_escape");
    expect(memory.applyCandidate({
      op: "upsert",
      text: "line one\nline two",
    }).reason).toBe("multiline");
    expect(memory.load().entries).toHaveLength(0);
  });

  it("skips a corrupt line and caps the injected index", () => {
    const memory = store();
    memory.saveSettings({ enabled: true, useMemories: true });
    for (let index = 0; index < MEMORY_INDEX_MAX_LINES + 5; index += 1) {
      memory.applyCandidate({
        op: "upsert",
        type: "user",
        text: `note ${index}`,
      });
    }
    const injected = memory.injectionMarkdown().split("\n");
    expect(injected.length).toBeLessThanOrEqual(MEMORY_INDEX_MAX_LINES);
    expect(memory.load().nearBudget).toBe(true);
  });

  it("shares a worktree with its main checkout until isolate is on", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-memory-root-"));
    const main = mkdtempSync(join(tmpdir(), "pos-main-"));
    const worktree = mkdtempSync(join(tmpdir(), "pos-wt-"));
    mkdirSync(join(main, ".git"), { recursive: true });
    mkdirSync(join(main, ".git", "worktrees", "wt"), { recursive: true });
    writeFileSync(join(main, ".git", "worktrees", "wt", "commondir"), "../..\n", "utf8");
    writeFileSync(
      join(worktree, ".git"),
      `gitdir: ${join(main, ".git", "worktrees", "wt")}\n`,
      "utf8",
    );
    const mainStore = new AgentMemoryStore({ root, workspaceRoot: main });
    const linked = new AgentMemoryStore({ root, workspaceRoot: worktree });
    mainStore.saveSettings({ enabled: true, useMemories: true });
    mainStore.applyCandidate({ op: "upsert", text: "shared preference" });
    expect(linked.injectionMarkdown()).toContain("shared preference");
    linked.saveSettings({ enabled: true, useMemories: true, isolateByCheckout: true });
    expect(linked.injectionMarkdown()).not.toContain("shared preference");
    expect(mainStore.injectionMarkdown()).not.toContain("shared preference");
    mainStore.applyCandidate({ op: "upsert", text: "checkout only" });
    expect(linked.injectionMarkdown()).not.toContain("checkout only");
    expect(mainStore.injectionMarkdown()).toContain("checkout only");
  });

  it("dedupes on consolidate and keeps an explicit user source", () => {
    const memory = store();
    memory.saveSettings({ enabled: true, useMemories: true });
    memory.applyCandidate({ op: "upsert", text: "use bun", sourceRunId: "run_1" });
    memory.applyCandidate({ op: "upsert", text: "use bun" });
    memory.setEntryState("use bun", "corroborated");
    memory.applyCandidate({ op: "upsert", text: "use bun", sourceRunId: "run_2" });
    const consolidated = memory.consolidate();
    const matches = consolidated.entries.filter((entry) => entry.text === "use bun");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.source).toBe("user");
    expect(matches[0]?.state).toBe("candidate");
  });

  it("stamps consolidate when neither duplicate came from the user", () => {
    const memory = store();
    memory.saveSettings({ enabled: true, generateMemories: true, useMemories: true });
    memory.proposeObserved({
      type: "project",
      text: "prefer small diffs",
      sourceRunId: "run_a",
    });
    memory.setEntryState("prefer small diffs", "superseded");
    memory.proposeObserved({
      type: "project",
      text: "prefer small diffs",
      sourceRunId: "run_b",
    });
    const consolidated = memory.consolidate();
    const matches = consolidated.entries.filter((entry) => entry.text === "prefer small diffs");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.source).toBe("consolidate");
  });

  it("keeps observed proposals out of the injected index", () => {
    const memory = store();
    memory.saveSettings({ enabled: true, generateMemories: true, useMemories: true });
    const notice = memory.proposeObserved({
      type: "feedback",
      text: "the user wants shorter answers",
      sourceRunId: "run_ok",
    });
    expect(notice.accepted).toBe(true);
    expect(memory.load().entries[0]?.state).toBe("observed");
    expect(memory.injectionMarkdown()).not.toContain("shorter answers");
    const snapshot = memory.injectionSnapshot();
    expect(snapshot.entryCount).toBe(0);
    expect(snapshot.markdown).toBe("");
  });
});

describe("memory instruction assembly", () => {
  it("places the memory fence after rules and before skills", () => {
    const text = buildHarnessInstructions({
      baseSystemPrompt: "Base.",
      mode: "ask",
      rulesMarkdown: "Use pnpm.",
      memoryIndexMarkdown: "- use bun [type: user; state: candidate; source: user; added: 2026-10-19; topic: user_preferences.md]",
      skillBodies: [{ name: "review", body: "Small diffs." }],
    });
    const rulesAt = text.indexOf("## Project Rules");
    const memoryAt = text.indexOf("## Personal memory");
    const skillsAt = text.indexOf("## Active Skills");
    expect(rulesAt).toBeGreaterThan(-1);
    expect(memoryAt).toBeGreaterThan(rulesAt);
    expect(skillsAt).toBeGreaterThan(memoryAt);
    expect(text).toContain("not instructions, not permissions");
    expect(renderMemoryFence("")).toBe("");
  });
});
