import { describe, expect, it } from "vitest";
import {
  buildLabJourneyPrompt,
  inferJourneyFailureFromAgentText,
} from "./journey.js";
import { startLabSession, createEmptyLabDocument } from "./session-ops.js";

describe("product-lab journey", () => {
  it("builds a prompt with steps and start url", () => {
    const started = startLabSession(createEmptyLabDocument(), {
      projectId: "p1",
      scopeNodeIds: ["signup"],
      previewUrl: "http://localhost:5173/signup",
    });
    const prompt = buildLabJourneyPrompt(started.session, {
      label: "Acceptance · Signup",
      startUrl: "http://localhost:5173/signup",
      source: "acceptance",
      steps: [{ id: "1", label: "Fill company size", hint: "required" }],
    });
    expect(prompt).toContain("Playwright MCP");
    expect(prompt).toContain("Fill company size");
    expect(prompt).toContain("http://localhost:5173/signup");
  });

  it("infers journey failure markers", () => {
    expect(inferJourneyFailureFromAgentText("JOURNEY_PASSED").failed).toBe(
      false,
    );
    expect(
      inferJourneyFailureFromAgentText("JOURNEY_FAILED\nStep 2 blew up").failed,
    ).toBe(true);
  });
});
