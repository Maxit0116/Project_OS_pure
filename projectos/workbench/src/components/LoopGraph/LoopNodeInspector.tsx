import { useRef, type KeyboardEvent } from 'react'
import {
  isConfigNode,
  withArchitectureDefaults,
  type IntentGraphNode,
  type LoopInstance,
  type LoopSpecNode,
} from '@contracts/index'
import { resolveAgentWiring } from '../../../../services/loop-agent-wiring'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useLoopGraphStore } from '../../state/loopGraphStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useComposePromptVoice } from '../ChatPanel/composer/useComposePromptVoice'
import {
  VoiceInputDock,
  VoiceInputErrorBanner,
} from '../ChatPanel/VoiceInputControls'
import { isCommunityMcpServer } from './LoopConfigAssetPicker'
import { LoopIntegrationIcon } from './integrations/LoopIntegrationIcon'
import {
  getLoopIntegration,
  runtimeStatusBlocksExecution,
  runtimeStatusNextStep,
} from './integrations/loopIntegrationRegistry'
import TextArea from '../ui/TextArea'
import TextInput from '../ui/TextInput'
import Select from '../ui/Select'
import { validateLoopNodeConfig } from '../../../../services/loop-node-config-schema'
import styles from './LoopNodeInspector.module.css'

interface Props {
  node: IntentGraphNode | null
  specNode?: LoopSpecNode | null
  activeInstance?: LoopInstance | null
  onChange: (patch: Partial<IntentGraphNode>) => void
  readOnly?: boolean
  /** When true, render as content inside a floating duty card (no sidebar chrome). */
  embedded?: boolean
}

export default function LoopNodeInspector({
  node,
  specNode,
  activeInstance,
  onChange,
  readOnly = false,
  embedded = false,
}: Props) {
  const { ts, locale } = useI18n()
  const document = useLoopGraphStore((s) => s.document)
  const setAgentWiringOverride = useLoopGraphStore((s) => s.setAgentWiringOverride)
  const applyWiringToAgentDefinition = useLoopGraphStore(
    (s) => s.applyWiringToAgentDefinition,
  )
  const saveWiringAsNewAgent = useLoopGraphStore((s) => s.saveWiringAsNewAgent)
  const openAgentFlowForRun = useChatSessionStore((s) => s.openAgentFlowForRun)
  const settings = useWorkbenchStore((s) => s.settings)
  const shellClass = embedded ? styles.embedded : styles.inspector
  const nodeRef = useRef(node)
  nodeRef.current = node
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly

  const composeVoice = useComposePromptVoice({
    locale,
    disabled: readOnly || !node || isConfigNode(node),
    getText: () => {
      const current = nodeRef.current
      return current && !isConfigNode(current) ? current.prompt : ''
    },
    setText: (text) => {
      const current = nodeRef.current
      if (!current || isConfigNode(current) || readOnlyRef.current) return
      onChangeRef.current({ prompt: text })
    },
  })

  if (!node) {
    return (
      <aside className={shellClass} aria-label={ts('chat.loopGraph.inspector')}>
        <p className={styles.empty}>{ts('chat.loopGraph.inspectorEmpty')}</p>
      </aside>
    )
  }

  if (isConfigNode(node)) {
    return (
      <aside className={shellClass} aria-label={ts('chat.loopGraph.inspector')}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{ts('chat.loopGraph.inspectorWiring')}</h3>
          <div className={styles.metaRow}>
            <span className={styles.chip}>config</span>
            {node.satelliteKind ? (
              <span className={styles.chip}>{node.satelliteKind}</span>
            ) : null}
          </div>
          <TextInput
            fieldClassName={styles.field}
            label={ts('chat.loopGraph.inspectorTitle')}
            value={node.title}
            disabled={readOnly}
            onChange={(event) => onChange({ title: event.target.value })}
          />
          <pre className={styles.artifactBody}>
            {JSON.stringify(node.configRef ?? {}, null, 2)}
          </pre>
        </section>
      </aside>
    )
  }

  const arch = withArchitectureDefaults(node)
  const artifacts =
    activeInstance?.artifacts?.filter((item) => item.nodeId === node.id) ?? []
  const isCursor = activeInstance?.cursorNodeId === node.id
  const wiring =
    arch.type === 'agent' && document
      ? resolveAgentWiring(node, document.draft)
      : null

  return (
    <aside className={shellClass} aria-label={ts('chat.loopGraph.inspector')}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{ts('chat.loopGraph.inspectorDuty')}</h3>
        <TextInput
          fieldClassName={styles.field}
          label={ts('chat.loopGraph.inspectorTitle')}
          value={node.title}
          disabled={readOnly}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <div className={styles.field}>
          {composeVoice.voice.state.error ? (
            <VoiceInputErrorBanner
              errorKey={composeVoice.voice.state.error}
              onDismiss={composeVoice.voice.dismissError}
              labels={composeVoice.voiceLabels}
            />
          ) : null}
          <div className={styles.promptWrap}>
            <TextArea
              label={ts('chat.loopGraph.inspectorPrompt')}
              fieldClassName={styles.promptField}
              resize="vertical"
              value={node.prompt}
              disabled={readOnly}
              rows={4}
              onChange={(event) => {
                const value = event.target.value
                onChange({ prompt: value })
                composeVoice.syncBaseFromExternalText(value)
              }}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (
                  event.key === 'Escape' &&
                  (composeVoice.voice.isRecording || composeVoice.voice.isTranscribing)
                ) {
                  event.preventDefault()
                  composeVoice.cancelVoice()
                  return
                }
                if (
                  (event.metaKey || event.ctrlKey) &&
                  event.shiftKey &&
                  event.code === 'Space'
                ) {
                  event.preventDefault()
                  composeVoice.dockProps.onMicToggle()
                }
              }}
            />
            <VoiceInputDock {...composeVoice.dockProps} />
          </div>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.chip}>{arch.type}</span>
          {arch.agentRole ? <span className={styles.chip}>{arch.agentRole}</span> : null}
          {arch.humanMode ? <span className={styles.chip}>{arch.humanMode}</span> : null}
          {arch.actionIntegration ? (
            <span className={styles.chip}>
              {arch.actionIntegration}
              {arch.actionOperation ? `.${arch.actionOperation}` : ''}
            </span>
          ) : null}
          {arch.logicKind ? <span className={styles.chip}>{arch.logicKind}</span> : null}
        </div>
        {arch.type === 'agent' ? (
          <>
            <p className={styles.hint}>
              {ts('workforce.assignedAgent')}:{' '}
              {node.agentDefinitionId
                ? node.agentDefinitionId
                : ts('workforce.assignedGeneral')}
            </p>
            <TextInput
              fieldClassName={styles.field}
              type="number"
              min={1}
              max={600000}
              label="Timeout (ms)"
              data-testid="agent-timeout-ms"
              value={node.timeoutMs ?? ''}
              disabled={readOnly}
              onChange={(event) => {
                const raw = event.target.value
                onChange({
                  timeoutMs: raw === '' ? undefined : Number(raw) || undefined,
                })
              }}
            />
          </>
        ) : null}
      </section>

      {arch.type === 'action' && arch.actionIntegration ? (
        <section className={styles.section} data-testid="saas-action-config">
          <h3 className={styles.sectionTitle}>Integration</h3>
          <div className={styles.metaRow}>
            <span className={styles.chip} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <LoopIntegrationIcon
                integrationId={arch.actionIntegration}
                size={14}
              />
              {getLoopIntegration(arch.actionIntegration)?.displayName ??
                arch.actionIntegration}
            </span>
          </div>
          {(() => {
            const meta = getLoopIntegration(arch.actionIntegration)
            const status = meta?.defaultRuntimeStatus ?? 'unconfigured'
            const blocked = runtimeStatusBlocksExecution(status)
            const validation = validateLoopNodeConfig(node)
            return (
              <>
                <Select
                  data-testid="saas-action-select"
                  label="Operation"
                  disabled={readOnly || !meta}
                  value={arch.actionOperation ?? ''}
                  onChange={(event) =>
                    onChange({ actionOperation: event.target.value || undefined })
                  }
                  options={(meta?.actions ?? []).map((action) => ({
                    value: action.id,
                    label: `${action.label} (${action.kind})`,
                  }))}
                />
                <TextInput
                  fieldClassName={styles.field}
                  label="Credential ref"
                  data-testid="action-credential-ref"
                  value={node.credentialRefId ?? ''}
                  disabled={readOnly}
                  placeholder="cred_… (secret never stored here)"
                  onChange={(event) =>
                    onChange({
                      credentialRefId: event.target.value.trim() || undefined,
                    })
                  }
                />
                <TextInput
                  fieldClassName={styles.field}
                  type="number"
                  min={1}
                  max={600000}
                  label="Timeout (ms)"
                  data-testid="action-timeout-ms"
                  value={node.timeoutMs ?? ''}
                  disabled={readOnly}
                  onChange={(event) => {
                    const raw = event.target.value
                    onChange({
                      timeoutMs: raw === '' ? undefined : Number(raw) || undefined,
                    })
                  }}
                />
                {validation.issues.length > 0 ? (
                  <ul className={styles.hint} data-testid="node-config-issues">
                    {validation.issues.map((issue) => (
                      <li key={`${issue.path}:${issue.code}`}>{issue.message}</li>
                    ))}
                  </ul>
                ) : null}
                {validation.blocksRun ? (
                  <p className={styles.hint} data-testid="node-config-blocks-run">
                    Not runnable yet — fix required fields / credentials. Configured ≠
                    authorized to execute.
                  </p>
                ) : null}
                {blocked && meta ? (
                  <p className={styles.hint} data-testid="saas-runtime-next-step">
                    {runtimeStatusNextStep(meta, status)}
                  </p>
                ) : null}
                {meta?.brandNote ? <p className={styles.hint}>{meta.brandNote}</p> : null}
              </>
            )
          })()}
        </section>
      ) : null}

      {arch.type === 'logic' ? (
        <section className={styles.section} data-testid="logic-node-config">
          <h3 className={styles.sectionTitle}>Logic</h3>
          <Select
            label="Kind"
            data-testid="logic-kind-select"
            disabled={readOnly}
            value={arch.logicKind ?? 'condition'}
            onChange={(event) =>
              onChange({
                logicKind: event.target.value as IntentGraphNode['logicKind'],
              })
            }
            options={[
              { value: 'condition', label: 'Condition' },
              { value: 'loop', label: 'Loop' },
              { value: 'merge', label: 'Merge' },
              { value: 'exit', label: 'Exit' },
              { value: 'retry', label: 'Retry' },
              { value: 'wait', label: 'Wait' },
            ]}
          />
          {arch.logicKind === 'retry' ? (
            <TextInput
              fieldClassName={styles.field}
              type="number"
              min={1}
              max={20}
              label="Retry limit"
              data-testid="logic-retry-limit"
              disabled={readOnly}
              value={node.retryLimit ?? 2}
              onChange={(event) =>
                onChange({ retryLimit: Number(event.target.value) || 1 })
              }
            />
          ) : null}
          {arch.logicKind === 'wait' ? (
            <TextInput
              fieldClassName={styles.field}
              type="number"
              min={0}
              max={3600000}
              label="Wait (ms)"
              data-testid="logic-wait-ms"
              disabled={readOnly}
              value={node.waitMs ?? 0}
              onChange={(event) =>
                onChange({ waitMs: Number(event.target.value) || 0 })
              }
            />
          ) : null}
        </section>
      ) : null}

      {arch.type === 'human' ? (
        <section className={styles.section} data-testid="human-node-config">
          <h3 className={styles.sectionTitle}>Human</h3>
          <Select
            label="Mode"
            data-testid="human-mode-select"
            disabled={readOnly}
            value={arch.humanMode ?? 'approval'}
            onChange={(event) =>
              onChange({
                humanMode: event.target.value as IntentGraphNode['humanMode'],
              })
            }
            options={[
              { value: 'approval', label: 'Approval' },
              { value: 'review', label: 'Review' },
              { value: 'input', label: 'Input' },
              { value: 'decision', label: 'Decision' },
              { value: 'takeover', label: 'Takeover' },
            ]}
          />
          <TextInput
            fieldClassName={styles.field}
            label="Assignee / approver"
            data-testid="human-assignee"
            disabled={readOnly}
            value={node.humanAssignee ?? ''}
            onChange={(event) =>
              onChange({
                humanAssignee: event.target.value.trim() || undefined,
              })
            }
          />
          <TextInput
            fieldClassName={styles.field}
            label="Allowed actions (comma-separated)"
            data-testid="human-allowed-actions"
            disabled={readOnly}
            value={(node.humanAllowedActions ?? []).join(', ')}
            onChange={(event) => {
              const parts = event.target.value
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean)
                .slice(0, 12)
              onChange({
                humanAllowedActions: parts.length ? parts : undefined,
              })
            }}
          />
        </section>
      ) : null}

      {arch.type === 'agent' && wiring ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{ts('chat.loopGraph.inspectorWiring')}</h3>
          {wiring.missingModel ? (
            <p className={styles.hint}>{ts('chat.loopGraph.inspectorWiringMissingModel')}</p>
          ) : null}
          {node.agentWiringOverride ? (
            <p className={styles.hint}>{ts('chat.loopGraph.inspectorWiringOverride')}</p>
          ) : null}
          <div className={styles.kv}>
            <div>
              <span>{ts('chat.loopGraph.inspectorWiringModel')}</span>
              <strong>{wiring.modelProfileId ?? '—'}</strong>
            </div>
            <div>
              <span>{ts('chat.loopGraph.inspectorWiringMemory')}</span>
              <strong>{wiring.memoryMode ?? '—'}</strong>
            </div>
            <div>
              <span>{ts('chat.loopGraph.inspectorWiringSkills')}</span>
              <strong>
                {wiring.skillIds.length ? wiring.skillIds.join(', ') : '—'}
              </strong>
            </div>
            <div>
              <span>{ts('chat.loopGraph.inspectorWiringMcp')}</span>
              <strong>
                {wiring.mcpServerIds.length
                  ? wiring.mcpServerIds
                      .map((id) => {
                        const server = settings?.mcpServers?.find((item) => item.id === id)
                        const tags = [
                          server?.name ?? id,
                          isCommunityMcpServer(server)
                            ? ts('chat.loopGraph.wiringMcpCommunity')
                            : null,
                          server?.enabled === false
                            ? ts('chat.loopGraph.wiringMcpDisabled')
                            : null,
                        ].filter(Boolean)
                        return tags.join(' · ')
                      })
                      .join(', ')
                  : '—'}
              </strong>
            </div>
          </div>
          {!wiring.modelProfileId &&
          wiring.skillIds.length === 0 &&
          wiring.mcpServerIds.length === 0 &&
          !wiring.memoryMode ? (
            <p className={styles.hint}>{ts('chat.loopGraph.inspectorWiringEmpty')}</p>
          ) : null}
          {!readOnly ? (
            <div className={styles.wiringActions}>
              {node.agentDefinitionId ? (
                <button
                  type="button"
                  className={styles.wiringPrimary}
                  onClick={() => {
                    if (
                      !window.confirm(ts('chat.loopGraph.wiringApplyConfirm'))
                    ) {
                      return
                    }
                    void applyWiringToAgentDefinition(node.id)
                  }}
                >
                  {ts('chat.loopGraph.wiringApplyToAgent')}
                </button>
              ) : null}
              <button
                type="button"
                className={styles.clearOverride}
                onClick={() => {
                  const name = window.prompt(
                    ts('chat.loopGraph.wiringSaveAsPrompt'),
                    node.title || 'Specialized Agent',
                  )
                  if (name == null) return
                  void saveWiringAsNewAgent(node.id, {
                    displayName: name.trim() || node.title,
                  })
                }}
              >
                {ts('chat.loopGraph.wiringSaveAsAgent')}
              </button>
              {node.agentWiringOverride ? (
                <button
                  type="button"
                  className={styles.clearOverride}
                  onClick={() => setAgentWiringOverride(node.id, null)}
                >
                  {ts('chat.loopGraph.inspectorClearOverride')}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{ts('chat.loopGraph.inspectorConfig')}</h3>
        {arch.type === 'logic' && arch.logicKind === 'loop' ? (
          <TextInput
            fieldClassName={styles.field}
            type="number"
            min={1}
            max={50}
            label={ts('chat.loopGraph.inspectorMaxIterations')}
            data-testid="logic-max-iterations"
            disabled={readOnly}
            value={node.maxIterations ?? 3}
            onChange={(event) =>
              onChange({ maxIterations: Number(event.target.value) || 1 })
            }
          />
        ) : null}
        {arch.type === 'agent' && arch.agentRole === 'planner' ? (
          <p className={styles.hint}>{ts('chat.loopGraph.inspectorPlannerHint')}</p>
        ) : null}
        {arch.type === 'agent' && arch.agentRole === 'coder' ? (
          <p className={styles.hint}>{ts('chat.loopGraph.inspectorCoderHint')}</p>
        ) : null}
        {arch.type === 'agent' && arch.agentRole === 'reviewer' ? (
          <p className={styles.hint}>{ts('chat.loopGraph.inspectorReviewerHint')}</p>
        ) : null}
        {arch.type === 'action' && arch.actionIntegration === 'test' ? (
          <p className={styles.hint}>{ts('chat.loopGraph.inspectorTestHint')}</p>
        ) : null}
        {arch.type === 'action' && arch.actionIntegration === 'github' ? (
          <p className={styles.hint}>{ts('chat.loopGraph.inspectorGithubHint')}</p>
        ) : null}
        {specNode ? (
          <div className={styles.kv}>
            <div>
              <span>role</span>
              <strong>{specNode.role}</strong>
            </div>
            <div>
              <span>acceptance</span>
              <strong>{specNode.acceptance.length}</strong>
            </div>
          </div>
        ) : (
          <p className={styles.hint}>{ts('chat.loopGraph.inspectorConfigDraft')}</p>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{ts('chat.loopGraph.inspectorRuntime')}</h3>
        {activeInstance ? (
          <div className={styles.kv}>
            <div>
              <span>status</span>
              <strong>{activeInstance.status}</strong>
            </div>
            <div>
              <span>cursor</span>
              <strong>{isCursor ? 'yes' : 'no'}</strong>
            </div>
            <div>
              <span>attempts</span>
              <strong>{activeInstance.attemptCounts[node.id] ?? 0}</strong>
            </div>
            {typeof activeInstance.loopIterations?.[node.id] === 'number' ? (
              <div>
                <span>loop</span>
                <strong>{activeInstance.loopIterations[node.id]}</strong>
              </div>
            ) : null}
          </div>
        ) : (
          <p className={styles.hint}>{ts('chat.loopGraph.inspectorRuntimeIdle')}</p>
        )}
        {activeInstance?.activeRunId ? (
          <button
            type="button"
            className={styles.openAssociatedRun}
            data-testid="loop-open-associated-run"
            data-loop-open-associated-run={activeInstance.activeRunId}
            onClick={() => openAgentFlowForRun(activeInstance.activeRunId ?? null)}
          >
            {ts('chat.loopGraph.openAssociatedRun')}
          </button>
        ) : (
          <p className={styles.hint} data-testid="loop-open-associated-run-idle">
            {ts('chat.loopGraph.openAssociatedRunIdle')}
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{ts('chat.loopGraph.inspectorArtifacts')}</h3>
        {artifacts.length === 0 ? (
          <p className={styles.hint}>{ts('chat.loopGraph.inspectorArtifactsEmpty')}</p>
        ) : (
          <ul className={styles.artifactList}>
            {artifacts.map((artifact) => (
              <li key={artifact.id}>
                <span className={styles.chip}>{artifact.kind}</span>
                <pre className={styles.artifactBody}>
                  {JSON.stringify(artifact.data, null, 2).slice(0, 600)}
                </pre>
              </li>
            ))}
          </ul>
        )}
        {activeInstance?.pendingActionPayload ? (
          <div className={styles.pendingPayload}>
            <span>{ts('chat.loopGraph.inspectorPendingPayload')}</span>
            <pre className={styles.artifactBody}>
              {JSON.stringify(activeInstance.pendingActionPayload, null, 2).slice(0, 400)}
            </pre>
          </div>
        ) : null}
      </section>
    </aside>
  )
}
