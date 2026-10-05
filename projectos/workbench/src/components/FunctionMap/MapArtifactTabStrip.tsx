import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { MapArtifact } from '@contracts/index'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { getStoreMessage } from '../../i18n/storeMessages'
import { getMapArtifactDisplayTitle } from './mapArtifactTitle'
import {
  ARTIFACT_DROP_TARGET_ATTR,
  ARTIFACT_DROP_TYPE_ATTR,
  consumeTabClickSuppression,
  getTabDragState,
  getTabReorderPreview,
  isTabDragHoverTarget,
  sortStackMembersForTabs,
  startStackTabDrag,
  subscribeTabDrag,
} from './mapArtifactStack'
import styles from './MapArtifactTabStrip.module.css'

interface Props {
  members: MapArtifact[]
  activeId: string
  stackNodeId: string
  onSelect: (artifactId: string) => void
  onClose: (artifactId: string) => void
  onDetach: (artifactId: string, screenPoint: { x: number; y: number }) => void
  onMerge: (artifactId: string, targetNodeId: string) => void
  onReorder?: (orderedIds: string[]) => void
}

export default function MapArtifactTabStrip({
  members,
  activeId,
  stackNodeId,
  onSelect,
  onClose,
  onDetach,
  onMerge,
  onReorder,
}: Props) {
  const { ts } = useI18n()
  const locale = useWorkbenchStore((s) => s.locale)
  const pushToast = useWorkbenchStore((s) => s.pushToast)
  const stripRef = useRef<HTMLDivElement>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const untitledLabel = ts('mapArtifacts.untitledTitle')
  const sorted = sortStackMembersForTabs(members)
  const artifactType = sorted[0]?.type
  const isSolo = sorted.length === 1
  const reorderEnabled = sorted.length >= 2 && !!onReorder

  useSyncExternalStore(subscribeTabDrag, getTabDragState, getTabDragState)

  useEffect(
    () => () => {
      dragCleanupRef.current?.()
      dragCleanupRef.current = null
    },
    [],
  )

  if (sorted.length === 0 || !artifactType) return null

  const reorderPreview = getTabReorderPreview(stackNodeId)
  const displayMembers =
    reorderPreview !== null
      ? reorderPreview.orderedIds
          .map((id) => sorted.find((member) => member.id === id))
          .filter((member): member is MapArtifact => member !== undefined)
      : sorted

  const hoverState = isTabDragHoverTarget(stackNodeId, artifactType)
  const stripClassName = [
    styles.tabStrip,
    hoverState === 'compatible' ? styles.dropHighlight : '',
    hoverState === 'incompatible' ? styles.dropReject : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={stripRef}
      className={stripClassName}
      {...{
        [ARTIFACT_DROP_TARGET_ATTR]: stackNodeId,
        [ARTIFACT_DROP_TYPE_ATTR]: artifactType,
      }}
    >
      <div className={`${styles.tabTabs} nodrag nopan`}>
      {displayMembers.map((member, index) => {
        const isActive = member.id === activeId
        const isDragging =
          reorderPreview?.sourceArtifactId === member.id
        const showInsertBefore =
          reorderPreview !== null && reorderPreview.insertIndex === index
        const label = getMapArtifactDisplayTitle(member, untitledLabel)
        return (
          <div key={member.id} className={styles.tabSlot}>
            {showInsertBefore ? <span className={styles.insertIndicator} aria-hidden /> : null}
            <div
              className={`${styles.tab} nodrag nopan${isActive ? ` ${styles.tabActive}` : ''}${isSolo ? ` ${styles.tabSolo}` : ''}${isDragging ? ` ${styles.tabDragging}` : ''}`}
              role="tab"
              aria-selected={isActive}
              title={label}
              data-stack-tab-id={member.id}
              onClick={() => {
                if (consumeTabClickSuppression()) return
                if (!isActive) onSelect(member.id)
              }}
              onPointerDown={(event) => {
                if (!stripRef.current) return
                dragCleanupRef.current?.()
                dragCleanupRef.current = startStackTabDrag(
                  event,
                  member.id,
                  stackNodeId,
                  member.type,
                  label,
                  {
                    onDetach,
                    onMerge,
                    onReorder,
                    onTypeMismatch: () => {
                      pushToast({
                        type: 'error',
                        message: getStoreMessage(locale, 'mapArtifacts.stackTypeMismatch'),
                      })
                    },
                  },
                  {
                    sortedMemberIds: sorted.map((item) => item.id),
                    stripElement: stripRef.current,
                    reorderEnabled,
                  },
                )
              }}
            >
              <span className={styles.tabLabel}>{label}</span>
              <button
                type="button"
                className={`${styles.tabClose} nodrag nopan`}
                aria-label={ts('mapArtifacts.closeTab')}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(member.id)
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          </div>
        )
      })}
      {reorderPreview !== null && reorderPreview.insertIndex >= displayMembers.length ? (
        <span className={styles.insertIndicator} aria-hidden />
      ) : null}
      </div>
      <div className={styles.tabStripDragPad} aria-hidden />
    </div>
  )
}
