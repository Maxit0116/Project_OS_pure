/**
 * Vertical commit swimlane layout (SourceGit / git-graph-plus style).
 * Rows are newest-first; parents are authoritative — never invent edges.
 */

export interface SwimlaneCommitInput {
  id: string
  parentIds: string[]
  /** When true, row is WIP and gets lane 0 without consuming parents. */
  wip?: boolean
}

export interface SwimlaneRailSegment {
  /** Lane index at the top edge of the row (toward newer commits). */
  fromLane: number
  /** Lane index at the bottom edge of the row (toward older commits). */
  toLane: number
}

export interface LaidOutSwimlaneRow {
  id: string
  lane: number
  isMerge: boolean
  wip: boolean
  /** Vertical through-lines + merges for this row. */
  rails: SwimlaneRailSegment[]
  parentLanes: number[]
}

export interface GithubCommitSwimlaneLayout {
  rows: LaidOutSwimlaneRow[]
  laneCount: number
}

const MAX_LANES = 48

function freeSlot(lanes: Array<string | null>): number {
  for (let i = 0; i < lanes.length; i += 1) {
    if (lanes[i] === null) return i
  }
  if (lanes.length >= MAX_LANES) return lanes.length - 1
  lanes.push(null)
  return lanes.length - 1
}

function ensureLen(lanes: Array<string | null>, index: number) {
  while (lanes.length <= index) lanes.push(null)
}

/**
 * Active-lane reservation walk (newest → oldest).
 * First parent continues the commit's lane; extra parents open new lanes.
 */
export function layoutGithubCommitSwimlane(
  inputs: readonly SwimlaneCommitInput[],
): GithubCommitSwimlaneLayout {
  if (inputs.length === 0) {
    return { rows: [], laneCount: 0 }
  }

  const lanes: Array<string | null> = []
  const rows: LaidOutSwimlaneRow[] = []
  let maxLane = 0

  for (const input of inputs) {
    if (input.wip) {
      ensureLen(lanes, 0)
      maxLane = Math.max(maxLane, 0)
      const rails: SwimlaneRailSegment[] = []
      for (let i = 0; i < lanes.length; i += 1) {
        if (lanes[i] !== null) rails.push({ fromLane: i, toLane: i })
      }
      rows.push({
        id: input.id,
        lane: 0,
        isMerge: false,
        wip: true,
        rails,
        parentLanes: [],
      })
      continue
    }

    const parents = input.parentIds.filter(Boolean)
    const incoming: number[] = []
    for (let i = 0; i < lanes.length; i += 1) {
      if (lanes[i] === input.id) incoming.push(i)
    }

    const nodeCol =
      incoming.length > 0 ? Math.min(...incoming) : freeSlot(lanes)
    ensureLen(lanes, nodeCol)

    const rails: SwimlaneRailSegment[] = []
    for (let i = 0; i < lanes.length; i += 1) {
      if (lanes[i] === null) continue
      if (incoming.includes(i)) {
        rails.push({ fromLane: i, toLane: nodeCol })
      } else {
        rails.push({ fromLane: i, toLane: i })
      }
    }

    for (const i of incoming) {
      lanes[i] = null
    }
    lanes[nodeCol] = null

    const parentCols: number[] = []
    parents.forEach((parent, index) => {
      const existing = lanes.findIndex((lane) => lane === parent)
      let col: number
      if (existing >= 0) {
        col = existing
      } else if (index === 0) {
        col = nodeCol
      } else {
        col = freeSlot(lanes)
      }
      ensureLen(lanes, col)
      lanes[col] = parent
      if (!parentCols.includes(col)) parentCols.push(col)
      rails.push({ fromLane: nodeCol, toLane: col })
    })

    maxLane = Math.max(maxLane, nodeCol, ...parentCols, lanes.length - 1)

    rows.push({
      id: input.id,
      lane: nodeCol,
      isMerge: parents.length > 1,
      wip: false,
      rails,
      parentLanes: parentCols,
    })
  }

  return {
    rows,
    laneCount: Math.max(1, maxLane + 1),
  }
}

/** Keep only first-parent edges; drop commits unreachable from tips via first parents. */
export function filterFirstParentCommits<T extends { id: string; parentIds: string[] }>(
  commits: readonly T[],
  tipIds: readonly string[],
): T[] {
  if (commits.length === 0) return []
  const byId = new Map(commits.map((commit) => [commit.id, commit]))
  const keep = new Set<string>()
  const stack = [...tipIds.filter((id) => byId.has(id))]
  if (stack.length === 0 && commits[0]) {
    stack.push(commits[0].id)
  }
  while (stack.length > 0) {
    const id = stack.pop()
    if (!id || keep.has(id)) continue
    keep.add(id)
    const commit = byId.get(id)
    const first = commit?.parentIds[0]
    if (first && byId.has(first)) stack.push(first)
  }
  return commits
    .filter((commit) => keep.has(commit.id))
    .map((commit) => ({
      ...commit,
      parentIds: commit.parentIds.slice(0, 1),
    }))
}
