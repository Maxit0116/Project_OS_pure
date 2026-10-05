import { afterEach, describe, expect, it, vi } from "vitest";

import { IpcTransport } from "./IpcTransport.js";
import { NotConnectedTransport } from "./NotConnectedTransport.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("IpcTransport low-level error handling", () => {
  it("handles rejected stream subscription lifecycle promises", async () => {
    const onAsyncError = vi.fn();
    const disposeEvent = vi.fn();
    vi.stubGlobal("window", {
      projectOS: {
        onRunEvent: vi.fn(() => ({ dispose: disposeEvent })),
        streamSubscribe: vi.fn(async () => {
          throw serializedError("stream subscribe failed");
        }),
        streamUnsubscribe: vi.fn(async () => {
          throw serializedError("stream unsubscribe failed");
        }),
      },
    });
    const transport = new IpcTransport(1_000, onAsyncError);

    const subscription = transport.streamAgentRun("run_one", vi.fn());
    await settle();
    subscription.dispose();
    await settle();

    expect(disposeEvent).toHaveBeenCalledOnce();
    expect(onAsyncError).toHaveBeenCalledTimes(2);
    expect(onAsyncError.mock.calls.map(([operation]) => operation)).toEqual([
      "streamSubscribe",
      "streamUnsubscribe",
    ]);
    expect(onAsyncError.mock.calls[0]?.[1]).toMatchObject({
      code: "transport_not_connected",
      message: "stream subscribe failed",
    });
  });

  it("routes fallback notices through invoke translation", async () => {
    vi.stubGlobal("window", {
      projectOS: {
        invoke: vi.fn(async () => {
          throw serializedError("notice failed");
        }),
      },
    });

    await expect(new IpcTransport(1_000).consumeFallbackNotice("project_one"))
      .rejects.toMatchObject({
        code: "transport_not_connected",
        message: "notice failed",
      });
  });

  it("treats a fallback notice as absent when no transport is connected", async () => {
    await expect(new NotConnectedTransport().consumeFallbackNotice("project_one"))
      .resolves.toBeUndefined();
  });

  it("invokes recordProposedFileTimeline with the method name before the project id", async () => {
    const ipcInvoke = vi.fn(async () => []);
    vi.stubGlobal("window", {
      projectOS: {
        invoke: ipcInvoke,
      },
    });

    await new IpcTransport(1_000).recordProposedFileTimeline(
      "a41ce3a4-8ba8-43ec-9ad6-285811867d28",
      "run_one",
      [{ path: "app/page.tsx", before: "a", after: "b" }],
    );

    expect(ipcInvoke).toHaveBeenCalledWith(
      "recordProposedFileTimeline",
      "a41ce3a4-8ba8-43ec-9ad6-285811867d28",
      "run_one",
      [{ path: "app/page.tsx", before: "a", after: "b" }],
    );
  });
});

function serializedError(message: string): Record<string, unknown> {
  return {
    __projectOsError: true,
    code: "transport_not_connected",
    message,
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
