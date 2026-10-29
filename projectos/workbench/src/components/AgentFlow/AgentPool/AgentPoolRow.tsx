import { useState } from 'react'
import { ChevronDown, ChevronRight, Layers } from 'lucide-react'
import { useI18n } from '../../../i18n'
import Button from '../../ui/Button'
import { useAgentPoolStore } from './agentPoolStore'
import AgentPoolHistoryStrip from './AgentPoolHistoryStrip'
import AgentPoolJumpMenu from './AgentPoolJumpMenu'
import AgentPoolModelIcon from './AgentPoolModelIcon'
import AgentPoolRowExpand from './AgentPoolRowExpand'
import type { AgentPoolHistoryEntry, AgentPoolTask } from './projectAgentPool'
import styles from './AgentPoolRow.module.css'

interface Props {
  task: AgentPoolTask
  expanded: boolean
  historyExpanded: boolean
  onToggleExpand: () => void
  onToggleHistory: () => void
  onDone: () => void
}

export default function AgentPoolRow({
  task,
  expanded,
  historyExpanded,
  onToggleExpand,
  onToggleHistory,
  onDone,
}: Props) {
  const { ts } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const selectedHistory =
    task.history.find((entry) => entry.id === selectedHistoryId) ?? null

  const stackCount = task.history.length
  const showDone = task.status !== 'reviewing'

  return (
    <article
      className={styles.row}
      data-task-id={task.taskId}
      data-status={task.status}
      data-source={task.source}
    >
      <div className={styles.main}>
        {stackCount > 0 ? (
          <button
            type="button"
            className={styles.stackBtn}
            aria-label={ts('agentFlow.pool.stackAria', { count: stackCount })}
            aria-expanded={historyExpanded}
            onClick={onToggleHistory}
          >
            <Layers size={14} aria-hidden />
            <span className={styles.stackCount}>{stackCount}</span>
            <span className={styles.stackLayers} aria-hidden data-depth={Math.min(stackCount, 3)} />
          </button>
        ) : (
          <span className={styles.stackSpacer} aria-hidden />
        )}

        <AgentPoolModelIcon label={task.modelLabel} modelId={task.modelId} />

        <div className={styles.agentBtnWrap}>
          <button
            type="button"
            className={styles.agentBtn}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className={styles.agentTitle}>{task.title}</span>
            <span className={styles.agentStatus}>
              {ts(`agentFlow.pool.status.${task.status}` as 'agentFlow.pool.status.running')}
            </span>
          </button>
          <AgentPoolJumpMenu
            task={task}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
          />
        </div>

        <div className={styles.lifeLine} aria-hidden={!expanded}>
          <span className={styles.lifeTrack} />
          <span className={styles.lifeAction}>{task.currentAction}</span>
        </div>

        <button
          type="button"
          className={styles.expandBtn}
          aria-expanded={expanded}
          aria-label={ts('agentFlow.pool.expandFlow')}
          onClick={onToggleExpand}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {showDone ? (
          <Button
            size="sm"
            variant={task.status === 'awaiting_user_done' || task.status === 'complete' ? 'primary' : 'secondary'}
            onClick={onDone}
          >
            {ts('agentFlow.pool.done')}
          </Button>
        ) : (
          <span className={styles.reviewingBadge}>{ts('agentFlow.pool.reviewing')}</span>
        )}
      </div>

      {historyExpanded && stackCount > 0 ? (
        <AgentPoolHistoryStrip
          task={task}
          selectedHistoryId={selectedHistoryId}
          onSelectHistory={(entry: AgentPoolHistoryEntry) => {
            setSelectedHistoryId(entry.id)
            useAgentPoolStore.getState().setExpandedTaskId(task.taskId)
          }}
        />
      ) : null}

      {expanded ? (
        <AgentPoolRowExpand
          steps={selectedHistory?.flowSteps ?? task.flowSteps}
          currentAction={selectedHistory?.currentAction ?? task.currentAction}
        />
      ) : null}
    </article>
  )
}
