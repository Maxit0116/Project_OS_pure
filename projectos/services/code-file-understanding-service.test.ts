import { describe, expect, it } from "vitest";

import {
  hashFileContent,
  parseCodeFileUnderstandingOutput,
  truncateSource,
} from "./code-file-understanding-service.js";

describe("code-file-understanding-service", () => {
  it("parses JSON description and role", () => {
    expect(
      parseCodeFileUnderstandingOutput(
        JSON.stringify({
          description:
            "Handles couple recording app startup wiring and registers global services.",
          role: "Owns Android Application entry wiring for the shell.",
        }),
      ),
    ).toEqual({
      description:
        "Handles couple recording app startup wiring and registers global services.",
      role: "Owns Android Application entry wiring for the shell.",
    });
  });

  it("parses fenced JSON and rejects duplicate description/role", () => {
    expect(
      parseCodeFileUnderstandingOutput(
        '```json\n{"description":"Same","role":"Same"}\n```',
      ),
    ).toBeNull();
  });

  it("hashes content stably and truncates long sources", () => {
    expect(hashFileContent("abc")).toBe(hashFileContent("abc"));
    expect(hashFileContent("abc")).not.toBe(hashFileContent("abd"));
    const long = "x".repeat(10_000);
    expect(truncateSource(long).length).toBeLessThan(long.length);
    expect(truncateSource(long)).toContain("truncated");
  });
});
