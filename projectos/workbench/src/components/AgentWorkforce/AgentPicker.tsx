import { Bot, Library, Plus, Share2, Sparkles, Users } from 'lucide-react'
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
  /** Open Marketplace Agents talent library (Templates). */
  onBrowseTalentLibrary?: () => void
  /** Capability Marketplace: export agent as shareable pack JSON. */
  onExportAgent?: (definitionId: string) => void
  showCreate?: boolean
  compact?: boolean
  /**
   * Loop Graph squad compose: multi-select specialist ids, then form a work group.
   * When set with onComposeWorkGroup, checkboxes appear on workforce rows.
   */
  squadSelectedIds?: string[]
  onToggleSquadMember?: (definitionId: string) => void
  onComposeWorkGroup?: () => void
}

export default function AgentPicker({
  agents,
  selectedDefinitionId,
  loading = false,
  generalSelected,
  onSelectGeneral,
  onSelectAgent,
  onCreateAgent,
  onBrowseTalentLibrary,
  onExportAgent,
  showCreate = true,
  compact = false,
  squadSelectedIds,
  onToggleSquadMember,
  onComposeWorkGroup,
}: AgentPickerProps) {
  const { ts } = useI18n()
  const generalActive =
    generalSelected ?? (selectedDefinitionId === null || selectedDefinitionId === undefined)
  const squadMode = Boolean(onToggleSquadMember && onComposeWorkGroup)

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
          const squadChecked = squadSelectedIds?.includes(agent.definitionId) ?? false
          return (
            <div
              key={agent.definitionId}
              className={`${styles.itemRow} ${active ? styles.itemActive : ''}`}
            >
              {squadMode ? (
                <label className={styles.squadCheck}>
                  <input
                    type="checkbox"
                    checked={squadChecked}
                    onChange={() => onToggleSquadMember?.(agent.definitionId)}
                    aria-label={`${ts('chat.loopGraph.workGroup.composeFromTalent')}: ${agent.config.displayName}`}
                  />
                </label>
              ) : null}
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

      {squadMode ? (
        <button
          type="button"
          className={styles.createItem}
          disabled={(squadSelectedIds?.length ?? 0) < 1}
          onClick={() => onComposeWorkGroup?.()}
        >
          <Users size={14} aria-hidden />
          {ts('chat.loopGraph.workGroup.composeFromTalent')}
          {(squadSelectedIds?.length ?? 0) > 0
            ? ` (${squadSelectedIds!.length})`
            : ''}
        </button>
      ) : null}

      {onBrowseTalentLibrary || (showCreate && onCreateAgent) ? (
        <div className={styles.separator} role="separator" />
      ) : null}

      {onBrowseTalentLibrary ? (
        <button
          type="button"
          className={styles.createItem}
          onClick={onBrowseTalentLibrary}
        >
          <Library size={14} aria-hidden />
          {ts('workforce.browseTalentLibrary')}
        </button>
      ) : null}

      {showCreate && onCreateAgent ? (
        <button type="button" className={styles.createItem} onClick={onCreateAgent}>
          <Plus size={14} aria-hidden />
          {ts('workforce.createAgent')}
        </button>
      ) : null}
    </div>
  )
}
