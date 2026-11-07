import { useEffect, useRef } from 'react'
import { useI18n } from '../../../i18n'
import { useChatSessionStore } from '../../../state/chatSessionStore'
import { useWorkbenchStore } from '../../../state/workbenchStore'
import type { AgentPoolTask } from './projectAgentPool'
import styles from './AgentPoolRow.module.css'

interface Props {
  task: AgentPoolTask
  open: boolean
  onClose: () => void
}

export default function AgentPoolJumpMenu({ task, open, onClose }: Props) {
  const { ts } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const showLoop = Boolean(task.loopSpecId)

  return (
    <div className={styles.jumpMenu} ref={menuRef} role="menu">
      <button
        type="button"
        role="menuitem"
        className={styles.jumpItem}
        onClick={() => {
          useChatSessionStore.getState().presentAgentFlow()
          useWorkbenchStore.getState().setAgentFlowViewMode('graph')
          onClose()
        }}
      >
        {ts('agentFlow.pool.jumpGraph')}
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.jumpItem}
        onClick={() => {
          useChatSessionStore.getState().setSessionGraphOpen(true)
          onClose()
        }}
      >
        {ts('agentFlow.pool.jumpSessions')}
      </button>
      {showLoop ? (
        <button
          type="button"
          role="menuitem"
          className={styles.jumpItem}
          onClick={() => {
            useChatSessionStore.getState().setLoopGraphOpen(true)
            onClose()
          }}
        >
          {ts('agentFlow.pool.jumpLoops')}
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className={styles.jumpItem}
        onClick={() => {
          useChatSessionStore.getState().setGithubGraphOpen(true)
          onClose()
        }}
      >
        {ts('chat.githubGraph.title')}
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.jumpItem}
        onClick={() => {
          const sessions = useChatSessionStore.getState()
          if (task.chatSessionId && sessions.activeSessionId !== task.chatSessionId) {
            void sessions.switchSession(task.chatSessionId)
          }
          useWorkbenchStore.setState({ rightPanelTab: 'chat', rightPanelOpen: true })
          onClose()
        }}
      >
        {ts('agentFlow.pool.jumpChat')}
      </button>
    </div>
  )
}
