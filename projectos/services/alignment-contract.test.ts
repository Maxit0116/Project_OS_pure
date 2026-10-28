import { describe, expect, it } from "vitest";

import type { PromptRefinement } from "../contracts/prompt-refinement.js";
import {
  applyAlignmentConfirmation,
  buildUnderstoodFromAlignment,
  canSkipAlignment,
  ensureAlignmentOnRefinement,
  isAlignmentReadyToConfirm,
  synthesizeAlignmentFromLegacy,
} from "./alignment-contract.js";

function baseRefinement(overrides: Partial<PromptRefinement> = {}): PromptRefinement {
  return {
    id: "ref_1",
    understood: "Add a save button. Persist drafts to local storage.",
    ambiguities: ["Also update the empty state copy?"],
    suggestions: ["Keep the existing button style", "Introduce a new primary CTA"],
    affectedNodeIds: ["node_a"],
    affectedFiles: ["src/SaveBar.tsx"],
    confidence: 0.8,
    mode: "deterministic_fixture",
    ...overrides,
  };
}

describe("alignment-contract helpers", () => {
  it("synthesizes stated + guess items from legacy refinement fields", () => {
    const alignment = synthesizeAlignmentFromLegacy(baseRefinement());
    expect(alignment.items.some((item) => item.kind === "stated" && item.selected)).toBe(true);
    expect(alignment.items.some((item) => item.kind === "guess" && !item.selected)).toBe(true);
    expect(alignment.questions.length).toBeGreaterThanOrEqual(1);
    expect(alignment.questions[0]?.blocking).toBe(true);
  });

  it("blocks confirm when no items selected or blocking answers missing", () => {
    const refinement = ensureAlignmentOnRefinement(baseRefinement());
    const contract = refinement.alignment!;
    const noneSelected = contract.items.map((item) => ({
      id: item.id,
      selected: false,
    }));
    expect(isAlignmentReadyToConfirm(contract, noneSelected, []).ok).toBe(false);

    const allSelected = contract.items.map((item) => ({
      id: item.id,
      selected: true,
    }));
    expect(isAlignmentReadyToConfirm(contract, allSelected, []).ok).toBe(false);
  });

  it("applies confirmation into understood brief with exclusions and decisions", () => {
    const refinement = ensureAlignmentOnRefinement(
      baseRefinement({
        ambiguities: [],
        suggestions: [],
        affectedFiles: ["a.ts"],
      }),
    );
    const contract = refinement.alignment!;
    const stated = contract.items.filter((item) => item.kind === "stated");
    expect(stated.length).toBeGreaterThanOrEqual(1);

    const confirmed = applyAlignmentConfirmation(refinement, {
      refinementId: refinement.id,
      contractId: contract.id,
      items: [
        { id: stated[0]!.id, selected: true, comment: "Use existing tokens" },
        ...stated.slice(1).map((item) => ({ id: item.id, selected: false })),
      ],
      answers: [],
    });

    expect(confirmed.alignment?.status).toBe("confirmed");
    expect(confirmed.understood).toContain("Confirmed requirements:");
    expect(confirmed.understood).toContain("Use existing tokens");
    expect(canSkipAlignment(confirmed)).toBe(true);
  });

  it("buildUnderstood lists unconfirmed guesses as negative constraints", () => {
    const brief = buildUnderstoodFromAlignment({
      version: "0.1.0",
      id: "align_x",
      items: [
        { id: "s1", kind: "stated", text: "Add export", selected: true },
        { id: "g1", kind: "guess", text: "Also redesign settings", selected: false },
      ],
      questions: [
        {
          id: "q1",
          question: "Where to put the control?",
          topic: "ux",
          blocking: true,
          answer: "In the toolbar",
          selectedOptionId: "opt_a",
          options: [
            { id: "opt_a", label: "Toolbar" },
            { id: "opt_b", label: "Menu" },
          ],
        },
      ],
      status: "confirmed",
    });
    expect(brief).toContain("Do not implement these unconfirmed guesses:");
    expect(brief).toContain("Design decisions:");
    expect(brief).toContain("In the toolbar");
  });

  it("canSkipAlignment is false when multiple files or low confidence", () => {
    const multiFile = ensureAlignmentOnRefinement(
      baseRefinement({
        ambiguities: [],
        suggestions: [],
        affectedFiles: ["a.ts", "b.ts"],
        confidence: 0.9,
      }),
    );
    // synthesizer adds a scope question for multi-file — unanswered blocking blocks skip
    expect(canSkipAlignment(multiFile)).toBe(false);

    const lowConfidence = ensureAlignmentOnRefinement(
      baseRefinement({
        understood: "Rename label",
        ambiguities: [],
        suggestions: [],
        affectedFiles: ["a.ts"],
        confidence: 0.4,
      }),
    );
    expect(canSkipAlignment(lowConfidence)).toBe(false);
  });
});
