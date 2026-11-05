import type { FlowStatus } from './handleRunEvent'

/**
 * Whether the debug fix is still on its way: its run is working, or its change is waiting in the
 * diff review. The change was prepared against the file with the debug probes in it, so cleaning
 * the probes up before it is applied makes it stale and it can no longer be applied. A person has to
 * be told that before they press "clean up", not find out from a refused apply.
 */
export function isDebugFixPending(phase: string | undefined, flowStatus: FlowStatus): boolean {
  return phase === 'verify' && (flowStatus === 'running' || flowStatus === 'awaiting_review')
}
