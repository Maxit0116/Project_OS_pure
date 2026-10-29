import { useRef, useState } from 'react'
import type { McpServerConfig, McpToolDescriptor, McpTransport } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import Select from '../ui/Select'
import { createSettingsSubmitGuard } from './settingsSubmitGuard'
import McpMarketplaceSection from './McpMarketplaceSection'
import styles from './SettingsPanel.module.css'

function createServerId() {
  return `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export default function McpServersSection() {
  const settings = useWorkbenchStore((s) => s.settings)
  const saveMcpServer = useWorkbenchStore((s) => s.saveMcpServer)
  const deleteMcpServer = useWorkbenchStore((s) => s.deleteMcpServer)
  const testMcpServer = useWorkbenchStore((s) => s.testMcpServer)
  const refreshMcpTools = useWorkbenchStore((s) => s.refreshMcpTools)
  const { ts } = useI18n()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [transport, setTransport] = useState<McpTransport>('stdio')
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [cwd, setCwd] = useState('')
  const [url, setUrl] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [toolsByServer, setToolsByServer] = useState<Record<string, McpToolDescriptor[]>>({})
  const [testingId, setTestingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submitGuardRef = useRef<ReturnType<typeof createSettingsSubmitGuard> | null>(null)
  if (submitGuardRef.current === null) {
    submitGuardRef.current = createSettingsSubmitGuard(setSubmitting, setSubmitError)
  }

  if (!settings) return null
  const servers = settings.mcpServers ?? []

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setEnabled(true)
    setTransport('stdio')
    setCommand('')
    setArgsText('')
    setCwd('')
    setUrl('')
    setAuthToken('')
  }

  const handleEdit = (server: McpServerConfig) => {
    setEditingId(server.id)
    setName(server.name)
    setEnabled(server.enabled)
    setTransport(server.transport)
    setCommand(server.command ?? '')
    setArgsText((server.args ?? []).join(' '))
    setCwd(server.cwd ?? '')
    setUrl(server.url ?? '')
    setAuthToken('')
  }

  const canSave =
    Boolean(name.trim()) &&
    (transport === 'stdio' ? Boolean(command.trim()) : Boolean(url.trim()))

  const handleSave = () => {
    if (!canSave) return
    void submitGuardRef.current?.run(
      () => {
        const id = editingId ?? createServerId()
        const args = argsText
          .trim()
          .split(/\s+/u)
          .filter(Boolean)
        const config: McpServerConfig = {
          id,
          name: name.trim(),
          enabled,
          transport,
          ...(transport === 'stdio'
            ? {
                command: command.trim(),
                ...(args.length ? { args } : {}),
                ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
              }
            : {
                url: url.trim(),
              }),
        }
        return saveMcpServer(config, authToken.trim() || undefined)
      },
      resetForm,
      ts('settings.mutationFailed'),
    )
  }

  return (
    <section className={styles.section}>
      <p className={styles.help}>{ts('settings.mcp.intro')}</p>
      <p className={styles.help}>{ts('settings.mcp.policyHint')}</p>

      <div className={styles.list}>
        {servers.map((server) => (
          <div key={server.id} className={styles.row}>
            <div>
              <div className={styles.rowTitle}>{server.name}</div>
              <div className={styles.rowMeta}>
                {server.transport}
                {server.enabled ? '' : ` · ${ts('settings.mcp.disabled')}`}
                {server.provenance
                  ? ` · ${ts('settings.mcp.marketProvenance', {
                      tier: server.provenance.trustTier,
                    })}`
                  : ''}
                {toolsByServer[server.id]?.length
                  ? ` · ${ts('settings.mcp.toolsListed', {
                      count: toolsByServer[server.id]!.length,
                    })}`
                  : ''}
              </div>
            </div>
            <div className={styles.rowActions}>
              <Button
                variant="ghost"
                size="sm"
                disabled={testingId === server.id}
                onClick={() => {
                  setTestingId(server.id)
                  void testMcpServer(server.id).finally(() => setTestingId(null))
                }}
              >
                {testingId === server.id ? ts('common.loading') : ts('settings.mcp.test')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void refreshMcpTools(server.id).then((tools) => {
                    setToolsByServer((prev) => ({ ...prev, [server.id]: tools }))
                  })
                }}
              >
                {ts('settings.mcp.refreshTools')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleEdit(server)} disabled={submitting}>
                {ts('common.edit')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={submitting}
                onClick={() => {
                  void deleteMcpServer(server.id)
                }}
              >
                {ts('common.delete')}
              </Button>
            </div>
          </div>
        ))}
        {servers.length === 0 && <p className={styles.empty}>{ts('settings.mcp.empty')}</p>}
      </div>

      <h3 className={styles.sectionTitle}>
        {editingId ? ts('settings.mcp.editTitle') : ts('settings.mcp.addTitle')}
      </h3>
      <div className={styles.formGrid}>
        <TextInput label={ts('settings.mcp.name')} value={name} onChange={(e) => setName(e.target.value)} />
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>{ts('settings.mcp.enabled')}</span>
        </label>
        <Select
          label={ts('settings.mcp.transport')}
          value={transport}
          onChange={(e) => setTransport(e.target.value as McpTransport)}
          options={[
            { value: 'stdio', label: 'stdio' },
            { value: 'http', label: 'http' },
          ]}
        />
        {transport === 'stdio' ? (
          <>
            <TextInput
              label={ts('settings.mcp.command')}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
            <TextInput
              label={ts('settings.mcp.args')}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
            />
            <TextInput
              label={ts('settings.mcp.cwd')}
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
            />
          </>
        ) : (
          <>
            <TextInput
              label={ts('settings.mcp.url')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <TextInput
              label={ts('settings.mcp.authToken')}
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder={ts('settings.mcp.authTokenPlaceholder')}
              autoComplete="off"
            />
          </>
        )}
      </div>
      <div className={styles.formActions}>
        <Button size="sm" onClick={handleSave} disabled={submitting || !canSave}>
          {editingId ? ts('settings.saveChanges') : ts('settings.mcp.addTitle')}
        </Button>
        {editingId && (
          <Button variant="secondary" size="sm" onClick={resetForm} disabled={submitting}>
            {ts('common.cancel')}
          </Button>
        )}
      </div>
      {submitError && <p className={styles.formError} role="alert">{submitError}</p>}

      <McpMarketplaceSection />
    </section>
  )
}
