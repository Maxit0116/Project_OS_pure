import { useRef, useState } from 'react'
import type { ModelApiFormat, ModelProfile, ModelProvider } from '@contracts/index'
import { modelProfileLabel, PROVIDER_PRESETS } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import Select from '../ui/Select'
import {
  defaultModelForProvider,
  modelValueForProviderSelection,
} from './modelProfileForm'
import { createSettingsSubmitGuard } from './settingsSubmitGuard'
import styles from './SettingsPanel.module.css'

const PROVIDERS: ModelProvider[] = ['openai', 'anthropic', 'ollama', 'custom']

const API_FORMATS: ModelApiFormat[] = [
  'openai_chat',
  'anthropic_messages',
  'ollama_chat',
]

function createProfileId() {
  return `model_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export default function ModelProfilesSection() {
  const settings = useWorkbenchStore((s) => s.settings)
  const saveModelProfile = useWorkbenchStore((s) => s.saveModelProfile)
  const deleteModelProfile = useWorkbenchStore((s) => s.deleteModelProfile)
  const setDefaultModelProfile = useWorkbenchStore((s) => s.setDefaultModelProfile)
  const testModelConnection = useWorkbenchStore((s) => s.testModelConnection)
  const { ts } = useI18n()

  const [name, setName] = useState('')
  const [provider, setProvider] = useState<ModelProvider>('openai')
  const [apiFormat, setApiFormat] = useState<ModelApiFormat>('openai_chat')
  const [displayName, setDisplayName] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [baseUrl, setBaseUrl] = useState<string>(PROVIDER_PRESETS.openai.defaultBaseUrl)
  const [apiKey, setApiKey] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [removeCredential, setRemoveCredential] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submitGuardRef = useRef<ReturnType<typeof createSettingsSubmitGuard> | null>(null)
  if (submitGuardRef.current === null) {
    submitGuardRef.current = createSettingsSubmitGuard(setSubmitting, setSubmitError)
  }

  if (!settings) return null

  const isCustom = provider === 'custom'
  const showApiKey = apiFormat !== 'ollama_chat'

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setProvider('openai')
    setApiFormat(PROVIDER_PRESETS.openai.apiFormat)
    setDisplayName('')
    setModel(defaultModelForProvider('openai'))
    setBaseUrl(PROVIDER_PRESETS.openai.defaultBaseUrl)
    setApiKey('')
    setRemoveCredential(false)
  }

  const handleProviderChange = (nextProvider: ModelProvider) => {
    setProvider(nextProvider)
    setModel(modelValueForProviderSelection(nextProvider))
    if (nextProvider === 'custom' || nextProvider === 'openai_compatible') {
      setApiFormat('openai_chat')
      setBaseUrl('')
      return
    }
    const preset = PROVIDER_PRESETS[nextProvider]
    setApiFormat(preset.apiFormat)
    setBaseUrl(preset.defaultBaseUrl)
  }

  const handleSave = () => {
    if (!name.trim() || !model.trim()) return
    if (isCustom && !baseUrl.trim()) return
    void submitGuardRef.current?.run(
      () => {
        const id = editingId ?? createProfileId()
        return saveModelProfile({
          id,
          name: name.trim(),
          provider,
          apiFormat,
          displayName: isCustom ? displayName.trim() || name.trim() : undefined,
          model: model.trim(),
          baseUrl: baseUrl.trim() || undefined,
          apiKey: apiKey.trim() || undefined,
          removeCredential,
          isDefault: !editingId && settings.modelProfiles.length === 0,
        })
      },
      resetForm,
      ts('settings.mutationFailed'),
    )
  }

  const handleEdit = (profile: ModelProfile) => {
    setEditingId(profile.id)
    setName(profile.name)
    setProvider(profile.provider)
    setApiFormat(profile.apiFormat ?? 'openai_chat')
    setDisplayName(profile.displayName ?? '')
    setModel(profile.model)
    setBaseUrl(profile.baseUrl ?? '')
    setApiKey('')
    setRemoveCredential(false)
  }

  const handleDelete = (profile: ModelProfile) => {
    const reboundCount = settings.agentProfiles.filter(
      (agent) => agent.modelProfileId === profile.id,
    ).length
    const replacement = settings.modelProfiles.find(
      (candidate) => candidate.id !== profile.id,
    )?.name ?? ts('settings.noReplacementModel')
    const confirmed = window.confirm(
      ts('settings.deleteModelConfirm', {
        name: profile.name,
        count: reboundCount,
        replacement,
      }),
    )
    if (!confirmed) return
    void submitGuardRef.current?.run(
      () => deleteModelProfile(profile.id),
      () => {
        if (editingId === profile.id) resetForm()
      },
      ts('settings.mutationFailed'),
    )
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{ts('settings.modelsTitle')}</h3>
      <div className={styles.list}>
        {settings.modelProfiles.map((profile) => (
          <ModelProfileRow
            key={profile.id}
            profile={profile}
            testing={testingId === profile.id}
            onTest={() => {
              setTestingId(profile.id)
              void testModelConnection(profile.id).finally(() => setTestingId(null))
            }}
            onEdit={() => handleEdit(profile)}
            onDelete={() => handleDelete(profile)}
            onSetDefault={() => {
              void submitGuardRef.current?.run(
                () => setDefaultModelProfile(profile.id),
                undefined,
                ts('settings.mutationFailed'),
              )
            }}
            isDefault={settings.execution.defaultModelProfileId === profile.id}
            mutationPending={submitting}
          />
        ))}
        {settings.modelProfiles.length === 0 && (
          <p className={styles.empty}>{ts('settings.noModels')}</p>
        )}
      </div>
      <div className={styles.formGrid}>
        <TextInput label={ts('settings.profileName')} value={name} onChange={(e) => setName(e.target.value)} />
        <Select
          label={ts('settings.provider')}
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
          options={PROVIDERS.map((value) => ({
            value,
            label:
              value === 'custom'
                ? ts('settings.customProvider')
                : value.charAt(0).toUpperCase() + value.slice(1),
          }))}
        />
        {isCustom && (
          <TextInput
            label={ts('settings.customProviderName')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="DeepSeek"
          />
        )}
        {isCustom && (
          <>
            <Select
              label={ts('settings.apiFormat')}
              value={apiFormat}
              onChange={(e) => setApiFormat(e.target.value as ModelApiFormat)}
              options={API_FORMATS.map((value) => ({
                value,
                label: ts(`settings.apiFormats.${value}`),
              }))}
            />
            <p className={styles.help}>{ts('settings.apiFormatHint')}</p>
          </>
        )}
        <TextInput label={ts('settings.model')} value={model} onChange={(e) => setModel(e.target.value)} />
        <TextInput
          label={isCustom ? `${ts('settings.baseUrl')} *` : ts('settings.baseUrl')}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={PROVIDER_PRESETS.openai.defaultBaseUrl}
          required={isCustom}
        />
        {showApiKey && (
          <TextInput
            label={ts('settings.apiKey')}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            disabled={removeCredential}
          />
        )}
        {editingId && settings.modelProfiles.find((profile) => profile.id === editingId)?.apiKeyRef && (
          <label className={styles.toolChip}>
            <input
              type="checkbox"
              checked={removeCredential}
              onChange={(event) => {
                setRemoveCredential(event.target.checked)
                if (event.target.checked) setApiKey('')
              }}
            />
            {ts('settings.removeCredential')}
          </label>
        )}
      </div>
      <div className={styles.formActions}>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={submitting || !name.trim() || !model.trim() || (isCustom && !baseUrl.trim())}
        >
          {editingId ? ts('settings.saveChanges') : ts('settings.addModel')}
        </Button>
        {editingId && (
          <Button variant="secondary" size="sm" onClick={resetForm} disabled={submitting}>
            {ts('common.cancel')}
          </Button>
        )}
      </div>
      {submitError && <p className={styles.formError} role="alert">{submitError}</p>}
    </section>
  )
}

function ModelProfileRow({
  profile,
  testing,
  onTest,
  onEdit,
  onDelete,
  onSetDefault,
  isDefault,
  mutationPending,
}: {
  profile: ModelProfile
  testing: boolean
  onTest: () => void
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
  isDefault: boolean
  mutationPending: boolean
}) {
  const { ts } = useI18n()
  const format = profile.apiFormat ?? 'openai_chat'
  return (
    <div className={styles.row}>
      <div>
        <div className={styles.rowTitle}>
          {modelProfileLabel(profile)}
          {isDefault && <span className={styles.badge}>{ts('settings.default')}</span>}
        </div>
        <div className={styles.rowMeta}>
          {profile.provider} · {format} · {profile.model}
        </div>
      </div>
      <div className={styles.rowActions}>
        {!isDefault && (
          <Button variant="ghost" size="sm" onClick={onSetDefault} disabled={mutationPending}>
            {ts('settings.setDefault')}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onEdit} disabled={mutationPending}>
          {ts('common.edit')}
        </Button>
        <Button variant="secondary" size="sm" onClick={onTest} disabled={testing}>
          {testing ? ts('common.loading') : ts('settings.testConnection')}
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete} disabled={mutationPending}>
          {ts('common.delete')}
        </Button>
      </div>
    </div>
  )
}
