import { afterEach, describe, expect, it, vi } from "vitest";

import { AppQuitCoordinator } from "./appQuitCoordinator.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("AppQuitCoordinator", () => {
  it("allows one reentrant app.quit only after cleanup succeeds", async () => {
    const harness = createHarness();
    const event = { preventDefault: vi.fn() };

    harness.coordinator.handleBeforeQuit(event);
    await settle();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(harness.cleanup.deactivate).toHaveBeenCalledOnce();
    expect(harness.app.quit).toHaveBeenCalledOnce();
    const reentrant = { preventDefault: vi.fn() };
    harness.coordinator.handleBeforeQuit(reentrant);
    expect(reentrant.preventDefault).not.toHaveBeenCalled();
    expect(harness.cleanup.deactivate).toHaveBeenCalledOnce();
  });

  it("retries a bounded number of times then force-exits after persistent failure", async () => {
    vi.useFakeTimers();
    const failure = new Error("cleanup failed");
    const harness = createHarness({
      deactivate: vi.fn(async () => { throw failure; }),
      maxAttempts: 2,
      retryDelayMs: 50,
      attemptTimeoutMs: 100,
      absoluteTimeoutMs: 500,
    });

    harness.coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    await vi.runAllTimersAsync();

    expect(harness.cleanup.deactivate).toHaveBeenCalledTimes(2);
    expect(harness.cleanup.stopSync).toHaveBeenCalledOnce();
    expect(harness.app.quit).not.toHaveBeenCalled();
    expect(harness.app.exit).toHaveBeenCalledOnce();
    expect(harness.app.exit).toHaveBeenCalledWith(1);
  });

  it("force-exits on the absolute deadline when cleanup never settles", async () => {
    vi.useFakeTimers();
    const harness = createHarness({
      deactivate: vi.fn(() => new Promise<void>(() => undefined)),
      maxAttempts: 4,
      attemptTimeoutMs: 1_000,
      absoluteTimeoutMs: 250,
    });

    harness.coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(250);

    expect(harness.cleanup.stopSync).toHaveBeenCalledOnce();
    expect(harness.app.exit).toHaveBeenCalledWith(1);
    expect(harness.app.quit).not.toHaveBeenCalled();
  });

  it("treats a second quit request as an explicit force-exit escape", async () => {
    const harness = createHarness({
      deactivate: vi.fn(() => new Promise<void>(() => undefined)),
    });
    harness.coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    const second = { preventDefault: vi.fn() };

    harness.coordinator.handleBeforeQuit(second);

    expect(second.preventDefault).toHaveBeenCalledOnce();
    expect(harness.cleanup.stopSync).toHaveBeenCalledOnce();
    expect(harness.app.exit).toHaveBeenCalledWith(1);
  });

  it("allows the default process-tree cleanup budget to finish without a spurious retry", async () => {
    vi.useFakeTimers();
    const deactivate = vi.fn(() => new Promise<void>((resolve) => {
      setTimeout(resolve, 3_500);
    }));
    const harness = createHarness({ deactivate });

    harness.coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(3_500);

    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(harness.app.quit).toHaveBeenCalledOnce();
    expect(harness.app.exit).not.toHaveBeenCalled();
  });
});

function createHarness(options: {
  deactivate?: ReturnType<typeof vi.fn>;
  maxAttempts?: number;
  retryDelayMs?: number;
  attemptTimeoutMs?: number;
  absoluteTimeoutMs?: number;
} = {}) {
  const app = { quit: vi.fn(), exit: vi.fn() };
  const cleanup = {
    deactivate: options.deactivate ?? vi.fn(async () => undefined),
    stopSync: vi.fn(),
  };
  const coordinator = new AppQuitCoordinator(app, cleanup, {
    ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
    ...(options.retryDelayMs === undefined ? {} : { retryDelayMs: options.retryDelayMs }),
    ...(options.attemptTimeoutMs === undefined ? {} : {
      attemptTimeoutMs: options.attemptTimeoutMs,
    }),
    ...(options.absoluteTimeoutMs === undefined ? {} : {
      absoluteTimeoutMs: options.absoluteTimeoutMs,
    }),
  });
  return { app, cleanup, coordinator };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
