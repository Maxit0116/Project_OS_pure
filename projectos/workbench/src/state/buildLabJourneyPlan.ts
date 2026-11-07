import type { ProjectGraph } from '@contracts/index'
import type { MapContentDocument } from '@contracts/index'
import type { LabSession } from '@contracts/index'
import {
  type LabJourneyPlan,
  type LabJourneyStep,
} from '../../../services/product-lab/journey'

export function buildLabJourneyPlan(input: {
  session: LabSession
  graph: ProjectGraph | null
  mapContent: MapContentDocument | null
}): LabJourneyPlan {
  const { session, graph, mapContent } = input
  const steps: LabJourneyStep[] = []
  const scopeIds = new Set(session.scopeNodeIds)

  if (mapContent) {
    for (const artifact of mapContent.artifacts) {
      if (artifact.type !== 'acceptance_list') continue
      const tied =
        !artifact.nodeId ||
        scopeIds.size === 0 ||
        (artifact.nodeId ? scopeIds.has(artifact.nodeId) : false)
      if (!tied) continue
      for (const item of artifact.acceptance.items) {
        steps.push({
          id: item.id,
          label: item.text,
          hint: item.done ? 'already checked in acceptance' : undefined,
        })
      }
    }
  }

  if (steps.length > 0) {
    const nodeName =
      session.scopeNodeIds
        .map((id) => graph?.nodes.find((n) => n.id === id)?.name)
        .filter(Boolean)
        .join(' · ') || 'Scoped feature'
    return {
      label: `Acceptance · ${nodeName}`,
      startUrl: session.previewUrl,
      steps: steps.slice(0, 12),
      source: 'acceptance',
    }
  }

  const scopedNodes =
    session.scopeNodeIds.length > 0
      ? (graph?.nodes.filter((n) => session.scopeNodeIds.includes(n.id)) ?? [])
      : []

  if (scopedNodes.length > 0) {
    for (const node of scopedNodes) {
      const blurb = node.responsibility || node.summary || node.description
      steps.push({
        id: node.id,
        label: `Exercise “${node.name}” as an end user`,
        hint: blurb?.slice(0, 180),
      })
      if (node.preview?.route) {
        steps.push({
          id: `${node.id}_route`,
          label: `Open route ${node.preview.route} and complete the happy path`,
        })
      }
    }
    return {
      label: `Responsibility · ${scopedNodes.map((n) => n.name).join(' · ')}`,
      startUrl: session.previewUrl,
      steps: steps.slice(0, 12),
      source: 'responsibility',
    }
  }

  return {
    label: 'Whole-app smoke',
    startUrl: session.previewUrl,
    steps: [
      {
        id: 'home',
        label: 'Load the start URL and confirm the app renders without a blank/error screen',
      },
      {
        id: 'nav',
        label: 'Follow the primary navigation to a second screen and back',
      },
      {
        id: 'action',
        label: 'Perform one primary write/action if available (submit, save, create)',
      },
    ],
    source: 'generic',
  }
}
