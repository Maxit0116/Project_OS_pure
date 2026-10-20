import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ContextAssembly } from '@contracts/index'
import { isGlobalAgentScope, useWorkbenchStore } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import Chip from '../ui/Chip'
import { SkeletonCard } from '../ui/Skeleton'
import { resolveContextDropdownLabel } from './resolveContextDropdownLabel'
import styles from './ChatContextHeader.module.css'

const DROPDOWN_PANEL_ID = 'chat-context-dropdown-panel'

export default function ChatContextHeader() {
  const context = useWorkbenchStore((s) => s.context)
  const contextLoading = useWorkbenchStore((s) => s.contextLoading)
  const graph = useWorkbenchStore((s) => s.graph)
  const selectedNodeId = useWorkbenchStore((s) => s.selectedNodeId)
  const selectedFilePath = useWorkbenchStore((s) => s.selectedFilePath)
  const pendingFileOwnerChoice = useWorkbenchStore((s) => s.pendingFileOwnerChoice)
  const fileScopeError = useWorkbenchStore((s) => s.fileScopeError)
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const chooseFileOwner = useWorkbenchStore((s) => s.chooseFileOwner)
  const chatMode = useWorkbenchStore((s) => s.chatMode)
  const lastAnchoredAnswer = useWorkbenchStore((s) => s.lastAnchoredAnswer)
  const writeAnchoredAnswerAsDecision = useWorkbenchStore((s) => s.writeAnchoredAnswerAsDecision)
  const latestContextAssembly = useWorkbenchStore((s) => s.latestContextAssembly)
  const { ts } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [filesExpanded, setFilesExpanded] = useState(false)

  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId)
  const activeHandoffId = useWorkbenchStore((s) => s.activeHandoffId)
  const teamSnapshot = useWorkbenchStore((s) => s.teamSnapshot)
  const activeHandoff = teamSnapshot?.handoffs.find((handoff) => handoff.id === activeHandoffId)

  const wholeProjectScope = isGlobalAgentScope({
    selectedNodeId,
    selectedFilePath,
    pendingFileOwnerChoice,
    fileScopeError,
  })

  const dropdownLabel = useMemo(
    () =>
      resolveContextDropdownLabel({
        globalAgentActive: wholeProjectScope,
        selectedNodeId,
        selectedFilePath,
        nodeName: selectedNode?.name,
        contextSummary: context?.summary,
        globalScopeLabel: ts('context.scopeGlobal'),
        emptyLabel: ts('context.empty'),
      }),
    [
      context?.summary,
      selectedFilePath,
      selectedNode,
      selectedNodeId,
      ts,
      wholeProjectScope,
    ],
  )

  const scopeLabel = context ? ts(`scope.${context.scope}` as 'scope.feature') : null

  const scopeStatus = (
    <div className={styles.boundScope}>
      {wholeProjectScope && (
        <div>
          <strong>{ts('context.globalAgentScope')}</strong>
          <div>{ts('context.scopeGlobal')}</div>
        </div>
      )}
      {selectedNodeId && (
        <div>
          <strong>
            {selectedFilePath ? ts('context.fileAgentScope') : ts('context.nodeAgentScope')}
          </strong>
          <div>
            <strong>{ts('context.scopeNode')}:</strong> {selectedNode?.name ?? selectedNodeId}
          </div>
          {selectedFilePath && (
            <div>
              <strong>{ts('context.scopeFile')}:</strong> <code>{selectedFilePath}</code>
            </div>
          )}
        </div>
      )}
      {pendingFileOwnerChoice && (
        <div className={styles.ownerChoice}>
          <strong>{ts('context.ownershipChooser')}</strong>
          <code>{pendingFileOwnerChoice.filePath}</code>
          <div className={styles.ownerButtons}>
            {pendingFileOwnerChoice.candidateNodeIds.map((nodeId) => {
              const node = graph?.nodes.find((candidate) => candidate.id === nodeId)
              return (
                <button type="button" key={nodeId} onClick={() => chooseFileOwner(nodeId)}>
                  {node?.name ?? nodeId}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {fileScopeError === 'not_mapped' && (
        <div className={styles.scopeError}>{ts('context.fileNotMapped')}</div>
      )}
    </div>
  )

  const contextDetails = context ? (
    <div className={`${styles.details} fade-slide-up`} key={context.title}>
      <div className={styles.scopeRow}>
        <span className={styles.scope}>{scopeLabel}</span>
        <span className={styles.title}>{context.title}</span>
      </div>
      <p className={styles.summary}>{context.summary}</p>
      {activeHandoff && <p className={styles.summary}>{activeHandoff.currentSummary}</p>}
      {chatMode === 'anchored' && lastAnchoredAnswer?.recorded && (
        <button type="button" className={styles.toggle} onClick={() => void writeAnchoredAnswerAsDecision()}>
          {ts('team.writeDecision')}
        </button>
      )}

      {context.linkedFiles.length > 0 && (
        <div className={styles.section}>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setFilesExpanded((e) => !e)}
          >
            {ts('context.linkedFilesCount', { count: context.linkedFiles.length })}
            <span>{filesExpanded ? ` ${ts('context.collapse')}` : ` › ${ts('context.expand')}`}</span>
          </button>
          {filesExpanded && (
            <div className={styles.chips}>
              {context.linkedFiles.map((f) => (
                <Chip key={f.path} onClick={() => selectFile(f.path, context.nodeId)} title={f.role}>
                  {f.path.split('/').pop()}
                  <span className={styles.chipRole}>{f.role}</span>
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {(context.upstream.length > 0 || context.downstream.length > 0) && (
        <div className={styles.relationsInline}>
          {context.upstream.length > 0 && (
            <span>
              <strong>{ts('context.upstream')}:</strong> {context.upstream.join(', ')}
            </span>
          )}
          {context.upstream.length > 0 && context.downstream.length > 0 && (
            <span className={styles.relationSep}>|</span>
          )}
          {context.downstream.length > 0 && (
            <span>
              <strong>{ts('context.downstream')}:</strong> {context.downstream.join(', ')}
            </span>
          )}
        </div>
      )}
    </div>
  ) : (
    !wholeProjectScope && <div className={styles.empty}>{ts('context.empty')}</div>
  )

  const assembly = latestContextAssembly ?? undefined

  return (
    <div className={styles.header}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={DROPDOWN_PANEL_ID}
      >
        <ChevronDown
          size={14}
          className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
          aria-hidden
        />
        {contextLoading ? (
          <span className={styles.triggerSkeleton}>
            <SkeletonCard lines={1} />
          </span>
        ) : (
          <span className={styles.triggerLabel}>{dropdownLabel}</span>
        )}
        {activeHandoff && !contextLoading && (
          <span className={styles.triggerHandoff} title={activeHandoff.currentSummary}>
            {ts('team.handoffs')}: {activeHandoff.currentSummary}
          </span>
        )}
        {scopeLabel && !contextLoading && (
          <span className={styles.triggerScope}>{scopeLabel}</span>
        )}
      </button>
      {assembly && <ContextUsage assembly={assembly} />}

      {expanded && (
        <div id={DROPDOWN_PANEL_ID} className={styles.dropdownPanel}>
          {scopeStatus}
          {contextDetails}
        </div>
      )}
    </div>
  )
}

const USAGE_SLOTS = ['instructions', 'scope', 'pins', 'retrieval', 'memory', 'session'] as const

function ContextUsage({ assembly }: { assembly: ContextAssembly }) {
  const { ts } = useI18n()
  const total = USAGE_SLOTS.reduce((sum, slot) => sum + assembly.slots[slot].chars, 0)
  return (
    <div className={styles.usage}>
      <div className={styles.usageTitle}>{ts('context.usageTitle')}</div>
      {USAGE_SLOTS.map((slot) => {
        const record = assembly.slots[slot]
        const width = total > 0 ? Math.round((record.chars / total) * 100) : 0
        const detail = slot === 'retrieval' && !assembly.slots.retrieval.searched
          ? ts('context.usageNotSearched')
          : String(record.chars)
        return (
          <div className={styles.usageRow} key={slot}>
            <span>{ts(`context.usageSlots.${slot}`)}</span>
            <span className={styles.usageTrack}>
              <span className={styles.usageFill} style={{ width: `${width}%` }} />
            </span>
            <span>{detail}</span>
          </div>
        )
      })}
      {assembly.omissions.map((item) => (
        <div className={styles.usageOmission} key={item.reason}>
          {ts(`context.usageOmissions.${item.reason}`)} · {item.count}
        </div>
      ))}
    </div>
  )
}
