import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import {
  UI_STENCIL_CATALOG,
  type StencilCategory,
  type StencilDefinition,
} from '@contracts/ui-stencil'
import type { RepoDesignSystemSnapshot } from '@contracts/repo-design-system'
import { stencilMapsToRepoBadge } from '@contracts/repo-design-system'
import {
  isMotionAttachable,
  listMotionModifierStencils,
  stencilTitle,
} from './placeStencil'
import {
  formatStencilString,
  STENCIL_UI_STRINGS_EN,
  type StencilUiStrings,
} from './stencilStrings'
import styles from './StencilLibrary.module.css'

const CATEGORIES: StencilCategory[] = ['base', 'motion', 'visual', 'preset']

interface Props {
  open: boolean
  armedStencilId: string | null
  /** Optional motion modifier armed with a Base stencil (MVP: one). */
  armedMotionId: string | null
  /** Workspace design-system probe for "Maps to …" badges. */
  repoDesignSystem?: RepoDesignSystemSnapshot | null
  onClose: () => void
  onArm: (stencilId: string) => void
  onArmMotion: (motionId: string | null) => void
  onDisarm: () => void
  strings?: StencilUiStrings
}

export default function StencilLibrary({
  open,
  armedStencilId,
  armedMotionId,
  repoDesignSystem = null,
  onClose,
  onArm,
  onArmMotion,
  onDisarm,
  strings = STENCIL_UI_STRINGS_EN,
}: Props) {
  const [category, setCategory] = useState<StencilCategory>('base')
  const [query, setQuery] = useState('')

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return UI_STENCIL_CATALOG.filter((item) => {
      if (item.category !== category) return false
      if (!q) return true
      return (
        item.id.includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.includes(q))
      )
    })
  }, [category, query])

  const showMotionChips =
    armedStencilId != null && isMotionAttachable(armedStencilId)

  if (!open) return null

  const categoryLabel = (id: StencilCategory): string => {
    if (id === 'base') return strings.categoryBase
    if (id === 'motion') return strings.categoryMotion
    if (id === 'preset') return strings.categoryPreset
    return strings.categoryVisual
  }

  return (
    <aside className={styles.drawer} aria-label={strings.library}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>{strings.library}</h2>
          <p className={styles.subtitle}>{strings.libraryHint}</p>
        </div>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={strings.close}
          onClick={onClose}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </header>

      <div className={styles.searchRow}>
        <Search
          size={14}
          strokeWidth={2}
          className={styles.searchIcon}
          aria-hidden
        />
        <input
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={strings.search}
          aria-label={strings.search}
        />
      </div>

      <div className={styles.tabs} role="tablist">
        {CATEGORIES.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={category === id}
            className={`${styles.tab}${category === id ? ` ${styles.tabActive}` : ''}`}
            onClick={() => setCategory(id)}
          >
            {categoryLabel(id)}
          </button>
        ))}
      </div>

      {armedStencilId ? (
        <div className={styles.armedBar}>
          <span>
            {formatStencilString(strings.armed, {
              name: stencilTitle(armedStencilId),
            })}
          </span>
          <button type="button" className={styles.textBtn} onClick={onDisarm}>
            {strings.disarm}
          </button>
        </div>
      ) : null}

      {showMotionChips ? (
        <div className={styles.motionRow} aria-label={strings.motionModifier}>
          <span className={styles.motionLabel}>{strings.motionModifier}</span>
          <div className={styles.motionChips}>
            <button
              type="button"
              className={`${styles.motionChip}${
                !armedMotionId ? ` ${styles.motionChipActive}` : ''
              }`}
              onClick={() => onArmMotion(null)}
            >
              {strings.motionNone}
            </button>
            {listMotionModifierStencils().map((motion) => (
              <button
                key={motion.id}
                type="button"
                className={`${styles.motionChip}${
                  armedMotionId === motion.id ? ` ${styles.motionChipActive}` : ''
                }`}
                onClick={() => onArmMotion(motion.id)}
                title={motion.description}
              >
                {motion.title}
              </button>
            ))}
          </div>
          {armedMotionId ? (
            <span className={styles.motionArmedHint}>
              {formatStencilString(strings.motionArmed, {
                name: stencilTitle(armedMotionId),
              })}
            </span>
          ) : null}
        </div>
      ) : null}

      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <StencilRow
              item={item}
              armed={armedStencilId === item.id}
              codegenHint={item.codegen.packageHints?.[0]}
              mapsBadge={stencilMapsToRepoBadge(item.id, repoDesignSystem)}
              licenseLabel={strings.licenseNote}
              onArm={() => {
                onArm(item.id)
                if (!isMotionAttachable(item.id)) onArmMotion(null)
              }}
            />
          </li>
        ))}
        {items.length === 0 ? (
          <li className={styles.empty}>{strings.empty}</li>
        ) : null}
      </ul>
    </aside>
  )
}

function StencilRow({
  item,
  armed,
  codegenHint,
  mapsBadge,
  licenseLabel,
  onArm,
}: {
  item: StencilDefinition
  armed: boolean
  codegenHint?: string
  mapsBadge?: string
  licenseLabel: string
  onArm: () => void
}) {
  return (
    <button
      type="button"
      className={`${styles.row}${armed ? ` ${styles.rowArmed}` : ''}`}
      onClick={onArm}
      title={mapsBadge ?? codegenHint}
    >
      <span className={styles.thumb} data-category={item.category} aria-hidden>
        {item.title.slice(0, 1)}
      </span>
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{item.title}</span>
        <span className={styles.rowDesc}>{item.description}</span>
        {mapsBadge ? (
          <span className={styles.rowMaps}>{mapsBadge}</span>
        ) : codegenHint ? (
          <span className={styles.rowHint}>{codegenHint}</span>
        ) : null}
        {item.licenseNote ? (
          <span className={styles.rowLicense}>
            {licenseLabel}: {item.licenseNote}
          </span>
        ) : null}
      </span>
    </button>
  )
}
