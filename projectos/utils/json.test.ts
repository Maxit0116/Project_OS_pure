import { describe, expect, it } from "vitest";

import { cloneJson } from "./json.js";

describe("cloneJson", () => {
  it("creates an independent deep copy", () => {
    const source = { nested: { count: 1 }, values: ["first"] };
    const clone = cloneJson(source);

    clone.nested.count = 2;
    clone.values.push("second");

    expect(source).toEqual({ nested: { count: 1 }, values: ["first"] });
  });

  it("preserves JSON round-trip normalization", () => {
    const source = {
      omitted: undefined,
      values: [undefined],
      createdAt: new Date("2026-07-16T00:00:00.000Z"),
    };

    expect(cloneJson(source)).toEqual({
      values: [null],
      createdAt: "2026-07-16T00:00:00.000Z",
    });
    expect(() => cloneJson(undefined)).toThrow();
  });
});
