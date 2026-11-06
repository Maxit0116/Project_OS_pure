import { describe, expect, it } from "vitest";

import { ExecCommandSchema } from "./exec-command.js";

describe("the folder a command runs in", () => {
  const command = { command: "python3", args: ["-m", "pytest"], timeoutMs: 300_000 };

  it("is optional, and a folder inside the project when given", () => {
    expect(ExecCommandSchema.parse(command)).toEqual(command);
    for (const cwd of ["backend", "apps/web", "services/api.v2"]) {
      expect(ExecCommandSchema.parse({ ...command, cwd }).cwd).toBe(cwd);
    }
  });

  it("is never absolute, never climbs out, and has no empty or dot parts", () => {
    for (const cwd of ["/etc", "../other", "backend/../..", "a//b", "./backend", "a/./b", "C:/x", "a\\b", ""]) {
      expect(ExecCommandSchema.safeParse({ ...command, cwd }).success, cwd).toBe(false);
    }
  });
});
