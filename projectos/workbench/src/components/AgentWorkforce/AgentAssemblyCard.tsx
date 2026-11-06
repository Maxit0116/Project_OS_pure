import type {
  AssemblyBinding,
  AssembleWorkforceAgentResult,
  WorkforceAgentDraft,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './AgentAssemblyCard.module.css'

export interface AgentAssemblyCardProps {
  result: AssembleWorkforceAgentResult
  busy?: boolean
  createdDefinitionId?: string | null
  installErrorIds?: string[]
  onChangeDraft: (draft: WorkforceAgentDraft) => void
  onChangeBindings: (bindings: AssemblyBinding[]) => void
  onCancel: () => void
  onInstallMissingOnly: () => void
  onConfirmCreate: () => void
  onUseInChat?: () => void
  onDismissSuccess?: () => void
}

function toggleBinding(
  bindings: AssemblyBinding[],
  id: string,
  kind: AssemblyBinding['kind'],
): AssemblyBinding[] {
  return bindings.map((b) =>
    b.id === id && b.kind === kind ? { ...b, selected: !b.selected } : b,
  )
}

export default function AgentAssemblyCard({
  result,
  busy = false,
  createdDefinitionId = null,
  installErrorIds = [],
  onChangeDraft,
  onChangeBindings,
  onCancel,
  onInstallMissingOnly,
  onConfirmCreate,
  onUseInChat,
  onDismissSuccess,
}: AgentAssemblyCardProps) {
  const { ts } = useI18n()
  const { draft, bindings, rationale, gaps } = result

  const bindRows = bindings.filter(
    (b) => b.action === 'bind' || b.action === 'install_then_bind',
  )
  const suggestRows = bindings.filter((b) => b.action === 'suggest_install_only')
  const hasCommunityRisk = bindRows.some((b) => b.selected && b.risk === 'community_mcp')
  const missingSelected = bindRows.filter(
    (b) => b.selected && !b.installed && b.action === 'install_then_bind',
  )

  if (createdDefinitionId) {
    return (
      <section className={styles.card} aria-label={ts('workforce.assemblySuccessTitle')}>
        <div className={styles.successRow}>
          <span>{ts('workforce.assemblySuccessBody', { name: draft.displayName })}</span>
          <div className={styles.footer}>
            {onUseInChat ? (
              <button type="button" className={styles.primary} onClick={onUseInChat}>
                {ts('workforce.assemblyUseInChat')}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.secondary}
              onClick={onDismissSuccess ?? onCancel}
            >
              {ts('workforce.assemblyStayInstalled')}
            </button>
          </div>
        </div>
      </section>
    )
  }

  const patchDraft = (partial: Partial<WorkforceAgentDraft>) => {
    onChangeDraft({ ...draft, ...partial })
  }

  return (
    <section className={styles.card} aria-label={ts('workforce.assemblyTitle')} data-zone-interactive>
      <header className={styles.header}>
        <h3 className={styles.title}>{ts('workforce.assemblyTitle')}</h3>
        {rationale ? <p className={styles.rationale}>{rationale}</p> : null}
        {gaps?.map((gap) => (
          <p key={gap} className={styles.gap}>
            {gap}
          </p>
        ))}
      </header>

      <label className={styles.field}>
        <span className={styles.label}>{ts('workforce.draftName')}</span>
        <input
          className={styles.input}
          value={draft.displayName}
          disabled={busy}
          onChange={(e) => patchDraft({ displayName: e.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{ts('workforce.draftRole')}</span>
        <input
          className={styles.input}
          value={draft.roleLabel ?? ''}
          disabled={busy}
          onChange={(e) =>
            patchDraft({
              roleLabel: e.target.value.trim() ? e.target.value : undefined,
            })
          }
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{ts('workforce.draftInstructions')}</span>
        <textarea
          className={styles.textarea}
          rows={4}
          value={draft.instructions}
          disabled={busy}
          onChange={(e) => patchDraft({ instructions: e.target.value })}
        />
      </label>

      {hasCommunityRisk ? (
        <div className={styles.riskBanner}>{ts('workforce.assemblyCommunityRisk')}</div>
      ) : null}

      <p className={styles.sectionTitle}>{ts('workforce.assemblyBindings')}</p>
      <div className={styles.bindingList}>
        {bindRows.length === 0 ? (
          <span className={styles.bindingHint}>{ts('workforce.assemblyBindingsEmpty')}</span>
        ) : (
          bindRows.map((binding) => {
            const errored = installErrorIds.includes(`${binding.kind}:${binding.id}`)
            return (
              <label key={`${binding.kind}:${binding.id}`} className={styles.bindingRow}>
                <input
                  type="checkbox"
                  checked={binding.selected}
                  disabled={busy}
                  onChange={() =>
                    onChangeBindings(toggleBinding(bindings, binding.id, binding.kind))
                  }
                />
                <div className={styles.bindingMeta}>
                  <span className={styles.bindingName}>{binding.name}</span>
                  <div className={styles.badges}>
                    <span className={styles.badge}>{binding.kind}</span>
                    <span
                      className={`${styles.badge} ${binding.installed ? '' : styles.badgeMissing}`}
                    >
                      {binding.installed
                        ? ts('workforce.assemblyInstalled')
                        : ts('workforce.assemblyNotInstalled')}
                    </span>
                    {binding.trustTier ? (
                      <span className={styles.badge}>{binding.trustTier}</span>
                    ) : null}
                    {binding.risk === 'community_mcp' ? (
                      <span className={`${styles.badge} ${styles.badgeRisk}`}>
                        {ts('workforce.assemblyCommunityBadge')}
                      </span>
                    ) : null}
                    {errored ? (
                      <span className={`${styles.badge} ${styles.badgeRisk}`}>
                        {ts('workforce.assemblyInstallFailed')}
                      </span>
                    ) : null}
                  </div>
                  {binding.rationale ? (
                    <span className={styles.bindingHint}>{binding.rationale}</span>
                  ) : null}
                </div>
              </label>
            )
          })
        )}
      </div>

      {suggestRows.length > 0 ? (
        <details className={styles.suggestDetails}>
          <summary>
            {ts('workforce.assemblySuggestOnly')} ({suggestRows.length})
          </summary>
          <div className={styles.bindingList} style={{ marginTop: 8 }}>
            {suggestRows.map((binding) => (
              <label key={`${binding.kind}:${binding.id}`} className={styles.bindingRow}>
                <input
                  type="checkbox"
                  checked={binding.selected}
                  disabled={busy}
                  onChange={() =>
                    onChangeBindings(toggleBinding(bindings, binding.id, binding.kind))
                  }
                />
                <div className={styles.bindingMeta}>
                  <span className={styles.bindingName}>{binding.name}</span>
                  <div className={styles.badges}>
                    <span className={styles.badge}>{binding.kind}</span>
                    <span className={`${styles.badge} ${styles.badgeMissing}`}>
                      {ts('workforce.assemblySuggestInstall')}
                    </span>
                  </div>
                  {binding.rationale ? (
                    <span className={styles.bindingHint}>{binding.rationale}</span>
                  ) : null}
                </div>
              </label>
            ))}
          </div>
        </details>
      ) : null}

      <footer className={styles.footer}>
        <button type="button" className={styles.secondary} disabled={busy} onClick={onCancel}>
          {ts('workforce.draftCancel')}
        </button>
        {missingSelected.length > 0 || suggestRows.some((b) => b.selected) ? (
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={onInstallMissingOnly}
          >
            {ts('workforce.assemblyInstallMissing')}
          </button>
        ) : null}
        <button type="button" className={styles.primary} disabled={busy} onClick={onConfirmCreate}>
          {busy
            ? ts('workforce.assemblyCreating')
            : missingSelected.length > 0
              ? ts('workforce.assemblyCreateWithInstall')
              : ts('workforce.assemblyCreate')}
        </button>
      </footer>
    </section>
  )
}
