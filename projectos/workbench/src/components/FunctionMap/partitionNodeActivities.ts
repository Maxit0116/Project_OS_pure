import type { LiveNodeActivity } from '@contracts/index'
import type { LiveNodeChangeEntry } from '../../../../services/live-graph/index.js'

export interface PartitionedNodeActivities {
  /** Still working on this node — keep fully expanded. */
  active: LiveNodeActivity[]
  /**
   * Terminal activities for the completed stack.
   * Ordered newest-finished first (later completion sits on top).
   */
  completed: LiveNodeActivity[]
}

export interface PartitionedNodeChanges {
  /** Paths still being edited — keep fully expanded. */
  active: LiveNodeChangeEntry[]
  /**
   * Terminal changes for the completed stack.
   * Ordered newest-finished first (later completion sits on top).
   */
  completed: LiveNodeChangeEntry[]
}

function completionKey(item: { completedAt?: string; startedAt: string }): string {
  return item.completedAt ?? item.startedAt
}

/** Terminal = not actively working (complete or error). */
export function isTerminalNodeActivity(activity: LiveNodeActivity): boolean {
  return activity.status !== 'running'
}

/**
 * Split node activities for the Live Agent Activity list:
 * completed stack (newest first) + active rows (oldest first, same as listNodeActivities).
 */
export function partitionNodeActivities(
  activities: LiveNodeActivity[],
): PartitionedNodeActivities {
  const active: LiveNodeActivity[] = []
  const completed: LiveNodeActivity[] = []
  for (const activity of activities) {
    if (isTerminalNodeActivity(activity)) completed.push(activity)
    else active.push(activity)
  }
  completed.sort((a, b) => completionKey(b).localeCompare(completionKey(a)))
  return { active, completed }
}

/**
 * Split Changes rows the same way as Agent Activity:
 * completed stack (newest first) + active edits below.
 */
export function partitionNodeChanges(
  changes: LiveNodeChangeEntry[],
): PartitionedNodeChanges {
  const active: LiveNodeChangeEntry[] = []
  const completed: LiveNodeChangeEntry[] = []
  for (const change of changes) {
    if (change.status === 'running') active.push(change)
    else completed.push(change)
  }
  completed.sort((a, b) => completionKey(b).localeCompare(completionKey(a)))
  return { active, completed }
}
