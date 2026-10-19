/**
 * In-memory structure-scan progress state + event fan-out.
 */

import { randomUUID } from "node:crypto";

import type { StructureScanMode } from "../contracts/graph.js";
import type {
  StructureScanProgress,
  StructureScanProgressEvent,
  StructureScanStep,
  StructureScanStepId,
} from "../contracts/structure-scan-progress.js";
import { createPlannedStructureScanSteps } from "../contracts/structure-scan-progress.js";

export type StructureScanProgressListener = (
  event: StructureScanProgressEvent,
) => void;

function nowIso(): string {
  return new Date().toISOString();
}

function patchStep(
  steps: StructureScanStep[],
  stepId: StructureScanStepId,
  patch: Partial<StructureScanStep>,
): StructureScanStep[] {
  return steps.map((step) =>
    step.id === stepId ? { ...step, ...patch, id: stepId } : step,
  );
}

export class StructureScanProgressTracker {
  private readonly progressByProjectId = new Map<string, StructureScanProgress>();
  private readonly listenersByProjectId = new Map<
    string,
    Set<StructureScanProgressListener>
  >();

  getProgress(projectId: string): StructureScanProgress | null {
    return this.progressByProjectId.get(projectId) ?? null;
  }

  subscribe(
    projectId: string,
    listener: StructureScanProgressListener,
  ): { dispose(): void } {
    let set = this.listenersByProjectId.get(projectId);
    if (!set) {
      set = new Set();
      this.listenersByProjectId.set(projectId, set);
    }
    set.add(listener);
    const snapshot = this.progressByProjectId.get(projectId);
    if (snapshot && snapshot.status === "running") {
      listener({
        type: "scan_planned",
        scanId: snapshot.scanId,
        projectId: snapshot.projectId,
        timestamp: snapshot.updatedAt,
        mode: snapshot.mode,
        steps: snapshot.steps,
      });
    }
    return {
      dispose: () => {
        const listeners = this.listenersByProjectId.get(projectId);
        if (!listeners) return;
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.listenersByProjectId.delete(projectId);
        }
      },
    };
  }

  clearProject(projectId: string): void {
    this.progressByProjectId.delete(projectId);
    this.listenersByProjectId.delete(projectId);
  }

  /**
   * Immediately mark a running scan cancelled and fan-out the event.
   * Returns false when there is no running scan to cancel.
   */
  cancelRunning(projectId: string): boolean {
    const current = this.progressByProjectId.get(projectId);
    if (!current || current.status !== "running") return false;
    this.applyEvent({
      type: "scan_cancelled",
      scanId: current.scanId,
      projectId,
      timestamp: nowIso(),
    });
    return true;
  }

  begin(input: {
    projectId: string;
    mode: StructureScanMode;
    skipMapContext?: boolean;
  }): {
    scanId: string;
    report: StructureScanProgressListener;
  } {
    const scanId = randomUUID();
    const startedAt = nowIso();
    const steps = createPlannedStructureScanSteps({
      skipMapContext: input.skipMapContext,
    });
    const progress: StructureScanProgress = {
      scanId,
      projectId: input.projectId,
      mode: input.mode,
      status: "running",
      steps,
      startedAt,
      updatedAt: startedAt,
    };
    this.progressByProjectId.set(input.projectId, progress);
    const report: StructureScanProgressListener = (event) => {
      this.applyEvent(event);
    };
    report({
      type: "scan_planned",
      scanId,
      projectId: input.projectId,
      timestamp: startedAt,
      mode: input.mode,
      steps,
    });
    return { scanId, report };
  }

  private emit(projectId: string, event: StructureScanProgressEvent): void {
    const listeners = this.listenersByProjectId.get(projectId);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // Listener failures must not break the scan pipeline.
      }
    }
  }

  private applyEvent(event: StructureScanProgressEvent): void {
    const current = this.progressByProjectId.get(event.projectId);
    if (!current || current.scanId !== event.scanId) {
      // Still fan-out so late subscribers / tests can observe.
      this.emit(event.projectId, event);
      return;
    }
    // Ignore late step noise after the scan already settled (esp. after cancel).
    if (
      (current.status === "cancelled" ||
        current.status === "success" ||
        current.status === "failed") &&
      event.type !== "scan_cancelled" &&
      event.type !== "scan_completed" &&
      event.type !== "scan_failed"
    ) {
      return;
    }
    // Cancel wins over a racing completed/failed for the same scan.
    if (
      current.status === "cancelled" &&
      (event.type === "scan_completed" || event.type === "scan_failed")
    ) {
      return;
    }
    const updatedAt = event.timestamp;
    let next: StructureScanProgress = { ...current, updatedAt };

    switch (event.type) {
      case "scan_planned":
        next = {
          ...next,
          mode: event.mode,
          status: "running",
          steps: event.steps,
        };
        break;
      case "step_started":
        next = {
          ...next,
          status: "running",
          steps: patchStep(next.steps, event.stepId, {
            status: "running",
            ...(event.detail !== undefined ? { detail: event.detail } : {}),
          }),
        };
        break;
      case "step_completed":
        next = {
          ...next,
          steps: patchStep(next.steps, event.stepId, {
            status: "complete",
            ...(event.detail !== undefined ? { detail: event.detail } : {}),
          }),
        };
        break;
      case "step_skipped":
        next = {
          ...next,
          steps: patchStep(next.steps, event.stepId, {
            status: "skipped",
            ...(event.detail !== undefined ? { detail: event.detail } : {}),
          }),
        };
        break;
      case "step_failed":
        next = {
          ...next,
          status: "failed",
          error: event.message,
          steps: patchStep(next.steps, event.stepId, { status: "failed" }),
        };
        break;
      case "scan_completed":
        next = {
          ...next,
          status: "success",
          error: undefined,
          steps: next.steps.map((step) =>
            step.status === "pending" || step.status === "running"
              ? { ...step, status: "complete" as const }
              : step,
          ),
        };
        break;
      case "scan_failed":
        next = {
          ...next,
          status: "failed",
          error: event.message,
          steps: event.stepId
            ? patchStep(next.steps, event.stepId, { status: "failed" })
            : next.steps.map((step) =>
                step.status === "running"
                  ? { ...step, status: "failed" as const }
                  : step,
              ),
        };
        break;
      case "scan_cancelled":
        next = {
          ...next,
          status: "cancelled",
          error: undefined,
          steps: next.steps.map((step) =>
            step.status === "running"
              ? { ...step, status: "skipped" as const }
              : step.status === "pending"
                ? { ...step, status: "skipped" as const }
                : step,
          ),
        };
        break;
      default:
        break;
    }

    this.progressByProjectId.set(event.projectId, next);
    this.emit(event.projectId, event);
  }
}

export function stepEvent(
  type: "step_started" | "step_completed" | "step_skipped",
  input: {
    scanId: string;
    projectId: string;
    stepId: StructureScanStepId;
    detail?: string;
  },
): StructureScanProgressEvent {
  return {
    type,
    scanId: input.scanId,
    projectId: input.projectId,
    timestamp: nowIso(),
    stepId: input.stepId,
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
  };
}
