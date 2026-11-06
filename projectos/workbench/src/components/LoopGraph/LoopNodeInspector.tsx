import {
  isConfigNode,
  withArchitectureDefaults,
  type IntentGraphNode,
  type LoopInstance,
  type LoopSpecNode,
} from '@contracts/index'
import { resolveAgentWiring } from '../../../../services/loop-agent-wiring'
import { useI18n } from '../../i18n'
import { useLoopGraphStore } from '../../state/loopGraphStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { isCommunityMcpServer } from './LoopConfigAssetPicker'
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
  const { ts } = useI18n()
  const document = useLoopGraphStore((s) => s.document)
  const setAgentWiringOverride = useLoopGraphStore((s) => s.setAgentWiringOverride)
  const applyWiringToAgentDefinition = useLoopGraphStore(
    (s) => s.applyWiringToAgentDefinition,
  )
  const saveWiringAsNewAgent = useLoopGraphStore((s) => s.saveWiringAsNewAgent)
  const settings = useWorkbenchStore((s) => s.settings)
  const shellClass = embedded ? styles.embedded : styles.inspector
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
          <label className={styles.field}>
            <span>{ts('chat.loopGraph.inspectorTitle')}</span>
            <input
              value={node.title}
              disabled={readOnly}
              onChange={(event) => onChange({ title: event.target.value })}
            />
          </label>
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
        <label className={styles.field}>
          <span>{ts('chat.loopGraph.inspectorTitle')}</span>
          <input
            value={node.title}
            disabled={readOnly}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{ts('chat.loopGraph.inspectorPrompt')}</span>
          <textarea
            value={node.prompt}
            disabled={readOnly}
            rows={4}
            onChange={(event) => onChange({ prompt: event.target.value })}
          />
        </label>
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
          <p className={styles.hint}>
            {ts('workforce.assignedAgent')}:{' '}
            {node.agentDefinitionId
              ? node.agentDefinitionId
              : ts('workforce.assignedGeneral')}
          </p>
        ) : null}
      </section>

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
          <label className={styles.field}>
            <span>{ts('chat.loopGraph.inspectorMaxIterations')}</span>
            <input
              type="number"
              min={1}
              max={50}
              disabled={readOnly}
              value={node.maxIterations ?? 3}
              onChange={(event) =>
                onChange({ maxIterations: Number(event.target.value) || 1 })
              }
            />
          </label>
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
