import type { LiveNodeChangeEntry } from '../../../../services/live-graph/index.js'
import { useI18n } from '../../i18n'
import CompletedLiveStack from './CompletedLiveStack'
import NodeLiveChangeCard, { nodeLiveChangeHeading } from './NodeLiveChangeCard'

interface Props {
  changes: LiveNodeChangeEntry[]
  expanded: boolean
  onToggle: () => void
  onOpenDiff: (path: string) => void
  statusClass: (status: string) => string
}

/** Collapsed deck + expandable list for finished file changes in Live Changes. */
export default function CompletedChangesStack({
  changes,
  expanded,
  onToggle,
  onOpenDiff,
  statusClass,
}: Props) {
  const { ts } = useI18n()
  return (
    <CompletedLiveStack
      items={changes}
      expanded={expanded}
      onToggle={onToggle}
      countLabel={ts('map.c4Detail.changesStackCount', { count: changes.length })}
      expandLabel={ts('map.c4Detail.changesStackExpand')}
      collapseLabel={ts('map.c4Detail.changesStackCollapse')}
      testId="completed-changes-stack"
      faceText={nodeLiveChangeHeading}
      statusClassName={(change) => statusClass(change.status)}
      renderItem={(change) => (
        <NodeLiveChangeCard
          key={change.path}
          change={change}
          onOpenDiff={onOpenDiff}
          statusClass={statusClass}
        />
      )}
    />
  )
}
