import { useRef, useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import type { AgentDefinition } from '@contracts/index'
import { useWorkbenchStore, type ChatMode } from '../../../state/workbenchStore'
import { useI18n } from '../../../i18n'
import { VoiceInputDock } from '../VoiceInputControls'
import ComposerModeSwitch from './ComposerModeSwitch'
import ComposerModelThinkingMenu from './ComposerModelThinkingMenu'
import ContextUsageRing from './ContextUsageRing'
import type { ContextUsageMetrics } from './contextUsageMetrics'
import styles from './ComposerControlBar.module.css'

interface VoiceInputDockProps {
  isRecording: boolean
  isTranscribing: boolean
  busyLabel?: string
  inline?: boolean
  labels: {
    start: string
    stop: string
    recording: string
  }
  micDisabled?: boolean
  isSupported: boolean
  onMicToggle: () => void
}

interface ComposerControlBarProps {
  chatMode: ChatMode
  onChatModeChange: (mode: ChatMode) => void
  submitDisabled: boolean
  /** When true, show Stop instead of (or beside) Send. */
  stopVisible?: boolean
  onStop?: () => void
  voice: VoiceInputDockProps
  usageMetrics: ContextUsageMetrics
  usageOpen: boolean
  onUsageToggle: () => void
}

export default function ComposerControlBar({
  chatMode,
  onChatModeChange,
  submitDisabled,
  stopVisible = false,
  onStop,
  voice,
  usageMetrics,
  usageOpen,
  onUsageToggle,
}: ComposerControlBarProps) {
  const settings = useWorkbenchStore((s) => s.settings)
  const selectedModelProfileId = useWorkbenchStore((s) => s.selectedModelProfileId)
  const selectChatModel = useWorkbenchStore((s) => s.selectChatModel)
  const setThinkingDepth = useWorkbenchStore((s) => s.setThinkingDepth)
  const setSettingsOpen = useWorkbenchStore((s) => s.setSettingsOpen)
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const activeAgentDefinitionId = useWorkbenchStore((s) => s.activeAgentDefinitionId)
  const activeAgentDisplayName = useWorkbenchStore((s) => s.activeAgentDisplayName)
  const createAgentComposerActive = useWorkbenchStore((s) => s.createAgentComposerActive)
  const setActiveAgentDefinitionId = useWorkbenchStore((s) => s.setActiveAgentDefinitionId)
  const beginCreateAgentComposer = useWorkbenchStore((s) => s.beginCreateAgentComposer)
  const exportCapabilityPack = useWorkbenchStore((s) => s.exportCapabilityPack)
  const pushToast = useWorkbenchStore((s) => s.pushToast)
  const askSubMode = useWorkbenchStore((s) => s.askSubMode)
  const setAskSubMode = useWorkbenchStore((s) => s.setAskSubMode)
  const { ts } = useI18n()

  const [workforceAgents, setWorkforceAgents] = useState<AgentDefinition[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [agentsLoaded, setAgentsLoaded] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  const loadWorkforceAgents = () => {
    if (!client?.listWorkforceAgents || !project || agentsLoaded || agentsLoading) return
    setAgentsLoading(true)
    void client
      .listWorkforceAgents({ projectId: project.projectId })
      .then((result) => {
        setWorkforceAgents(result.agents)
        setAgentsLoaded(true)
      })
      .catch(() => {
        setWorkforceAgents([])
        setAgentsLoaded(true)
      })
      .finally(() => {
        setAgentsLoading(false)
      })
  }

  const thinkingDepth = settings?.execution.thinkingDepth ?? 'medium'
  const modelProfiles = settings?.modelProfiles ?? []
  const presentationMode = settings?.presentationMode ?? false

  return (
    <div className={styles.footer} ref={barRef}>
      <div className={styles.leftCluster}>
        <ComposerModeSwitch
          mode={chatMode}
          askSubMode={askSubMode}
          agentDefinitionId={activeAgentDefinitionId}
          agentDisplayName={activeAgentDisplayName}
          createAgentActive={createAgentComposerActive}
          includeAnchored
          showCreateAgent
          showExportAgent
          agents={workforceAgents}
          agentsLoading={agentsLoading}
          onAgentFlyoutOpen={loadWorkforceAgents}
          onModeChange={(next) => onChatModeChange(next as ChatMode)}
          onAskSubModeChange={setAskSubMode}
          onSelectGeneralAgent={() => setActiveAgentDefinitionId(null)}
          onSelectAgent={(definitionId, displayName) => {
            setActiveAgentDefinitionId(definitionId, displayName)
          }}
          onCreateAgent={() => beginCreateAgentComposer('chat')}
          onExportAgent={(definitionId) => {
            void (async () => {
              const pack = await exportCapabilityPack({
                kind: 'agent',
                definitionId,
              })
              if (!pack) {
                pushToast({
                  type: 'warning',
                  message: ts('workforce.exportAgentFailed'),
                })
                return
              }
              try {
                await navigator.clipboard.writeText(pack.packJson)
                pushToast({
                  type: 'success',
                  message: ts('workforce.exportAgentCopied'),
                })
              } catch {
                pushToast({
                  type: 'warning',
                  message: ts('workforce.exportAgentFailed'),
                })
              }
            })()
          }}
        />

        <ComposerModelThinkingMenu
          modelProfiles={modelProfiles}
          selectedModelProfileId={selectedModelProfileId}
          thinkingDepth={thinkingDepth}
          presentationMode={presentationMode}
          onSelectModel={(profileId) => {
            void selectChatModel(profileId)
          }}
          onSelectThinkingDepth={(depth) => {
            void setThinkingDepth(depth)
          }}
          onConfigureModels={() => setSettingsOpen(true)}
        />
      </div>

      <div className={styles.rightCluster}>
        <ContextUsageRing
          metrics={usageMetrics}
          active={usageOpen}
          onClick={onUsageToggle}
          label={ts('context.usageRingLabel', { percent: usageMetrics.percentFull })}
        />
        <VoiceInputDock {...voice} inline />
        {stopVisible ? (
          <button
            type="button"
            className={styles.iconAction}
            onClick={() => onStop?.()}
            aria-label={ts('chat.stop')}
            title={ts('chat.stop')}
          >
            <Square size={14} fill="currentColor" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            className={`${styles.iconAction} ${styles.sendAction}`}
            disabled={submitDisabled}
            aria-label={ts('common.send')}
            title={ts('common.send')}
          >
            <ArrowUp size={16} strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}
