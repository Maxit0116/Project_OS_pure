import { describe, expect, it, vi } from "vitest";

import { routeProjectOsExternalRestore } from "./projectOsExternalRestoreRouter.js";

const restored = {
  backupId: "backup_1",
  restored: true as const,
  filesRestored: ["app/page.tsx"],
  outcome: "restored" as const,
};

describe("project OS external restore router", () => {
  it.each([
    ["restoreApplyBackup", "backup_1"],
    ["undoGreenfieldInitialization", "run_1"],
  ] as const)("routes renderer-exposed %s to the local API", async (method, restoreId) => {
    const restoreApplyBackup = vi.fn(async () => restored);
    const undoGreenfieldInitialization = vi.fn(async () => restored);

    await expect(routeProjectOsExternalRestore({
      method,
      args: ["project_1", restoreId],
      projectOs: { restoreApplyBackup, undoGreenfieldInitialization },
    })).resolves.toEqual(restored);

    expect(restoreApplyBackup).toHaveBeenCalledTimes(
      method === "restoreApplyBackup" ? 1 : 0,
    );
    expect(undoGreenfieldInitialization).toHaveBeenCalledTimes(
      method === "undoGreenfieldInitialization" ? 1 : 0,
    );
  });

  it("does not intercept non-restore project methods", () => {
    expect(routeProjectOsExternalRestore({
      method: "getProjectGraph",
      args: ["project_1"],
      projectOs: {
        restoreApplyBackup: vi.fn(),
        undoGreenfieldInitialization: vi.fn(),
      },
    })).toBeUndefined();
  });

  it("fails closed when a restore service returns a non-contract result", async () => {
    const routed = routeProjectOsExternalRestore({
      method: "restoreApplyBackup",
      args: ["project_1", "backup_1"],
      projectOs: {
        restoreApplyBackup: vi.fn(async () => ({
          ...restored,
          rendererPath: "/tmp/forged",
        })),
        undoGreenfieldInitialization: vi.fn(),
      },
    });

    await expect(routed).rejects.toThrow();
  });

  it("rejects restore calls that omit the project or restore id", async () => {
    const restoreApplyBackup = vi.fn(async () => restored);
    expect(() => routeProjectOsExternalRestore({
      method: "restoreApplyBackup",
      args: ["project_1"],
      projectOs: {
        restoreApplyBackup,
        undoGreenfieldInitialization: vi.fn(),
      },
    })).toThrow(/Invalid arguments/u);
    expect(restoreApplyBackup).not.toHaveBeenCalled();
  });
});
