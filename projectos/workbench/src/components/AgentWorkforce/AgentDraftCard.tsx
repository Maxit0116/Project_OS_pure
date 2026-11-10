import type { WorkforceAgentDraft } from '@contracts/index'
import { useI18n } from '../../i18n'
import TextArea from '../ui/TextArea'
import TextInput from '../ui/TextInput'
import styles from './AgentDraftCard.module.css'

export interface AgentDraftCardProps {
  draft: WorkforceAgentDraft
  source: 'chat' | 'loop'
  onChange: (draft: WorkforceAgentDraft) => void
  onConfirm: (options?: { placeOnLoop?: boolean; useInChat?: boolean }) => void
  onCancel: () => void
  busy?: boolean
}

export default function AgentDraftCard({
  draft,
  source,
  onChange,
  onConfirm,
  onCancel,
  busy = false,
}: AgentDraftCardProps) {
  const { ts } = useI18n()

  const patch = (partial: Partial<WorkforceAgentDraft>) => {
    onChange({ ...draft, ...partial })
  }

  return (
    <section className={styles.card} aria-label={ts('workforce.draftTitle')} data-zone-interactive>
      <header className={styles.header}>
        <h3 className={styles.title}>{ts('workforce.draftTitle')}</h3>
      </header>

      <TextInput
        label={ts('workforce.draftName')}
        value={draft.displayName}
        onChange={(event) => patch({ displayName: event.target.value })}
        disabled={busy}
      />

      <TextInput
        label={ts('workforce.draftRole')}
        value={draft.roleLabel ?? ''}
        onChange={(event) =>
          patch({ roleLabel: event.target.value.trim() ? event.target.value : undefined })
        }
        disabled={busy}
      />

      <TextArea
        label={ts('workforce.draftInstructions')}
        rows={5}
        value={draft.instructions}
        onChange={(event) => patch({ instructions: event.target.value })}
        disabled={busy}
      />

      <div className={styles.field}>
        <span className={styles.label}>{ts('workforce.draftSkills')}</span>
        <div className={styles.chips}>
          {draft.skillIds.length === 0 ? (
            <span className={styles.muted}>{ts('workforce.draftSkillsEmpty')}</span>
          ) : (
            draft.skillIds.map((id) => (
              <span key={id} className={styles.chip}>
                {id}
              </span>
            ))
          )}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>{ts('workforce.draftMcp')}</span>
        <div className={styles.chips}>
          {draft.mcpServerIds.length === 0 ? (
            <span className={styles.muted}>{ts('workforce.draftMcpEmpty')}</span>
          ) : (
            draft.mcpServerIds.map((id) => (
              <span key={id} className={styles.chip}>
                {id}
              </span>
            ))
          )}
        </div>
      </div>

      {draft.permissionNotes ? (
        <TextArea
          label={ts('workforce.draftPermissions')}
          rows={2}
          value={draft.permissionNotes}
          onChange={(event) =>
            patch({
              permissionNotes: event.target.value.trim() ? event.target.value : undefined,
            })
          }
          disabled={busy}
        />
      ) : null}

      <footer className={styles.footer}>
        <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>
          {ts('workforce.draftCancel')}
        </button>
        {source === 'loop' ? (
          <button
            type="button"
            className={styles.primary}
            disabled={busy || !draft.displayName.trim()}
            onClick={() => onConfirm({ placeOnLoop: true, useInChat: false })}
          >
            {ts('workforce.draftConfirmAndPlace')}
          </button>
        ) : (
          <button
            type="button"
            className={styles.primary}
            disabled={busy || !draft.displayName.trim()}
            onClick={() => onConfirm({ useInChat: true })}
          >
            {ts('workforce.draftConfirmAndUse')}
          </button>
        )}
        <button
          type="button"
          className={styles.secondary}
          disabled={busy || !draft.displayName.trim()}
          onClick={() => onConfirm({ useInChat: source === 'chat', placeOnLoop: false })}
        >
          {ts('workforce.draftConfirm')}
        </button>
      </footer>
    </section>
  )
}
