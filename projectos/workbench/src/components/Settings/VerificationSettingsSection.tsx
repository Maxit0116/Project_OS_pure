import { useEffect, useMemo, useState } from 'react'
import type { ExecCommand } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import styles from './SettingsPanel.module.css'
import {
  DEFAULT_TIMEOUT_SECONDS,
  MAX_TIMEOUT_SECONDS,
  MAX_VERIFICATION_COMMANDS,
  MIN_TIMEOUT_SECONDS,
  commandsFromRows,
  detectPackageManager,
  detectVerificationSuggestions,
  formatCommandLine,
  suggestionsNotConfigured,
  type CommandLineProblem,
  type CommandRow,
  type VerificationSuggestion,
} from './verificationCommands'

type Row = CommandRow

let nextRowKey = 1

function rowsFrom(commands: ExecCommand[]): Row[] {
  return commands.map((command) => ({
    key: nextRowKey++,
    line: formatCommandLine(command),
    seconds: Math.round(command.timeoutMs / 1000),
  }))
}

export default function VerificationSettingsSection() {
  const settings = useWorkbenchStore((s) => s.settings)
  const project = useWorkbenchStore((s) => s.project)
  const client = useWorkbenchStore((s) => s.client)
  const updateSettings = useWorkbenchStore((s) => s.updateSettings)
  const { ts } = useI18n()
  const configured = useMemo(() => settings?.verification?.commands ?? [], [settings])
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(configured))
  const [problems, setProblems] = useState<Record<number, CommandLineProblem>>({})
  const [detected, setDetected] = useState<VerificationSuggestion[] | null>(null)
  const [saving, setSaving] = useState(false)

  const projectId = project?.projectId
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void (async () => {
      try {
        const entries = await client.listWorkspaceDirectory(projectId, '')
        const names = new Set(entries.map((entry) => entry.name))
        const packageJson = names.has('package.json')
          ? await client.getFileContent(projectId, 'package.json').catch(() => undefined)
          : undefined
        const found = detectVerificationSuggestions({
          packageJson,
          hasTsconfig: names.has('tsconfig.json'),
          packageManager: detectPackageManager({
            pnpm: names.has('pnpm-lock.yaml'),
            yarn: names.has('yarn.lock'),
            bun: names.has('bun.lockb') || names.has('bun.lock'),
          }),
        })
        if (!cancelled) setDetected(found)
      } catch {
        if (!cancelled) setDetected([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, projectId])

  const current = commandsFromRows(rows)
  const unchanged = JSON.stringify(current.commands) === JSON.stringify(configured) &&
    Object.keys(current.problems).length === 0
  const suggestions = suggestionsNotConfigured(detected ?? [], current.commands)
  const full = rows.length >= MAX_VERIFICATION_COMMANDS

  if (!settings) return null

  const addRow = (line: string, seconds: number) => {
    if (full) return
    setRows((existing) => [...existing, { key: nextRowKey++, line, seconds }])
  }

  const save = async () => {
    const { commands, problems: found } = commandsFromRows(rows)
    setProblems(found)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await updateSettings({ verification: { commands } })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={styles.section}>
      <p className={styles.help}>{ts('settings.verification.help')}</p>

      {rows.length === 0 && <p className={styles.empty}>{ts('settings.verification.empty')}</p>}

      {rows.map((row) => (
        <div key={row.key} className={styles.formGrid}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <TextInput
                id={`verification-command-${row.key}`}
                label={ts('settings.verification.commandLabel')}
                style={{ fontFamily: 'var(--font-mono, monospace)' }}
                value={row.line}
                placeholder={ts('settings.verification.commandPlaceholder')}
                spellCheck={false}
                onChange={(event) => {
                  const line = event.target.value
                  setRows((existing) => existing.map((item) => (item.key === row.key ? { ...item, line } : item)))
                  setProblems((existing) => {
                    if (!(row.key in existing)) return existing
                    const { [row.key]: _dropped, ...rest } = existing
                    return rest
                  })
                }}
              />
            </div>
            <div style={{ width: 120 }}>
              <TextInput
                id={`verification-timeout-${row.key}`}
                label={ts('settings.verification.timeoutLabel')}
                type="number"
                min={MIN_TIMEOUT_SECONDS}
                max={MAX_TIMEOUT_SECONDS}
                value={row.seconds}
                onChange={(event) => {
                  const seconds = Number(event.target.value)
                  setRows((existing) => existing.map((item) => (item.key === row.key ? { ...item, seconds } : item)))
                }}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRows((existing) => existing.filter((item) => item.key !== row.key))}
            >
              {ts('settings.verification.remove')}
            </Button>
          </div>
          {problems[row.key] && (
            <p className={styles.formError} role="alert">{ts(`settings.verification.problem.${problems[row.key]}`)}</p>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Button variant="ghost" size="sm" disabled={full} onClick={() => addRow('', DEFAULT_TIMEOUT_SECONDS)}>
          {ts('settings.verification.addBlank')}
        </Button>
        <Button size="sm" disabled={unchanged || saving} onClick={() => void save()}>
          {ts('settings.verification.save')}
        </Button>
      </div>
      {full && <p className={styles.help}>{ts('settings.verification.tooMany', { max: MAX_VERIFICATION_COMMANDS })}</p>}

      <h3 className={styles.sectionTitle}>{ts('settings.verification.suggestedTitle')}</h3>
      {detected !== null && suggestions.length === 0 && detected.length === 0 && (
        <p className={styles.help}>{ts('settings.verification.suggestedNone')}</p>
      )}
      {suggestions.map((suggestion) => (
        <div key={suggestion.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ minWidth: 88 }}>{ts(`settings.verification.kind.${suggestion.kind}`)}</span>
          <code style={{ flex: 1 }}>{suggestion.line}</code>
          <Button size="sm" variant="ghost" disabled={full} onClick={() => addRow(suggestion.line, suggestion.timeoutSeconds)}>
            {ts('settings.verification.add')}
          </Button>
        </div>
      ))}
    </section>
  )
}
