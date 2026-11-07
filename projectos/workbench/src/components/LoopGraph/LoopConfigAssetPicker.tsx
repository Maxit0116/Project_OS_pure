import { useEffect, useMemo, useState } from 'react'
import type { LoopSatelliteKind, McpServerConfig, SkillDescriptor } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import styles from './LoopConfigAssetPicker.module.css'

export type ConfigAssetPick =
  | { kind: 'model'; id: string; name: string }
  | { kind: 'skill'; id: string; name: string }
  | {
      kind: 'mcp'
      id: string
      name: string
      community: boolean
      enabled: boolean
    }

interface Props {
  kind: Extract<LoopSatelliteKind, 'model' | 'skill' | 'mcp'>
  /** Screen anchor for the popover. */
  anchor: { x: number; y: number }
  onPick: (asset: ConfigAssetPick) => void
  onCancel: () => void
}

function isCommunityMcp(server: McpServerConfig): boolean {
  return server.provenance?.trustTier === 'community'
}

export default function LoopConfigAssetPicker({ kind, anchor, onPick, onCancel }: Props) {
  const { ts } = useI18n()
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const settings = useWorkbenchStore((s) => s.settings)
  const setMarketplaceOpen = useChatSessionStore((s) => s.setMarketplaceOpen)
  const [skills, setSkills] = useState<SkillDescriptor[]>([])
  const [loading, setLoading] = useState(kind === 'skill')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (kind !== 'skill' || !client?.listSkills || !project) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void client
      .listSkills(project.projectId)
      .then((result) => {
        if (!cancelled) setSkills(result.skills)
      })
      .catch(() => {
        if (!cancelled) setSkills([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [kind, client, project])

  const models = settings?.modelProfiles ?? []
  const mcpServers = settings?.mcpServers ?? []

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (kind === 'model') {
      return models
        .filter((profile) =>
          !q
            ? true
            : profile.name.toLowerCase().includes(q) || profile.id.toLowerCase().includes(q),
        )
        .map((profile) => ({
          id: profile.id,
          name: profile.name,
          meta: profile.provider,
          community: false,
          enabled: true,
        }))
    }
    if (kind === 'skill') {
      return skills
        .filter((skill) =>
          !q
            ? true
            : skill.name.toLowerCase().includes(q) || skill.id.toLowerCase().includes(q),
        )
        .map((skill) => ({
          id: skill.id,
          name: skill.name,
          meta: skill.description.slice(0, 80),
          community: false,
          enabled: true,
        }))
    }
    return mcpServers
      .filter((server) =>
        !q
          ? true
          : server.name.toLowerCase().includes(q) || server.id.toLowerCase().includes(q),
      )
      .map((server) => ({
        id: server.id,
        name: server.name,
        meta: server.enabled
          ? isCommunityMcp(server)
            ? ts('chat.loopGraph.wiringMcpCommunity')
            : server.transport
          : ts('chat.loopGraph.wiringMcpDisabled'),
        community: isCommunityMcp(server),
        enabled: server.enabled,
      }))
  }, [kind, models, skills, mcpServers, query, ts])

  return (
    <div
      className={styles.popover}
      style={{ left: anchor.x, top: anchor.y }}
      role="dialog"
      aria-label={ts(`chat.loopGraph.wiringPicker_${kind}`)}
      data-zone-interactive
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className={styles.header}>
        <strong>{ts(`chat.loopGraph.wiringPicker_${kind}`)}</strong>
        <button type="button" className={styles.close} onClick={onCancel}>
          {ts('chat.loopGraph.wiringPickerCancel')}
        </button>
      </header>
      <input
        className={styles.search}
        value={query}
        placeholder={ts('chat.loopGraph.wiringPickerSearch')}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
      />
      <div className={styles.list} role="listbox">
        {loading ? (
          <p className={styles.empty}>{ts('chat.loopGraph.wiringPickerLoading')}</p>
        ) : rows.length === 0 ? (
          <div className={styles.emptyBlock}>
            <p className={styles.empty}>{ts('chat.loopGraph.wiringPickerEmpty')}</p>
            {kind !== 'model' ? (
              <button
                type="button"
                className={styles.marketplace}
                onClick={() => {
                  onCancel()
                  setMarketplaceOpen(true)
                }}
              >
                {ts('chat.loopGraph.wiringOpenMarketplace')}
              </button>
            ) : null}
          </div>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              role="option"
              className={styles.row}
              onClick={() => {
                if (kind === 'model') {
                  onPick({ kind: 'model', id: row.id, name: row.name })
                } else if (kind === 'skill') {
                  onPick({ kind: 'skill', id: row.id, name: row.name })
                } else {
                  onPick({
                    kind: 'mcp',
                    id: row.id,
                    name: row.name,
                    community: row.community,
                    enabled: row.enabled,
                  })
                }
              }}
            >
              <span className={styles.rowName}>
                {row.name}
                {row.community ? (
                  <span className={styles.riskBadge}>
                    {ts('chat.loopGraph.wiringMcpCommunity')}
                  </span>
                ) : null}
                {!row.enabled && kind === 'mcp' ? (
                  <span className={styles.warnBadge}>
                    {ts('chat.loopGraph.wiringMcpDisabled')}
                  </span>
                ) : null}
              </span>
              {row.meta ? <span className={styles.rowMeta}>{row.meta}</span> : null}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export function isCommunityMcpServer(server: McpServerConfig | undefined): boolean {
  if (!server) return false
  return isCommunityMcp(server)
}
