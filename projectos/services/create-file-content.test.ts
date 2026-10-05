import { describe, expect, it } from "vitest";

import {
  CREATE_FILE_MAX_BYTES,
  validateCreateFileContent,
} from "./create-file-content.js";

describe("validateCreateFileContent", () => {
  it("accepts bounded multibyte UTF-8 content exactly", () => {
    const content = "export const 欢迎语 = '欢迎回来';\n";
    expect(new TextDecoder().decode(validateCreateFileContent(content, "src/copy.ts")))
      .toBe(content);
  });

  it.each([
    ["empty", "   \n"],
    ["NUL", "export const value = '\0';\n"],
    ["unpaired surrogate", "export const value = '\ud800';\n"],
    ["oversized", "x".repeat(CREATE_FILE_MAX_BYTES + 1)],
  ])("rejects %s generated content", (_label, content) => {
    expect(() => validateCreateFileContent(content, "src/new.ts"))
      .toThrow(/non-empty bounded UTF-8/u);
  });
});
