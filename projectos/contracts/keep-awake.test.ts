import { describe, expect, it } from "vitest";

import {
  parseKeepAwakeMode,
  shouldReportAgentActivity,
} from "./keep-awake.js";

describe("keep-awake contract helpers", () => {
  it("parses known modes and defaults unknown to off", () => {
    expect(parseKeepAwakeMode("while_app_open")).toBe("while_app_open");
    expect(parseKeepAwakeMode("nope")).toBe("off");
    expect(parseKeepAwakeMode(null)).toBe("off");
  });

  it("reports agent activity from flow, refine, ask, or plan", () => {
    expect(
      shouldReportAgentActivity({
        flowStatus: "idle",
        refineLoading: false,
      }),
    ).toBe(false);
    expect(
      shouldReportAgentActivity({
        flowStatus: "running",
        refineLoading: false,
      }),
    ).toBe(true);
    expect(
      shouldReportAgentActivity({
        flowStatus: "idle",
        refineLoading: true,
      }),
    ).toBe(true);
    expect(
      shouldReportAgentActivity({
        flowStatus: "idle",
        refineLoading: false,
        askTraceStatus: "running",
      }),
    ).toBe(true);
    expect(
      shouldReportAgentActivity({
        flowStatus: "idle",
        refineLoading: false,
        planTraceStatus: "running",
      }),
    ).toBe(true);
  });
});
