import { describe, expect, it } from "vitest";

import { childValidationCoversParentAcceptance } from "./single-file-batch-coverage.js";

const parent = ["Keep package name", "Append only one comment"];

describe("childValidationCoversParentAcceptance", () => {
  it("accepts a complete positive match of parent criteria", () => {
    expect(
      childValidationCoversParentAcceptance({
        parentAcceptanceCriteria: parent,
        childCriteria: [
          { criterion: "Keep package name", status: "satisfied" },
          { criterion: "Append only one comment", status: "satisfied" },
        ],
        childVerdict: "valid",
        childPath: "macos/Package.swift",
        parentPath: "macos/Package.swift",
        scopeStatus: "compliant",
      }),
    ).toBe(true);
  });

  it("rejects when a parent criterion is missing from the child", () => {
    expect(
      childValidationCoversParentAcceptance({
        parentAcceptanceCriteria: parent,
        childCriteria: [
          { criterion: "Keep package name", status: "satisfied" },
          { criterion: "Unrelated paraphrased goal", status: "satisfied" },
        ],
        childVerdict: "valid",
        childPath: "macos/Package.swift",
        parentPath: "macos/Package.swift",
        scopeStatus: "compliant",
      }),
    ).toBe(false);
  });

  it("rejects partial child criteria (length mismatch)", () => {
    expect(
      childValidationCoversParentAcceptance({
        parentAcceptanceCriteria: parent,
        childCriteria: [{ criterion: "Keep package name", status: "satisfied" }],
        childVerdict: "valid",
        childPath: "macos/Package.swift",
        parentPath: "macos/Package.swift",
        scopeStatus: "compliant",
      }),
    ).toBe(false);
  });

  it("rejects duplicate child criteria that would mask a missing parent criterion", () => {
    expect(
      childValidationCoversParentAcceptance({
        parentAcceptanceCriteria: parent,
        childCriteria: [
          { criterion: "Keep package name", status: "satisfied" },
          { criterion: "Keep package name", status: "satisfied" },
        ],
        childVerdict: "valid",
        childPath: "macos/Package.swift",
        parentPath: "macos/Package.swift",
        scopeStatus: "compliant",
      }),
    ).toBe(false);
  });

  it("rejects unsatisfied child criteria even when texts match", () => {
    expect(
      childValidationCoversParentAcceptance({
        parentAcceptanceCriteria: parent,
        childCriteria: [
          { criterion: "Keep package name", status: "satisfied" },
          { criterion: "Append only one comment", status: "unsatisfied" },
        ],
        childVerdict: "valid",
        childPath: "macos/Package.swift",
        parentPath: "macos/Package.swift",
        scopeStatus: "compliant",
      }),
    ).toBe(false);
  });

  it("rejects when child verdict is not valid (budget/JSON failure must not promote)", () => {
    expect(
      childValidationCoversParentAcceptance({
        parentAcceptanceCriteria: parent,
        childCriteria: [
          { criterion: "Keep package name", status: "satisfied" },
          { criterion: "Append only one comment", status: "satisfied" },
        ],
        childVerdict: "invalid",
        childPath: "macos/Package.swift",
        parentPath: "macos/Package.swift",
        scopeStatus: "compliant",
      }),
    ).toBe(false);
  });
});
