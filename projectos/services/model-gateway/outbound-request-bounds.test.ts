import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectOSError } from "../../errors.js";
import { createFileOutboundBudget } from "./outbound-budget.js";
import {
  LIVE_BATCH_DEFAULT_MAX_INPUT_CHARS,
  LIVE_BATCH_DEFAULT_MAX_OUTPUT_TOKENS,
  LIVE_BATCH_DEFAULT_SESSION_CAP,
  OUTBOUND_MAX_INPUT_CHARS_ENV,
  OUTBOUND_MAX_OUTPUT_TOKENS_ENV,
  OUTBOUND_SESSION_CAP_ENV,
  applyOutboundRequestBounds,
  resolveOutboundRequestBoundsFromEnv,
  withOutboundSessionCap,
} from "./outbound-request-bounds.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("outbound-request-bounds", () => {
  it("resolves nothing when env unset (daily desktop unchanged)", () => {
    expect(resolveOutboundRequestBoundsFromEnv({})).toBeNull();
  });

  it("resolves live-batch defaults from env integers", () => {
    const bounds = resolveOutboundRequestBoundsFromEnv({
      [OUTBOUND_MAX_OUTPUT_TOKENS_ENV]: String(LIVE_BATCH_DEFAULT_MAX_OUTPUT_TOKENS),
      [OUTBOUND_MAX_INPUT_CHARS_ENV]: String(LIVE_BATCH_DEFAULT_MAX_INPUT_CHARS),
      [OUTBOUND_SESSION_CAP_ENV]: String(LIVE_BATCH_DEFAULT_SESSION_CAP),
    });
    expect(bounds).toEqual({
      maxOutputTokens: LIVE_BATCH_DEFAULT_MAX_OUTPUT_TOKENS,
      maxInputChars: LIVE_BATCH_DEFAULT_MAX_INPUT_CHARS,
      sessionCap: LIVE_BATCH_DEFAULT_SESSION_CAP,
    });
  });

  it("clamps maxOutputTokens and refuses oversized input fail-closed", () => {
    const clamped = applyOutboundRequestBounds(
      { userPrompt: "hi", maxOutputTokens: 8192 },
      { maxOutputTokens: 2048, maxInputChars: 100 },
    );
    expect(clamped.maxOutputTokens).toBe(2048);

    try {
      applyOutboundRequestBounds(
        { userPrompt: "x".repeat(101) },
        { maxInputChars: 100 },
      );
      expect.unreachable("expected fail-closed on oversized input");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectOSError);
      expect((error as ProjectOSError).code).toBe("model_outbound_budget_exhausted");
      expect((error as ProjectOSError).details).toMatchObject({
        bound: "max_input_chars",
        inputChars: 101,
        maxInputChars: 100,
      });
    }
  });

  it("session cap blocks further reserves after N while ledger slot stays consumed", () => {
    const dir = mkdtempSync(join(tmpdir(), "pos-outbound-session-cap-"));
    tempDirs.push(dir);
    const path = join(dir, "ledger.json");
    const base = createFileOutboundBudget(path, 100);
    const gated = withOutboundSessionCap(base, 2);

    gated.reserve();
    gated.reserve();
    try {
      gated.reserve();
      expect.unreachable("expected session cap exhaustion");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectOSError);
      expect((error as ProjectOSError).code).toBe("model_outbound_budget_exhausted");
      expect((error as ProjectOSError).details).toMatchObject({
        bound: "session_cap",
        sessionCap: 2,
        sessionReserves: 2,
      });
    }
    expect(gated.snapshot().reservations).toHaveLength(2);
  });
});
