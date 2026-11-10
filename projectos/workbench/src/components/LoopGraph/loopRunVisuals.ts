import type { LoopNodeRecordStatus } from '@contracts/index'

/** CSS module class keys for Run-phase node status dots (GC-6.1). */
export type LoopRunStatusTone =
  | 'pending'
  | 'ready'
  | 'running'
  | 'waiting'
  | 'waiting_approval'
  | 'blocked'
  | 'verifying'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled'

export function toneFromNodeRecordStatus(
  status: LoopNodeRecordStatus | undefined,
  options?: { isCursor?: boolean; instanceAwaitingHitl?: boolean },
): LoopRunStatusTone {
  if (options?.instanceAwaitingHitl && options.isCursor) return 'waiting_approval'
  if (!status) {
    return options?.isCursor ? 'running' : 'pending'
  }
  return status
}

export function detectParallelGroups(
  edges: Array<{ kind?: string; from: string; to: string }>,
): Array<{ id: string; nodeIds: string[] }> {
  const depends = edges.filter((edge) => edge.kind === 'depends' || !edge.kind)
  const out = new Map<string, string[]>()
  const inn = new Map<string, string[]>()
  for (const edge of depends) {
    const outs = out.get(edge.from) ?? []
    outs.push(edge.to)
    out.set(edge.from, outs)
    const ins = inn.get(edge.to) ?? []
    ins.push(edge.from)
    inn.set(edge.to, ins)
  }

  const groups: Array<{ id: string; nodeIds: string[] }> = []
  for (const [fromId, children] of out) {
    if (children.length < 2) continue
    const members = new Set<string>([fromId, ...children])
    for (const child of children) {
      for (const next of out.get(child) ?? []) {
        const parents = inn.get(next) ?? []
        if (parents.length >= 2 && parents.every((p) => members.has(p) || children.includes(p))) {
          members.add(next)
        }
      }
    }
    // Include merge targets that join these children.
    for (const [toId, parents] of inn) {
      if (parents.length < 2) continue
      if (parents.every((p) => children.includes(p) || members.has(p))) {
        members.add(toId)
      }
    }
    groups.push({
      id: `parallel_${fromId}`,
      nodeIds: [...members],
    })
  }
  return groups
}
