import type { LiveNodeActivity } from '@contracts/index'
import { useI18n } from '../../i18n'
import CompletedLiveStack from './CompletedLiveStack'
import NodeLiveActivityCard, { nodeLiveActivityHeading } from './NodeLiveActivityCard'

interface Props {
  activities: LiveNodeActivity[]
  expanded: boolean
  onToggle: () => void
  onOpenInAgentFlow: (activity: LiveNodeActivity) => void
  statusClass: (status: string) => string
}

/** Collapsed deck + expandable list for finished agents in Live Agent Activity. */
export default function CompletedAgentActivityStack({
  activities,
  expanded,
  onToggle,
  onOpenInAgentFlow,
  statusClass,
}: Props) {
  const { ts } = useI18n()
  return (
    <CompletedLiveStack
      items={activities}
      expanded={expanded}
      onToggle={onToggle}
      countLabel={ts('map.c4Detail.activityStackCount', { count: activities.length })}
      expandLabel={ts('map.c4Detail.activityStackExpand')}
      collapseLabel={ts('map.c4Detail.activityStackCollapse')}
      testId="completed-agent-stack"
      faceText={(activity) => nodeLiveActivityHeading(activity, ts)}
      statusClassName={(activity) => statusClass(activity.status)}
      renderItem={(activity) => (
        <NodeLiveActivityCard
          key={activity.id}
          activity={activity}
          onOpenInAgentFlow={onOpenInAgentFlow}
          statusClass={statusClass}
        />
      )}
    />
  )
}
