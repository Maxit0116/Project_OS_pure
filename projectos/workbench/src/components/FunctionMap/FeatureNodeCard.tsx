import {
  AppWindow,
  Boxes,
  Braces,
  Database,
  Globe2,
  Puzzle,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { OpenGraphButton } from './OpenGraphButton'
import styles from './FeatureNode.module.css'

export interface FeatureNodeData {
  label: string
  nameEn?: string
  status: string
  nodeType: string
  elementType?: string
  elementTypeLabel: string
  layerLabel?: string
  responsibility?: string
  responsibilityLabel: string
  purposeFirst?: boolean
  technology?: string
  technologyLabel: string
  evidenceLabel: string
  suggestedLabel: string
  responsibilityMissing: string
  technologyMissing: string
  openGraphLabel: string
  canOpenGraph?: boolean
  onOpenGraph?: () => void
  fileCount: number
  isSelected: boolean
  ownerInitials?: string
  collabStatus?: string
  collabStatusLabel?: string
  isBouncing?: boolean
  dimmed?: boolean
  focusOpacity?: number
  flash?: number
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  person: UserRound,
  software_system: AppWindow,
  external_system: Globe2,
  container: Boxes,
  component: Puzzle,
  code_element: Braces,
  data_store: Database,
}

const STATUS_CLASS: Record<string, string> = {
  active: styles.statusActive,
  in_progress: styles.statusProgress,
  error: styles.statusError,
  suggested: styles.statusSuggested,
}

export function isPurposeFirstArchitectureLevel(level: string | undefined): boolean {
  return level === 'context' || level === 'container' || level === 'component'
}

/** Selection blue. Type is shown by the label, not a per-type color. */
export function featureNodeAccent(_elementType: string | undefined): string {
  return '#4c7dff'
}

/**
 * Presentational feature card shared by flat React Flow nodes and branch 3D cards.
 */
export function FeatureNodeCard({ data }: { data: FeatureNodeData }) {
  const statusClass = STATUS_CLASS[data.status] ?? styles.statusSuggested
  const isError = data.status === 'error'
  const isSuggested = data.nodeType === 'suggested' || data.status === 'suggested'
  const TypeIcon = TYPE_ICONS[data.elementType ?? ''] ?? AppWindow
  const isCodeElement = data.elementType === 'code_element'
  const responsibility = data.responsibility ?? data.responsibilityMissing
  const purposeFirst = Boolean(data.purposeFirst && !isCodeElement)
  const focusOpacity = data.focusOpacity ?? 1
  const fullyHidden = focusOpacity < 0.01

  return (
    <div
      className={`${styles.node} ${data.isSelected ? styles.selected : ''} ${isSuggested ? styles.suggested : ''} ${isError ? styles.errorBorder : ''} ${data.isBouncing ? 'node-bounce' : ''} ${isError && data.isSelected ? 'node-error-pulse' : ''} ${data.dimmed ? styles.dimmed : ''}`}
      style={{
        opacity: focusOpacity,
        ...(fullyHidden ? { visibility: 'hidden' as const } : {}),
      }}
      data-element-type={data.elementType ?? 'architecture'}
      data-tour="architecture-node"
      data-zone-interactive
      key={data.flash}
    >
      <div className={styles.eyebrow}>
        <span className={styles.typeIcon} aria-hidden>
          <TypeIcon size={12} strokeWidth={1.9} />
        </span>
        <span>{data.elementTypeLabel}</span>
        {data.layerLabel && <span className={styles.layerLabel}>· {data.layerLabel}</span>}
        {data.status !== 'active' && (
          <span className={`${styles.dot} ${statusClass}`} aria-hidden />
        )}
      </div>

      {isCodeElement ? (
        <>
          <div className={styles.codePurpose}>
            <span className={styles.codePurposeLabel}>{data.responsibilityLabel}</span>
            <strong>{data.responsibility ?? data.responsibilityMissing}</strong>
          </div>
          <div className={styles.fileIdentity} title={data.label}>
            {data.label}
          </div>
        </>
      ) : (
        <>
          {purposeFirst && (
            <div
              className={styles.purposeFirst}
              data-purpose-first
              title={responsibility}
              aria-label={`${data.responsibilityLabel}: ${responsibility}`}
            >
              <span className={styles.purposeFirstLabel}>{data.responsibilityLabel}</span>
              <strong>{responsibility}</strong>
            </div>
          )}

          <div className={styles.header}>
            <span className={styles.label}>{data.label}</span>
            {data.ownerInitials && (
              <span className={styles.ownerBadge} title={data.ownerInitials}>
                {data.ownerInitials}
              </span>
            )}
            {data.collabStatus && data.collabStatus !== 'unclaimed' && (
              <span className={styles.collabBadge} data-status={data.collabStatus}>
                {data.collabStatusLabel ?? data.collabStatus.replace('_', ' ')}
              </span>
            )}
            {data.nodeType === 'suggested' && <span className={styles.badge}>{data.suggestedLabel}</span>}
          </div>

          {data.nameEn && <div className={styles.nameEn}>{data.nameEn}</div>}

          {!purposeFirst && (
            <div className={styles.responsibility}>
              <span className={styles.fieldLabel}>{data.responsibilityLabel}</span>
              <span>{responsibility}</span>
            </div>
          )}

          <div className={styles.footer}>
            <span className={styles.technology}>
              <span className={styles.fieldLabel}>{data.technologyLabel}</span>
              {data.technology ?? data.technologyMissing}
            </span>
            {data.fileCount > 0 && (
              <span className={styles.fileCount} title={data.evidenceLabel}>
                {data.evidenceLabel}
              </span>
            )}
          </div>
        </>
      )}
      {data.canOpenGraph && data.onOpenGraph && (
        <OpenGraphButton
          label={data.openGraphLabel}
          active={data.isSelected}
          onOpen={data.onOpenGraph}
        />
      )}
    </div>
  )
}
