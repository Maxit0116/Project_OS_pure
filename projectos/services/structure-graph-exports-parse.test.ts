import { describe, expect, it } from "vitest";
import { parseExports } from "./structure-graph-l2.js";

describe("parseExports", () => {
  it("extracts named and default exports from TypeScript", () => {
    const source = `
      export function build() {}
      export const VALUE = 1
      export type Foo = string
      export { helper as util }
      export default class App {}
    `;
    const names = parseExports(source);
    expect(names).toEqual(
      expect.arrayContaining(["build", "VALUE", "Foo", "helper", "default"]),
    );
  });
});
