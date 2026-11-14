import { useEffect, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  LOOP_PALETTE_ITEMS,
  type AgentDefinition,
  type LoopGraphPreset,
  type LoopPaletteCategory,
  type LoopSatelliteKind,
} from '@contracts/index'
import { ChevronLeft, ChevronRight, LayoutTemplate } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useLoopGraphStore } from '../../state/loopGraphStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import AgentPicker from '../AgentWorkforce/AgentPicker'
import { openMarketplaceTalentLibrary } from '../Marketplace/openMarketplaceTalentLibrary'
import LoopConfigAssetPicker, {
  type ConfigAssetPick,
} from './LoopConfigAssetPicker'
import { LoopIntegrationIcon } from './integrations/LoopIntegrationIcon'
import {
  encodePaletteDragPayload,
  LOOP_PALETTE_MIME,
  visualForPaletteItem,
} from './loopNodeVisuals'
import styles from './LoopGraphPalette.module.css'

function configPickerKind(
  paletteItemId: string,
): Extract<LoopSatelliteKind, 'model' | 'skill' | 'mcp'> | null {
  if (paletteItemId === 'config.model') return 'model'
  if (paletteItemId === 'config.skill') return 'skill'
  if (paletteItemId === 'config.mcp') return 'mcp'
  return null
}

/** Config/capability satellites are added from Agent wiring ports, not the palette. */
const CATEGORIES: LoopPaletteCategory[] = [
  'workgroup',
  'agent',
  'action',
  'logic',
  'human',
]
const EXPAND_STORAGE_KEY = 'projectos.loopGraph.paletteExpanded'

interface Props {
  onPlaced?: (nodeId: string) => void
  /** World-space placement for click-to-place. */
  resolveClickPosition?: () => { x: number; y: number }
}

export default function LoopGraphPalette({ onPlaced, resolveClickPosition }: Props) {
  const { ts } = useI18n()
  const document = useLoopGraphStore((s) => s.document)
  const beginAuthorNodeFromPalette = useLoopGraphStore((s) => s.beginAuthorNodeFromPalette)
  const placeTalentSquadAsWorkGroup = useLoopGraphStore(
    (s) => s.placeTalentSquadAsWorkGroup,
  )
  const applyLoopPreset = useLoopGraphStore((s) => s.applyLoopPreset)
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const listLoopGraphPresets = useWorkbenchStore((s) => s.listLoopGraphPresets)
  const beginCreateAgentComposer = useWorkbenchStore((s) => s.beginCreateAgentComposer)
  const setComposerMode = useLoopGraphStore((s) => s.setComposerMode)
  const [expanded, setExpanded] = useState(() => {
    try {
      return sessionStorage.getItem(EXPAND_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [agentPickerFor, setAgentPickerFor] = useState<string | null>(null)
  const [squadSelectedIds, setSquadSelectedIds] = useState<string[]>([])
  const [workforceAgents, setWorkforceAgents] = useState<AgentDefinition[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [builtinPresets, setBuiltinPresets] = useState<LoopGraphPreset[]>([])
  const [userPresets, setUserPresets] = useState<LoopGraphPreset[]>([])
  const [configPicker, setConfigPicker] = useState<{
    paletteItemId: string
    kind: Extract<LoopSatelliteKind, 'model' | 'skill' | 'mcp'>
    anchor: { x: number; y: number }
  } | null>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(EXPAND_STORAGE_KEY, expanded ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [expanded])

  useEffect(() => {
    let cancelled = false
    void listLoopGraphPresets().then((result) => {
      if (cancelled || !result) return
      setBuiltinPresets(result.builtins)
      setUserPresets(result.user)
    })
    return () => {
      cancelled = true
    }
  }, [listLoopGraphPresets, project?.projectId])

  useEffect(() => {
    if (!agentPickerFor || !client?.listWorkforceAgents || !project) return
    let cancelled = false
    setAgentsLoading(true)
    void client
      .listWorkforceAgents({ projectId: project.projectId })
      .then((result) => {
        if (!cancelled) setWorkforceAgents(result.agents)
      })
      .catch(() => {
        if (!cancelled) setWorkforceAgents([])
      })
      .finally(() => {
        if (!cancelled) setAgentsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agentPickerFor, client, project])

  const defaultClickPosition = () => {
    if (!document) return { x: 80, y: 80 }
    const nodes = document.draft.nodes
    if (nodes.length === 0) return { x: 80, y: 80 }
    return {
      x: Math.max(...nodes.map((node) => node.position.x)) + 200,
      y: nodes.reduce((sum, node) => sum + node.position.y, 0) / nodes.length,
    }
  }

  const placeItem = async (
    paletteItemId: string,
    position?: { x: number; y: number },
    options?: {
      agentDefinitionId?: string | null
      title?: string
      agentRole?: import('@contracts/index').LoopAgentRole
      configRef?: { modelProfileId?: string; skillId?: string; mcpServerId?: string }
      wiringBase?: {
        modelProfileId?: string
        skillIds?: string[]
        mcpServerIds?: string[]
      }
    },
  ) => {
    if (!document) return
    const at = position ?? resolveClickPosition?.() ?? defaultClickPosition()
    const id = await beginAuthorNodeFromPalette(paletteItemId, at, options)
    if (id) onPlaced?.(id)
  }

  const onDragStart = (event: DragEvent, paletteItemId: string) => {
    event.dataTransfer.setData(LOOP_PALETTE_MIME, encodePaletteDragPayload(paletteItemId))
    event.dataTransfer.setData('text/plain', paletteItemId)
    event.dataTransfer.effectAllowed = 'copy'
  }

  const onAgentItemActivate = (paletteItemId: string) => {
    setSquadSelectedIds([])
    setAgentPickerFor(paletteItemId)
  }

  const onConfigItemActivate = (
    paletteItemId: string,
    event: { clientX: number; clientY: number },
  ) => {
    const kind = configPickerKind(paletteItemId)
    if (!kind) {
      void placeItem(paletteItemId)
      return
    }
    setConfigPicker({
      paletteItemId,
      kind,
      anchor: { x: event.clientX, y: event.clientY },
    })
  }

  const onConfigAssetPicked = (asset: ConfigAssetPick) => {
    if (!configPicker) return
    const { paletteItemId } = configPicker
    setConfigPicker(null)
    if (asset.kind === 'model') {
      void placeItem(paletteItemId, undefined, {
        title: `Model · ${asset.name}`,
        configRef: { modelProfileId: asset.id },
      })
      return
    }
    if (asset.kind === 'skill') {
      void placeItem(paletteItemId, undefined, {
        title: `Skill · ${asset.name}`,
        configRef: { skillId: asset.id },
      })
      return
    }
    void placeItem(paletteItemId, undefined, {
      title: `MCP · ${asset.name}`,
      configRef: { mcpServerId: asset.id },
    })
  }

  const renderPresetButton = (preset: LoopGraphPreset, compact = false) =>
    compact ? (
      <button
        key={preset.id}
        type="button"
        role="menuitem"
        className={styles.presetMenuItem}
        disabled={!document}
        onClick={() => {
          setPresetsOpen(false)
          void applyLoopPreset(preset.id)
        }}
      >
        {preset.title}
      </button>
    ) : (
      <button
        key={preset.id}
        type="button"
        className={styles.presetButton}
        disabled={!document}
        title={preset.description}
        onClick={() => void applyLoopPreset(preset.id)}
      >
        <span className={styles.itemTitle}>{preset.title}</span>
        <span className={styles.itemDesc}>{preset.description}</span>
      </button>
    )

  return (
    <aside
      className={`${styles.palette} ${expanded ? styles.paletteExpanded : styles.paletteCollapsed}`}
      aria-label={ts('chat.loopGraph.palette')}
    >
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          title={
            expanded
              ? ts('chat.loopGraph.paletteCollapse')
              : ts('chat.loopGraph.paletteExpand')
          }
          aria-label={
            expanded
              ? ts('chat.loopGraph.paletteCollapse')
              : ts('chat.loopGraph.paletteExpand')
          }
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronRight size={16} aria-hidden /> : <ChevronLeft size={16} aria-hidden />}
        </button>
      </div>

      <div className={styles.section}>
        {expanded ? (
          <h3 className={styles.sectionTitle}>{ts('chat.loopGraph.presets')}</h3>
        ) : null}
        {expanded ? (
          <>
            {builtinPresets.length > 0 ? (
              <>
                <div className={styles.categoryRailLabel}>{ts('chat.loopGraph.presetsBuiltIn')}</div>
                {builtinPresets.map((preset) => renderPresetButton(preset))}
              </>
            ) : null}
            {userPresets.length > 0 ? (
              <>
                <div className={styles.categoryRailLabel}>
                  {ts('chat.loopGraph.presetsInstalled')}
                </div>
                {userPresets.map((preset) => renderPresetButton(preset))}
              </>
            ) : null}
          </>
        ) : (
          <div className={styles.presetCollapsedWrap}>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.catDraft}`}
              disabled={!document}
              title={ts('chat.loopGraph.presets')}
              aria-label={ts('chat.loopGraph.presets')}
              aria-expanded={presetsOpen}
              onClick={() => setPresetsOpen((value) => !value)}
            >
              <LayoutTemplate size={16} aria-hidden />
            </button>
            {presetsOpen ? (
              <div className={styles.presetPopover} role="menu">
                {builtinPresets.map((preset) => renderPresetButton(preset, true))}
                {userPresets.map((preset) => renderPresetButton(preset, true))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {CATEGORIES.map((category) => {
        const items = LOOP_PALETTE_ITEMS.filter((item) => item.category === category)
        return (
          <div key={category} className={styles.section}>
            {expanded ? (
              <h3 className={styles.sectionTitle}>
                {ts(`chat.loopGraph.paletteCategory.${category}`)}
              </h3>
            ) : (
              <span className={styles.categoryRailLabel} aria-hidden>
                {category.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className={expanded ? styles.itemList : styles.iconRail}>
              {items.map((item) => {
                const visual = visualForPaletteItem(item)
                const Icon = visual.Icon
                const categoryClass =
                  visual.categoryClass === 'catWorkgroup'
                    ? styles.catWorkgroup
                    : visual.categoryClass === 'catAgent'
                      ? styles.catAgent
                      : visual.categoryClass === 'catAction'
                        ? styles.catAction
                        : visual.categoryClass === 'catLogic'
                          ? styles.catLogic
                          : visual.categoryClass === 'catHuman'
                            ? styles.catHuman
                            : visual.categoryClass === 'catConfig'
                              ? styles.catConfig
                              : styles.catDraft
                const isAgent = category === 'agent'
                const needsConfigPicker = Boolean(configPickerKind(item.id))
                if (!expanded) {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.iconButton} ${categoryClass}`}
                      disabled={!document}
                      title={item.title}
                      aria-label={`${item.title}. ${item.description}`}
                      draggable={Boolean(document) && !isAgent && !needsConfigPicker}
                      onDragStart={(event) => onDragStart(event, item.id)}
                      onClick={(event) =>
                        isAgent
                          ? onAgentItemActivate(item.id)
                          : needsConfigPicker
                            ? onConfigItemActivate(item.id, event)
                            : void placeItem(item.id)
                      }
                    >
                      {visual.integrationIconKey ? (
                        <LoopIntegrationIcon
                          integrationId={visual.integrationId}
                          iconKey={visual.integrationIconKey}
                          size={16}
                        />
                      ) : (
                        <Icon size={16} aria-hidden strokeWidth={1.75} />
                      )}
                    </button>
                  )
                }
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.itemButton} ${categoryClass}`}
                    disabled={!document}
                    title={item.description}
                    data-palette-item={item.id}
                    data-loop-integration={visual.integrationId ?? undefined}
                    draggable={Boolean(document) && !isAgent && !needsConfigPicker}
                    onDragStart={(event) => onDragStart(event, item.id)}
                    onClick={(event) =>
                      isAgent
                        ? onAgentItemActivate(item.id)
                        : needsConfigPicker
                          ? onConfigItemActivate(item.id, event)
                          : void placeItem(item.id)
                    }
                  >
                    <span className={styles.itemHead}>
                      <span className={`${styles.itemIcon} ${categoryClass}`}>
                        {visual.integrationIconKey ? (
                          <LoopIntegrationIcon
                            integrationId={visual.integrationId}
                            iconKey={visual.integrationIconKey}
                            size={14}
                          />
                        ) : (
                          <Icon size={14} aria-hidden strokeWidth={1.75} />
                        )}
                      </span>
                      <span className={styles.itemTitle}>{item.title}</span>
                    </span>
                    <span className={styles.itemDesc}>{item.description}</span>
                  </button>
                )
              })}
            </div>
            {category === 'agent' && agentPickerFor ? (
              <div className={styles.agentPickerPopover} role="dialog">
                <AgentPicker
                  agents={workforceAgents}
                  selectedDefinitionId={null}
                  loading={agentsLoading}
                  squadSelectedIds={squadSelectedIds}
                  onToggleSquadMember={(definitionId) => {
                    setSquadSelectedIds((prev) =>
                      prev.includes(definitionId)
                        ? prev.filter((id) => id !== definitionId)
                        : [...prev, definitionId],
                    )
                  }}
                  onComposeWorkGroup={() => {
                    const settings = useWorkbenchStore.getState().settings
                    const defaultModelId =
                      settings?.execution?.defaultModelProfileId ??
                      settings?.modelProfiles?.find((profile) => profile.isDefault)?.id ??
                      settings?.modelProfiles?.[0]?.id
                    const catalogListings =
                      useWorkbenchStore.getState().agentCatalogView?.document.listings ??
                      []
                    const members: Array<{
                      agentDefinitionId: string
                      title: string
                      agentRole?: import('@contracts/index').LoopAgentRole
                      wiringBase: {
                        modelProfileId?: string
                        skillIds: string[]
                        mcpServerIds: string[]
                      }
                    }> = []
                    for (const definitionId of squadSelectedIds) {
                      const match = workforceAgents.find(
                        (agent) => agent.definitionId === definitionId,
                      )
                      if (!match) continue
                      const listingId = match.config.marketplaceProvenance?.listingId
                      const template = listingId
                        ? catalogListings.find((entry) => entry.id === listingId)
                        : undefined
                      members.push({
                        agentDefinitionId: definitionId,
                        title: match.config.displayName,
                        ...(template?.suggestedLoopAgentRole
                          ? { agentRole: template.suggestedLoopAgentRole }
                          : {}),
                        wiringBase: {
                          modelProfileId:
                            match.config.modelProfileId ?? defaultModelId ?? undefined,
                          skillIds: match.config.skillIds ?? [],
                          mcpServerIds: match.config.mcpServerIds ?? [],
                        },
                      })
                    }
                    setAgentPickerFor(null)
                    setSquadSelectedIds([])
                    const at = resolveClickPosition?.() ?? defaultClickPosition()
                    void placeTalentSquadAsWorkGroup(members, at).then((wgId) => {
                      if (wgId) onPlaced?.(wgId)
                    })
                  }}
                  onSelectGeneral={() => {
                    const paletteId = agentPickerFor
                    setAgentPickerFor(null)
                    setSquadSelectedIds([])
                    void placeItem(paletteId, undefined, { agentDefinitionId: null })
                  }}
                  onSelectAgent={(definitionId) => {
                    const paletteId = agentPickerFor
                    const match = workforceAgents.find((agent) => agent.definitionId === definitionId)
                    const listingId = match?.config.marketplaceProvenance?.listingId
                    const catalogListings =
                      useWorkbenchStore.getState().agentCatalogView?.document.listings ??
                      []
                    const template = listingId
                      ? catalogListings.find((entry) => entry.id === listingId)
                      : undefined
                    const settings = useWorkbenchStore.getState().settings
                    const defaultModelId =
                      settings?.execution?.defaultModelProfileId ??
                      settings?.modelProfiles?.find((profile) => profile.isDefault)?.id ??
                      settings?.modelProfiles?.[0]?.id
                    setAgentPickerFor(null)
                    setSquadSelectedIds([])
                    void placeItem(paletteId, undefined, {
                      agentDefinitionId: definitionId,
                      title: match?.config.displayName,
                      ...(template?.suggestedLoopAgentRole
                        ? { agentRole: template.suggestedLoopAgentRole }
                        : {}),
                      wiringBase: match
                        ? {
                            modelProfileId:
                              match.config.modelProfileId ?? defaultModelId ?? undefined,
                            skillIds: match.config.skillIds ?? [],
                            mcpServerIds: match.config.mcpServerIds ?? [],
                          }
                        : undefined,
                    })
                  }}
                  onBrowseTalentLibrary={() => {
                    setAgentPickerFor(null)
                    setSquadSelectedIds([])
                    openMarketplaceTalentLibrary()
                  }}
                  onCreateAgent={() => {
                    setAgentPickerFor(null)
                    setSquadSelectedIds([])
                    beginCreateAgentComposer('loop')
                    void setComposerMode('create_agent')
                  }}
                />
                <button
                  type="button"
                  className={styles.agentPickerDismiss}
                  onClick={() => {
                    setAgentPickerFor(null)
                    setSquadSelectedIds([])
                  }}
                >
                  {ts('workforce.draftCancel')}
                </button>
              </div>
            ) : null}
          </div>
        )
      })}
      {configPicker
        ? createPortal(
            <LoopConfigAssetPicker
              kind={configPicker.kind}
              anchor={configPicker.anchor}
              onCancel={() => setConfigPicker(null)}
              onPick={onConfigAssetPicked}
            />,
            globalThis.document.body,
          )
        : null}
    </aside>
  )
}
