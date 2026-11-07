import { Bot, Plus, Share2, Sparkles } from 'lucide-react'
import type { AgentDefinition } from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './AgentPicker.module.css'

export interface AgentPickerProps {
  agents: AgentDefinition[]
  selectedDefinitionId: string | null
  loading?: boolean
  /** When true, highlight General as selected. */
  generalSelected?: boolean
  onSelectGeneral: () => void
  onSelectAgent: (definitionId: string) => void
  onCreateAgent?: () => void
  /** Capability Marketplace: export agent as shareable pack JSON. */
  onExportAgent?: (definitionId: string) => void
  showCreate?: boolean
  compact?: boolean
}

export default function AgentPicker({
  agents,
  selectedDefinitionId,
  loading = false,
  generalSelected,
  onSelectGeneral,
  onSelectAgent,
  onCreateAgent,
  onExportAgent,
  showCreate = true,
  compact = false,
}: AgentPickerProps) {
  const { ts } = useI18n()
  const generalActive =
    generalSelected ?? (selectedDefinitionId === null || selectedDefinitionId === undefined)

  return (
    <div
      className={`${styles.picker} ${compact ? styles.compact : ''}`}
      role="listbox"
      aria-label={ts('workforce.pickerLabel')}
    >
      <button
        type="button"
        role="option"
        aria-selected={generalActive}
        className={`${styles.item} ${generalActive ? styles.itemActive : ''}`}
        onClick={onSelectGeneral}
      >
        <Sparkles size={14} className={styles.itemIcon} aria-hidden />
        <span className={styles.itemBody}>
          <span className={styles.itemTitle}>{ts('workforce.generalAgent')}</span>
          <span className={styles.itemMeta}>{ts('workforce.generalAgentHint')}</span>
        </span>
      </button>

      <div className={styles.sectionLabel}>{ts('workforce.myAgents')}</div>

      {loading ? (
        <div className={styles.empty}>{ts('workforce.loading')}</div>
      ) : agents.length === 0 ? (
        <div className={styles.empty}>{ts('workforce.empty')}</div>
      ) : (
        agents.map((agent) => {
          const active = agent.definitionId === selectedDefinitionId
          const role = agent.config.roleLabel ?? agent.config.role
          return (
            <div
              key={agent.definitionId}
              className={`${styles.itemRow} ${active ? styles.itemActive : ''}`}
            >
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={styles.item}
                onClick={() => onSelectAgent(agent.definitionId)}
              >
                <Bot size={14} className={styles.itemIcon} aria-hidden />
                <span className={styles.itemBody}>
                  <span className={styles.itemTitle}>{agent.config.displayName}</span>
                  {role ? <span className={styles.itemMeta}>{role}</span> : null}
                </span>
              </button>
              {onExportAgent ? (
                <button
                  type="button"
                  className={styles.exportBtn}
                  aria-label={ts('workforce.exportAgent')}
                  title={ts('workforce.exportAgent')}
                  onClick={(event) => {
                    event.stopPropagation()
                    onExportAgent(agent.definitionId)
                  }}
                >
                  <Share2 size={14} aria-hidden />
                </button>
              ) : null}
            </div>
          )
        })
      )}

      {showCreate && onCreateAgent ? (
        <>
          <div className={styles.separator} role="separator" />
          <button type="button" className={styles.createItem} onClick={onCreateAgent}>
            <Plus size={14} aria-hidden />
            {ts('workforce.createAgent')}
          </button>
        </>
      ) : null}
    </div>
  )
}
