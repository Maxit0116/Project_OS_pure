import { describe, expect, it } from "vitest";

import { assembleRunContext } from "./context-assembly.js";
import { buildHarnessInstructions } from "./harness/instructions.js";
import {
  UNTRUSTED_CONTENT_CATALOG,
  UNTRUSTED_CONTEXT_SOURCES,
  projectRulesSection,
} from "./harness/untrusted-context.js";

const harness = {
  baseSystemPrompt: "You are the change agent.",
  mode: "change" as const,
  rulesMarkdown: "Always run typecheck after edits.",
};

describe("assembleRunContext", () => {
  it("keeps the harness prompt byte-for-byte and hashes stably", () => {
    const first = assembleRunContext({ harness });
    const second = assembleRunContext({ harness });
    expect(first.instructions).toBe(buildHarnessInstructions(harness));
    expect(first.assembly.contentHash).toBe(second.assembly.contentHash);
    expect(first.assembly.assemblyId).toBe(second.assembly.assemblyId);
    expect(first.assembly.slots.retrieval.searched).toBe(false);
    expect(first.assembly.slots.retrieval.chars).toBe(0);
    expect(first.assembly.slots.pins.sha256).toBe(first.assembly.slots.session.sha256);
  });

  it("reserves selected-file bytes and pin characters without storing bodies", () => {
    const pins = "Pinned file body that must stay reserved.";
    const quote = "retrieval quote that must not be stored";
    const assembled = assembleRunContext({
      harness,
      bundle: {
        bundleHash: "sha256:" + "ab".repeat(32),
        fileManifest: [
          { relationship: "selected", includedByteLength: 120 },
          { relationship: "connected", includedByteLength: 40 },
        ],
      },
      pinsMarkdown: pins,
      retrieval: { searched: true, fence: quote },
    });
    expect(assembled.assembly.reserved).toBe(120 + pins.length);
    expect(assembled.assembly.slots.scope.chars).toBe(160);
    expect(assembled.assembly.slots.retrieval.searched).toBe(true);
    const replay = JSON.stringify(assembled.assembly);
    expect(replay).not.toContain(harness.rulesMarkdown);
    expect(replay).not.toContain(quote);
    expect(replay).not.toContain(pins);
    expect(replay).toContain(assembled.assembly.slots.retrieval.sha256);
    expect(replay).toContain(assembled.assembly.slots.instructions.sha256);
    expect(replay).toContain(assembled.assembly.slots.scope.sha256);
    expect(replay).toContain(assembled.assembly.slots.pins.sha256);
    expect(replay).toContain(assembled.assembly.slots.memory.sha256);
    expect(replay).toContain(assembled.assembly.slots.session.sha256);
  });

  it("records a leaf change as an unsearched retrieval slot", () => {
    const assembled = assembleRunContext({
      harness: { ...harness, mode: "change", memoryIndexMarkdown: "prefer bun" },
      retrieval: null,
      memoryMarkdown: "prefer bun",
    });
    expect(assembled.assembly.slots.retrieval.searched).toBe(false);
    expect(assembled.assembly.slots.memory.chars).toBe("prefer bun".length);
    expect(assembled.instructions).toContain("prefer bun");
    expect(JSON.stringify(assembled.assembly)).not.toContain("prefer bun");
  });

  it("hashes a task appendix into the retrieval slot without putting it in the rules", () => {
    const appendix = "## Task appendix (read-only)\n- src/use-login.ts";
    const first = assembleRunContext({ harness, appendixMarkdown: appendix });
    const replay = assembleRunContext({ harness, appendixMarkdown: appendix });
    const without = assembleRunContext({ harness });
    expect(first.assembly.contentHash).toBe(replay.assembly.contentHash);
    expect(first.assembly.contentHash).not.toBe(without.assembly.contentHash);
    expect(first.instructions).toBe(without.instructions);
    expect(first.instructions).not.toContain("use-login");
    expect(projectRulesSection(first.instructions)).not.toContain("use-login");
    expect(UNTRUSTED_CONTENT_CATALOG.external_doc.enabledByDefault).toBe(false);
    expect(UNTRUSTED_CONTENT_CATALOG.web_or_mcp_text.enabledByDefault).toBe(false);
    expect(UNTRUSTED_CONTEXT_SOURCES).toContain("task_appendix");
    expect(UNTRUSTED_CONTEXT_SOURCES).toEqual([
      "function_graph",
      "project_description",
      "file_body",
      "retrieval_quote",
      "external_doc",
      "memory_index",
      "session_summary",
      "tool_output",
      "web_or_mcp_text",
      "task_appendix",
    ]);

    const memory = "UNTRUSTED_MEMORY_INDEX";
    const quote = "UNTRUSTED_RETRIEVAL_QUOTE";
    const fileBody = "UNTRUSTED_FILE_BODY";
    const session = "UNTRUSTED_SESSION_SUMMARY";
    const assembled = assembleRunContext({
      harness: { ...harness, memoryIndexMarkdown: memory },
      pinsMarkdown: fileBody,
      retrieval: { searched: true, fence: quote },
      sessionMarkdown: session,
      memoryMarkdown: memory,
    });
    const rules = projectRulesSection(assembled.instructions);
    expect(rules).toContain(harness.rulesMarkdown);
    expect(rules).not.toContain(memory);
    expect(rules).not.toContain(quote);
    expect(rules).not.toContain(fileBody);
    expect(rules).not.toContain(session);
    expect(assembled.instructions).toContain(memory);
    expect(assembled.instructions).not.toContain(quote);
    expect(assembled.instructions).not.toContain(fileBody);
    expect(assembled.instructions).not.toContain(session);
  });
});
