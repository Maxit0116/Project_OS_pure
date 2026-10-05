import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebContents } from "electron";

import type { ProjectOSLocalApi } from "../../../services/project-os-local-api.js";

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  failHandle: undefined as string | undefined,
}));

const singleton = vi.hoisted(() => ({
  projectOs: undefined as unknown,
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((
      channel: string,
      handler: (...args: unknown[]) => unknown,
    ) => {
      if (channel === electron.failHandle) {
        throw new Error(`handler install failed: ${channel}`);
      }
      if (electron.handlers.has(channel)) {
        throw new Error(`duplicate handler: ${channel}`);
      }
      electron.handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      electron.handlers.delete(channel);
    }),
  },
}));

vi.mock("./ipcSenderTrust.js", () => ({
  assertTrustedHostRenderer: vi.fn(),
}));

vi.mock("./projectOsService.js", () => ({
  getProjectOsService: vi.fn(() => singleton.projectOs),
}));

import { PROJECTOS_IPC_METHODS } from "./ipcArgumentValidation.js";
import {
  disposeStreamSubscriptionsForWebContents,
  installProjectOsProductionIpc,
  registerProjectOsIpc,
} from "./registerProjectOsIpc.js";

beforeEach(() => {
  electron.handlers.clear();
  electron.failHandle = undefined;
});

describe("ProjectOS production IPC installer", () => {
  it("preserves workspace and external-restore coordination through explicit owners", async () => {
    const owners = createOwners();
    const dispose = installProjectOsProductionIpc(owners.projectOs);

    const opened = await requireHandler("projectos:openSampleWorkspace")(
      event(71),
    );
    expect(opened).toEqual({ projectId: "project_1" });

    await expect(requireHandler("projectos:restoreApplyBackup")(
      event(71),
      "project_1",
      "backup_1",
    )).resolves.toMatchObject({
      outcome: "restored",
      backupId: "backup_1",
    });
    expect(owners.projectOs.restoreApplyBackup)
      .toHaveBeenCalledWith("project_1", "backup_1");

    dispose();
  });

  it("owns subscriptions per installer and remains compatible with window cleanup", () => {
    const owners = createOwners();
    const dispose = installProjectOsProductionIpc(owners.projectOs);
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    owners.projectOs.streamAgentRun
      .mockReturnValueOnce({ dispose: firstDispose })
      .mockReturnValueOnce({ dispose: secondDispose });

    const sender = event(72).sender;
    expect(requireHandler("projectos:streamSubscribe")(
      { sender },
      "run_1",
    )).toBe("72:run_1");
    expect(requireHandler("projectos:streamSubscribe")(
      { sender },
      "run_1",
    )).toBe("72:run_1");
    expect(firstDispose).toHaveBeenCalledTimes(1);

    disposeStreamSubscriptionsForWebContents(sender);
    expect(secondDispose).toHaveBeenCalledTimes(1);

    const thirdDispose = vi.fn();
    owners.projectOs.streamAgentRun.mockReturnValueOnce({
      dispose: thirdDispose,
    });
    requireHandler("projectos:streamSubscribe")({ sender }, "run_2");

    dispose();
    dispose();
    expect(thirdDispose).toHaveBeenCalledTimes(1);
    expect(electron.handlers.size).toBe(0);
  });

  it("rolls back a partial install and keeps the singleton startup wrapper", () => {
    const failedOwners = createOwners();
    electron.failHandle = "projectos:streamUnsubscribe";

    expect(() => installProjectOsProductionIpc(failedOwners.projectOs))
      .toThrow(/handler install failed/u);
    expect(electron.handlers.size).toBe(0);

    electron.failHandle = undefined;
    const singletonOwners = createOwners();
    singleton.projectOs = singletonOwners.projectOs;
    registerProjectOsIpc();

    expect([...electron.handlers.keys()].sort()).toEqual([
      ...PROJECTOS_IPC_METHODS.map((method) => `projectos:${method}`),
      "projectos:streamSubscribe",
      "projectos:streamUnsubscribe",
    ].sort());
  });
});

function createOwners(): {
  projectOs: ProjectOSLocalApi & {
    openSampleWorkspace: ReturnType<typeof vi.fn>;
    restoreApplyBackup: ReturnType<typeof vi.fn>;
    streamAgentRun: ReturnType<typeof vi.fn>;
  };
} {
  const projectOs = {
    openSampleWorkspace: vi.fn(async () => ({ projectId: "project_1" })),
    getLoadedWorkspaceIdentity: vi.fn(() => ({ projectId: "project_1" })),
    restoreApplyBackup: vi.fn(async (
      _projectId: string,
      backupId: string,
    ) => ({
      backupId,
      restored: true as const,
      filesRestored: ["app/page.tsx"],
      outcome: "restored" as const,
    })),
    undoGreenfieldInitialization: vi.fn(),
    streamAgentRun: vi.fn(),
  } as unknown as ReturnType<typeof createOwners>["projectOs"];
  return { projectOs };
}

function requireHandler(channel: string): (...args: unknown[]) => unknown {
  const handler = electron.handlers.get(channel);
  if (!handler) throw new Error(`Missing handler: ${channel}`);
  return handler;
}

function event(id: number): {
  sender: WebContents;
} {
  return {
    sender: {
      id,
      isDestroyed: () => false,
      send: vi.fn(),
    } as unknown as WebContents,
  };
}
