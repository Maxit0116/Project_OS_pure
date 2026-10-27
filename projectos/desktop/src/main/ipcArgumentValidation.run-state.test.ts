import { describe, expect, it } from "vitest";
import {
  assertProjectOsIpcArgs,
  PROJECTOS_IPC_METHODS,
} from "./ipcArgumentValidation.js";

describe("run-state IPC validation", () => {
  it("exposes decision and checkpoint methods with strict argument shapes", () => {
    expect(PROJECTOS_IPC_METHODS).toEqual(expect.arrayContaining([
      "listRunDecisions",
      "resolveRunDecision",
      "getRunCheckpoint",
    ]));
    expect(() => assertProjectOsIpcArgs("listRunDecisions", ["project", "run"])).not.toThrow();
    expect(() => assertProjectOsIpcArgs("getRunCheckpoint", ["project", "checkpoint"])).not.toThrow();
    expect(() => assertProjectOsIpcArgs("resolveRunDecision", [
      "project",
      "decision",
      1,
      { optionId: "continue" },
      undefined,
    ])).not.toThrow();
    expect(() => assertProjectOsIpcArgs("resolveRunDecision", [
      "project",
      "decision",
      "1",
      { optionId: "continue" },
      undefined,
    ])).toThrow(/Invalid arguments/);
  });
});
