const DEFAULT_MAX_ATTEMPTS = 2;
// POSIX teardown may spend one 2s grace waiting for SIGTERM and another after
// SIGKILL. Keep the app-level attempt outside that owned cleanup budget.
const DEFAULT_ATTEMPT_TIMEOUT_MS = 4_500;
const DEFAULT_RETRY_DELAY_MS = 100;
const DEFAULT_ABSOLUTE_TIMEOUT_MS = 6_000;

export interface AppQuitEvent {
  preventDefault(): void;
}

export interface AppQuitPort {
  quit(): void;
  exit(exitCode: number): void;
}

export interface AppQuitCleanupPort {
  deactivate?(): Promise<void>;
  stopSync?(): void;
}

export interface AppQuitCoordinatorOptions {
  maxAttempts?: number;
  attemptTimeoutMs?: number;
  retryDelayMs?: number;
  absoluteTimeoutMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  onCleanupFailure?: (error: unknown) => void;
}

export class AppQuitCoordinator {
  private readonly maxAttempts: number;
  private readonly attemptTimeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly absoluteTimeoutMs: number;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private readonly onCleanupFailure: (error: unknown) => void;
  private state: "idle" | "cleaning" | "allow_quit" | "forced" = "idle";
  private generation = 0;
  private attempts = 0;
  private deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly app: AppQuitPort,
    private readonly cleanup: AppQuitCleanupPort,
    options: AppQuitCoordinatorOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.absoluteTimeoutMs = options.absoluteTimeoutMs ?? DEFAULT_ABSOLUTE_TIMEOUT_MS;
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
    this.onCleanupFailure = options.onCleanupFailure ?? (() => undefined);
    for (const [label, value] of [
      ["maxAttempts", this.maxAttempts],
      ["attemptTimeoutMs", this.attemptTimeoutMs],
      ["absoluteTimeoutMs", this.absoluteTimeoutMs],
    ] as const) {
      if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${label} must be a positive integer`);
      }
    }
    if (!Number.isInteger(this.retryDelayMs) || this.retryDelayMs < 0) {
      throw new Error("retryDelayMs must be a non-negative integer");
    }
  }

  handleBeforeQuit(event: AppQuitEvent): void {
    if (this.state === "allow_quit" || this.state === "forced") return;
    event.preventDefault();
    if (this.state === "cleaning") {
      this.forceExit(new Error("Application quit was requested again during cleanup"));
      return;
    }
    this.state = "cleaning";
    const generation = ++this.generation;
    this.deadlineTimer = this.setTimer(() => {
      if (this.state === "cleaning" && generation === this.generation) {
        this.forceExit(new Error("Preview cleanup exceeded the app-exit deadline"));
      }
    }, this.absoluteTimeoutMs);
    this.deadlineTimer.unref?.();
    void this.runAttempt(generation);
  }

  forceExit(error: unknown): void {
    if (this.state === "forced" || this.state === "allow_quit") return;
    this.onCleanupFailure(error);
    this.state = "forced";
    this.generation += 1;
    this.clearScheduledWork();
    try {
      this.cleanup.stopSync?.();
    } catch (forceError) {
      this.onCleanupFailure(forceError);
    } finally {
      this.app.exit(1);
    }
  }

  private async runAttempt(generation: number): Promise<void> {
    if (this.state !== "cleaning" || generation !== this.generation) return;
    this.attempts += 1;
    try {
      if (this.cleanup.deactivate) {
        await withTimeout(
          this.cleanup.deactivate(),
          this.attemptTimeoutMs,
          this.setTimer,
          this.clearTimer,
        );
      }
    } catch (error) {
      if (this.state !== "cleaning" || generation !== this.generation) return;
      this.onCleanupFailure(error);
      if (this.attempts >= this.maxAttempts) {
        this.forceExit(error);
        return;
      }
      this.retryTimer = this.setTimer(() => {
        this.retryTimer = undefined;
        void this.runAttempt(generation);
      }, this.retryDelayMs);
      this.retryTimer.unref?.();
      return;
    }
    if (this.state !== "cleaning" || generation !== this.generation) return;
    this.state = "allow_quit";
    this.clearScheduledWork();
    this.app.quit();
  }

  private clearScheduledWork(): void {
    if (this.deadlineTimer !== undefined) this.clearTimer(this.deadlineTimer);
    if (this.retryTimer !== undefined) this.clearTimer(this.retryTimer);
    this.deadlineTimer = undefined;
    this.retryTimer = undefined;
  }
}

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  setTimer: typeof setTimeout,
  clearTimer: typeof clearTimeout,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimer(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Preview cleanup attempt timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();
    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        reject(error);
      },
    );
  });
}
