import { useCallback, useEffect, useState } from 'react'
import type {
  AgentHarnessConfig,
  AgentMemoryDocument,
  AgentWorktreeRecord,
  ToolPermissionRule,
} from '@contracts/index'
import { HARNESS_TOOL_NAMES } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import styles from './SettingsPanel.module.css'

const TOOL_OPTIONS = ['*', ...HARNESS_TOOL_NAMES] as const

export default function HarnessSettingsSection() {
  const project = useWorkbenchStore((s) => s.project)
  const client = useWorkbenchStore((s) => s.client)
  const { ts } = useI18n()
  const [config, setConfig] = useState<AgentHarnessConfig | null>(null)
  const [memory, setMemory] = useState<AgentMemoryDocument | null>(null)
  const [worktrees, setWorktrees] = useState<AgentWorktreeRecord[]>([])
  const [diffById, setDiffById] = useState<Record<string, string>>({})
  const [pendingMergeId, setPendingMergeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [topicBody, setTopicBody] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!project) return
    const [nextConfig, nextWorktrees, nextMemory] = await Promise.all([
      client.getAgentHarnessConfig(project.projectId),
      client.listAgentWorktrees(project.projectId),
      client.getAgentMemory(project.projectId),
    ])
    setConfig(nextConfig)
    setWorktrees(nextWorktrees)
    setMemory(nextMemory)
  }, [client, project])

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [reload])

  if (!project) {
    return <p className={styles.empty}>{ts('settings.harness.noProject')}</p>
  }
  if (!config) {
    return <p className={styles.empty}>{error ?? ts('settings.harness.loading')}</p>
  }

  const updateRule = (index: number, patch: Partial<ToolPermissionRule>) => {
    setConfig({
      ...config,
      permissions: {
        ...config.permissions,
        rules: config.permissions.rules.map((rule, ruleIndex) =>
          ruleIndex === index ? { ...rule, ...patch } : rule,
        ),
      },
    })
  }

  return (
    <section className={styles.section}>
      <p className={styles.help}>{ts('settings.harness.intro')}</p>
      {error && <p className={styles.formError}>{error}</p>}

      {memory && (
        <>
          <h3 className={styles.sectionTitle}>{ts('settings.harness.memory')}</h3>
          <p className={styles.help}>{ts('settings.harness.memoryHelp')}</p>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={memory.settings.enabled}
              onChange={(event) =>
                setMemory({
                  ...memory,
                  settings: { ...memory.settings, enabled: event.target.checked },
                })
              }
            />
            {ts('settings.harness.memoryEnabled')}
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={memory.settings.useMemories}
              onChange={(event) =>
                setMemory({
                  ...memory,
                  settings: { ...memory.settings, useMemories: event.target.checked },
                })
              }
            />
            {ts('settings.harness.memoryUse')}
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={memory.settings.generateMemories}
              onChange={(event) =>
                setMemory({
                  ...memory,
                  settings: { ...memory.settings, generateMemories: event.target.checked },
                })
              }
            />
            {ts('settings.harness.memoryGenerate')}
          </label>
          <p className={styles.help}>{ts('settings.harness.memoryGenerateHelp')}</p>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={memory.settings.isolateByCheckout}
              onChange={(event) =>
                setMemory({
                  ...memory,
                  settings: { ...memory.settings, isolateByCheckout: event.target.checked },
                })
              }
            />
            {ts('settings.harness.memoryIsolate')}
          </label>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => {
              setSaving(true)
              void client
                .saveAgentMemorySettings(project.projectId, {
                  enabled: memory.settings.enabled,
                  useMemories: memory.settings.useMemories,
                  generateMemories: memory.settings.generateMemories,
                  isolateByCheckout: memory.settings.isolateByCheckout,
                })
                .then(setMemory)
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : String(err))
                })
                .finally(() => setSaving(false))
            }}
          >
            {ts('settings.harness.memorySave')}
          </Button>
          {memory.nearBudget && (
            <p className={styles.help}>{ts('settings.harness.memoryNearBudget')}</p>
          )}
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>{ts('settings.harness.memoryFilterType')}</span>
              <select className={styles.select} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">{ts('settings.harness.memoryAll')}</option>
                <option value="user">user</option>
                <option value="feedback">feedback</option>
                <option value="project">project</option>
                <option value="reference">reference</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{ts('settings.harness.memoryFilterState')}</span>
              <select className={styles.select} value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
                <option value="all">{ts('settings.harness.memoryAll')}</option>
                <option value="observed">observed</option>
                <option value="candidate">candidate</option>
                <option value="corroborated">corroborated</option>
                <option value="superseded">superseded</option>
              </select>
            </label>
          </div>
          {memory.entries.filter((entry) =>
            (typeFilter === 'all' || entry.type === typeFilter) &&
            (stateFilter === 'all' || entry.state === stateFilter),
          ).length === 0 ? (
            <p className={styles.help}>{ts('settings.harness.memoryEmpty')}</p>
          ) : (
            <div className={styles.list}>
              {memory.entries
                .filter((entry) =>
                  (typeFilter === 'all' || entry.type === typeFilter) &&
                  (stateFilter === 'all' || entry.state === stateFilter),
                )
                .slice(0, 40)
                .map((entry) => (
                <div className={styles.row} key={`${entry.added}-${entry.text}`}>
                  <div style={{ flex: 1 }}>
                    <div>{entry.text}</div>
                    <div className={styles.help}>
                      {entry.type} · {entry.state} · {entry.source}
                    </div>
                  </div>
                  {entry.state === 'observed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void client
                          .setAgentMemoryEntryState(project.projectId, entry.text, 'candidate')
                          .then(setMemory)
                          .catch((err: unknown) => {
                            setError(err instanceof Error ? err.message : String(err))
                          })
                      }}
                    >
                      {ts('settings.harness.memoryAdopt')}
                    </Button>
                  )}
                  {entry.state !== 'corroborated' && entry.state !== 'superseded' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void client
                          .setAgentMemoryEntryState(project.projectId, entry.text, 'corroborated')
                          .then(setMemory)
                          .catch((err: unknown) => {
                            setError(err instanceof Error ? err.message : String(err))
                          })
                      }}
                    >
                      {ts('settings.harness.memoryAlways')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void client
                        .getAgentMemoryTopic(project.projectId, entry.topicFile)
                        .then(setTopicBody)
                        .catch((err: unknown) => {
                          setError(err instanceof Error ? err.message : String(err))
                        })
                    }}
                  >
                    {ts('settings.harness.memoryTopic')}
                  </Button>
                  {entry.state !== 'superseded' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void client
                          .setAgentMemoryEntryState(project.projectId, entry.text, 'superseded')
                          .then(setMemory)
                          .catch((err: unknown) => {
                            setError(err instanceof Error ? err.message : String(err))
                          })
                      }}
                    >
                      {ts('settings.harness.memoryDismiss')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void client
                        .deleteAgentMemoryEntry(project.projectId, entry.text)
                        .then(setMemory)
                        .catch((err: unknown) => {
                          setError(err instanceof Error ? err.message : String(err))
                        })
                    }}
                  >
                    {ts('settings.harness.memoryDelete')}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {topicBody !== null && (
            <pre className={styles.help}>{topicBody || ts('settings.harness.memoryEmpty')}</pre>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void client
                .consolidateAgentMemory(project.projectId)
                .then(setMemory)
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : String(err))
                })
            }}
          >
            {ts('settings.harness.memoryConsolidate')}
          </Button>
        </>
      )}

      <h3 className={styles.sectionTitle}>{ts('settings.harness.permissions')}</h3>
      <div className={styles.list}>
        {config.permissions.rules.map((rule, index) => (
          <div className={styles.row} key={`${rule.tool}-${index}`}>
            <div className={styles.formGrid} style={{ flex: 1 }}>
              <label className={styles.field}>
                <span className={styles.label}>{ts('settings.harness.effect')}</span>
                <select
                  className={styles.select}
                  value={rule.effect}
                  onChange={(event) =>
                    updateRule(index, { effect: event.target.value as ToolPermissionRule['effect'] })
                  }
                >
                  <option value="deny">deny</option>
                  <option value="ask">ask</option>
                  <option value="allow">allow</option>
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{ts('settings.harness.tool')}</span>
                <select
                  className={styles.select}
                  value={rule.tool}
                  onChange={(event) =>
                    updateRule(index, { tool: event.target.value as ToolPermissionRule['tool'] })
                  }
                >
                  {TOOL_OPTIONS.map((tool) => (
                    <option key={tool} value={tool}>{tool}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{ts('settings.harness.match')}</span>
                <input
                  className={styles.select}
                  value={rule.match ?? ''}
                  placeholder="npm *"
                  onChange={(event) => {
                    const match = event.target.value.trim()
                    updateRule(index, match ? { match } : { match: undefined })
                  }}
                />
              </label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setConfig({
                  ...config,
                  permissions: {
                    ...config.permissions,
                    rules: config.permissions.rules.filter((_, ruleIndex) => ruleIndex !== index),
                  },
                })
              }
            >
              {ts('settings.harness.remove')}
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          setConfig({
            ...config,
            permissions: {
              ...config.permissions,
              rules: [...config.permissions.rules, { effect: 'deny', tool: 'shell' }],
            },
          })
        }
      >
        {ts('settings.harness.addRule')}
      </Button>

      <h3 className={styles.sectionTitle}>{ts('settings.harness.sandbox')}</h3>
      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={config.sandbox.networkAccess}
          onChange={(event) =>
            setConfig({
              ...config,
              sandbox: { ...config.sandbox, networkAccess: event.target.checked },
            })
          }
        />
        {ts('settings.harness.networkAccess')}
      </label>
      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={config.sandbox.allowTempWrites}
          onChange={(event) =>
            setConfig({
              ...config,
              sandbox: { ...config.sandbox, allowTempWrites: event.target.checked },
            })
          }
        />
        {ts('settings.harness.allowTempWrites')}
      </label>

      <h3 className={styles.sectionTitle}>{ts('settings.harness.modelHarness')}</h3>
      <div className={styles.list}>
        {config.modelHarness.variants.map((variant, index) => (
          <div className={styles.row} key={`variant-${index}`}>
            <div className={styles.formGrid} style={{ flex: 1 }}>
              <label className={styles.field}>
                <span className={styles.label}>{ts('settings.harness.modelMatch')}</span>
                <input
                  className={styles.select}
                  value={variant.match.model ?? ''}
                  placeholder="claude-*"
                  onChange={(event) => {
                    const model = event.target.value.trim()
                    const next = [...config.modelHarness.variants]
                    next[index] = {
                      ...variant,
                      match: { ...variant.match, ...(model ? { model } : { model: undefined }) },
                    }
                    setConfig({ ...config, modelHarness: { ...config.modelHarness, variants: next } })
                  }}
                />
              </label>
              <label className={styles.textareaField}>
                <span className={styles.label}>{ts('settings.harness.systemDelta')}</span>
                <textarea
                  className={styles.textarea}
                  value={variant.systemDelta ?? ''}
                  onChange={(event) => {
                    const next = [...config.modelHarness.variants]
                    next[index] = { ...variant, systemDelta: event.target.value }
                    setConfig({ ...config, modelHarness: { ...config.modelHarness, variants: next } })
                  }}
                />
              </label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setConfig({
                  ...config,
                  modelHarness: {
                    ...config.modelHarness,
                    variants: config.modelHarness.variants.filter((_, variantIndex) => variantIndex !== index),
                  },
                })
              }
            >
              {ts('settings.harness.remove')}
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          setConfig({
            ...config,
            modelHarness: {
              ...config.modelHarness,
              variants: [
                ...config.modelHarness.variants,
                { match: { model: '*' }, systemDelta: '' },
              ],
            },
          })
        }
      >
        {ts('settings.harness.addVariant')}
      </Button>

      <div className={styles.formActions}>
        <Button
          variant="primary"
          size="sm"
          disabled={saving}
          onClick={() => {
            setSaving(true)
            setError(null)
            void client.saveAgentHarnessConfig(project.projectId, config)
              .then((saved) => setConfig(saved))
              .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
              .finally(() => setSaving(false))
          }}
        >
          {ts('settings.harness.save')}
        </Button>
      </div>

      <h3 className={styles.sectionTitle}>{ts('settings.harness.worktrees')}</h3>
      <p className={styles.help}>{ts('settings.harness.worktreesHelp')}</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null)
          void client.createAgentWorktree(project.projectId)
            .then(() => reload())
            .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
        }}
      >
        {ts('settings.harness.createWorktree')}
      </Button>
      {worktrees.length === 0 && <p className={styles.empty}>{ts('settings.harness.noWorktrees')}</p>}
      <div className={styles.list}>
        {worktrees.map((record) => (
          <article className={styles.row} key={record.id}>
            <div>
              <div className={styles.rowTitle}>{record.id}</div>
              <div className={styles.rowMeta}>{record.branch} · {record.status}</div>
              <div className={styles.rowMeta}>{record.relativePath}</div>
              {diffById[record.id] !== undefined && (
                <pre className={styles.textarea}>{diffById[record.id]}</pre>
              )}
              {pendingMergeId === record.id && (
                <p className={styles.help}>{ts('settings.harness.mergeConfirm')}</p>
              )}
            </div>
            <div className={styles.rowActions}>
              {record.status === 'active' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void client.getAgentWorktreeDiff(project.projectId, record.id)
                        .then((diff) => setDiffById((current) => ({ ...current, [record.id]: diff })))
                        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                    }}
                  >
                    {ts('settings.harness.previewDiff')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (pendingMergeId !== record.id) {
                        setPendingMergeId(record.id)
                        return
                      }
                      setPendingMergeId(null)
                      void client.mergeAgentWorktree(project.projectId, {
                        worktreeId: record.id,
                        confirm: true,
                      })
                        .then(() => reload())
                        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                    }}
                  >
                    {pendingMergeId === record.id
                      ? ts('settings.harness.mergeNow')
                      : ts('settings.harness.merge')}
                  </Button>
                </>
              )}
              {record.status !== 'removed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void client.removeAgentWorktree(project.projectId, record.id, { deleteBranch: false })
                      .then(() => reload())
                      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                  }}
                >
                  {ts('settings.harness.removeWorktree')}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
