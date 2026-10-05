import { useRef, useState } from 'react'
import type { AgentProfile, AgentProfileKind } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import Select from '../ui/Select'
import { createSettingsSubmitGuard } from './settingsSubmitGuard'
import { createClientId } from '../../utils/clientId'
import {
  DEFAULT_AGENT_PROFILE_TOOLS,
  emptyAgentProfileDraft,
  isAgentProfileDraftValid,
} from './agentProfileDraft'
import styles from './SettingsPanel.module.css'

const KINDS: AgentProfileKind[] = ['feature_change', 'debug_fix', 'custom']
const TOOL_OPTIONS = ['readFile', 'listFiles', 'getContext']

function createAgentId() {
  return createClientId('agent_')
}

export default function AgentProfilesSection() {
  const settings = useWorkbenchStore((s) => s.settings)
  const saveAgentProfile = useWorkbenchStore((s) => s.saveAgentProfile)
  const { ts } = useI18n()

  const [name, setName] = useState('')
  const [kind, setKind] = useState<AgentProfileKind>('feature_change')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [modelProfileId, setModelProfileId] = useState('')
  const [enabledTools, setEnabledTools] = useState<string[]>([...DEFAULT_AGENT_PROFILE_TOOLS])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submitGuardRef = useRef<ReturnType<typeof createSettingsSubmitGuard> | null>(null)
  if (submitGuardRef.current === null) {
    submitGuardRef.current = createSettingsSubmitGuard(setSubmitting, setSubmitError)
  }

  if (!settings) return null
  const toolOptions = TOOL_OPTIONS;

  const handleAdd = () => {
    const draft = { name, kind, systemPrompt, modelProfileId, enabledTools }
    if (!isAgentProfileDraftValid(draft)) {
      if (!modelProfileId) setSubmitError(ts('settings.selectModel'))
      return
    }
    void submitGuardRef.current?.run(
      () => {
        const profile: AgentProfile = {
          id: createAgentId(),
          name: name.trim(),
          kind,
          systemPrompt: systemPrompt.trim(),
          modelProfileId,
          enabledTools,
        }
        return saveAgentProfile(profile)
      },
      () => {
        const empty = emptyAgentProfileDraft()
        setName(empty.name)
        setKind(empty.kind)
        setSystemPrompt(empty.systemPrompt)
        setModelProfileId(empty.modelProfileId)
        setEnabledTools(empty.enabledTools)
      },
      ts('settings.mutationFailed'),
    )
  }

  const toggleTool = (tool: string) => {
    setEnabledTools((current) =>
      current.includes(tool) ? current.filter((item) => item !== tool) : [...current, tool],
    )
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{ts('settings.agentsTitle')}</h3>
      <div className={styles.list}>
        {settings.agentProfiles.map((profile) => (
          <div key={profile.id} className={styles.row}>
            <div>
              <div className={styles.rowTitle}>{profile.name}</div>
              <div className={styles.rowMeta}>{profile.kind}</div>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.formGrid}>
        <TextInput label={ts('settings.profileName')} value={name} onChange={(e) => setName(e.target.value)} />
        <Select
          label={ts('settings.agentKind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as AgentProfileKind)}
          options={KINDS.map((value) => ({ value, label: value }))}
        />
        <Select
          label={ts('settings.boundModel')}
          value={modelProfileId}
          onChange={(e) => setModelProfileId(e.target.value)}
          options={[
            { value: '', label: ts('settings.selectModel') },
            ...settings.modelProfiles.map((profile) => ({
              value: profile.id,
              label: profile.name,
            })),
          ]}
        />
        <label className={styles.textareaField}>
          <span className={styles.label}>{ts('settings.systemPrompt')}</span>
          <textarea
            className={styles.textarea}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
          />
        </label>
        <div className={styles.toolList}>
          {toolOptions.map((tool) => (
            <label key={tool} className={styles.toolChip}>
              <input
                type="checkbox"
                checked={enabledTools.includes(tool)}
                onChange={() => toggleTool(tool)}
              />
              {tool}
            </label>
          ))}
        </div>
      </div>
      <Button
        size="sm"
        onClick={handleAdd}
        disabled={submitting || !isAgentProfileDraftValid({
          name,
          kind,
          systemPrompt,
          modelProfileId,
          enabledTools,
        })}
      >
        {ts('settings.addAgent')}
      </Button>
      {submitError && <p className={styles.formError} role="alert">{submitError}</p>}
    </section>
  )
}
