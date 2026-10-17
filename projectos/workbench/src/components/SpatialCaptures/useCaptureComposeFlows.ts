import { useEffect, useRef, useState } from 'react'
import type { ProjectOSApi } from '@contracts/api'
import {
  applyRunEventToCompactFlow,
  type CoarseFlowLabel,
  type CompactFlowStep,
} from '../../overlay/coarseFlow'

export interface ArrowFlowState {
  steps: CompactFlowStep[]
  phase: CoarseFlowLabel | null
  live: boolean
}

type FlowClient = Pick<ProjectOSApi, 'getAgentRun' | 'getAgentRunEvents' | 'streamAgentRun'>

function settledPhase(status: string): { phase: CoarseFlowLabel; live: boolean } {
  if (status === 'queued' || status === 'running') return { phase: 'thinking', live: true }
  if (status === 'error') return { phase: 'error', live: false }
  return { phase: 'done', live: false }
}

export function useCaptureComposeFlows(
  arrows: Array<{ id: string; runId?: string }>,
  client: FlowClient | null,
  enabled: boolean,
): {
  flows: Record<string, ArrowFlowState>
  seedFlow: (arrowId: string, flow: ArrowFlowState) => void
} {
  const [flows, setFlows] = useState<Record<string, ArrowFlowState>>({})
  const arrowsRef = useRef(arrows)
  arrowsRef.current = arrows
  const key = arrows
    .map((arrow) => `${arrow.id}:${arrow.runId ?? ''}`)
    .sort()
    .join('|')
  const liveKey = arrows
    .filter((arrow) => arrow.runId && flows[arrow.id]?.live)
    .map((arrow) => `${arrow.id}:${arrow.runId}`)
    .sort()
    .join('|')

  useEffect(() => {
    if (!client || !enabled) return
    let cancelled = false
    const linked = arrowsRef.current.filter((arrow) => arrow.runId)
    void (async () => {
      const loaded: Record<string, ArrowFlowState> = {}
      await Promise.all(
        linked.map(async (arrow) => {
          const runId = arrow.runId
          if (!runId) return
          try {
            const [run, events] = await Promise.all([
              client.getAgentRun(runId),
              client.getAgentRunEvents(runId),
            ])
            let steps: CompactFlowStep[] = []
            for (const event of events) {
              const applied = applyRunEventToCompactFlow(steps, event)
              steps = applied.steps
            }
            const settled = settledPhase(run.status)
            if (!settled.live) {
              steps = steps.map((step) =>
                step.status === 'running' ? { ...step, status: 'complete' } : step,
              )
            }
            if (steps.length === 0) {
              steps = [
                {
                  id: `run_${runId}`,
                  label: settled.phase === 'error' ? 'Error' : settled.live ? 'Agent flow' : 'Done',
                  status: settled.phase === 'error' ? 'error' : settled.live ? 'running' : 'complete',
                },
              ]
            }
            loaded[arrow.id] = { steps, phase: settled.phase, live: settled.live }
          } catch {
            /* leave any optimistic seed in place */
          }
        }),
      )
      if (cancelled) return
      setFlows((current) => ({ ...current, ...loaded }))
    })()
    return () => {
      cancelled = true
    }
  }, [client, enabled, key])

  useEffect(() => {
    if (!client || !enabled) return
    const disposables: Array<{ dispose: () => void }> = []
    for (const arrow of arrowsRef.current) {
      if (!arrow.runId || !flows[arrow.id]?.live) continue
      const runId = arrow.runId
      const arrowId = arrow.id
      disposables.push(
        client.streamAgentRun(runId, (event) => {
          setFlows((current) => {
            const previous = current[arrowId] ?? { steps: [], phase: 'thinking' as const, live: true }
            const applied = applyRunEventToCompactFlow(previous.steps, event)
            const type = event && typeof event === 'object' && 'type' in event ? String(event.type) : ''
            const finished = type === 'run_completed' || type === 'step_failed'
            return {
              ...current,
              [arrowId]: {
                steps: applied.steps,
                phase: finished
                  ? type === 'step_failed'
                    ? 'error'
                    : 'done'
                  : (applied.phase ?? previous.phase),
                live: !finished && previous.live,
              },
            }
          })
        }),
      )
    }
    return () => {
      for (const disposable of disposables) disposable.dispose()
    }
  }, [client, enabled, liveKey])

  return {
    flows,
    seedFlow: (arrowId, flow) => {
      setFlows((current) => ({ ...current, [arrowId]: flow }))
    },
  }
}
