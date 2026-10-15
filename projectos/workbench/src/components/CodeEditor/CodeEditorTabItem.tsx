import { FileCode, X } from 'lucide-react'
import { memo, useCallback, type MouseEvent, type PointerEvent } from 'react'
import { useI18n } from '../../i18n'
import tabStyles from '../ui/tabStrip/TabStrip.module.css'

interface Props {
  filePath: string
  isActive: boolean
  isDirty: boolean
  showClose: boolean
  onTitlePointerDown: (filePath: string, event: PointerEvent<HTMLSpanElement>) => void
  onTitleClick: (event: MouseEvent<HTMLSpanElement>) => void
  onSelect: (filePath: string) => void
  onClose: (filePath: string) => void
  setTabRef: (filePath: string, el: HTMLDivElement | null) => void
}

function fileLabel(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

function CodeEditorTabItem({
  filePath,
  isActive,
  isDirty,
  showClose,
  onTitlePointerDown,
  onTitleClick,
  onSelect,
  onClose,
  setTabRef,
}: Props) {
  const { ts } = useI18n()

  const handleRef = useCallback(
    (el: HTMLDivElement | null) => {
      setTabRef(filePath, el)
    },
    [filePath, setTabRef],
  )

  const handleTitlePointerDown = useCallback(
    (event: PointerEvent<HTMLSpanElement>) => {
      onTitlePointerDown(filePath, event)
    },
    [filePath, onTitlePointerDown],
  )

  return (
    <div
      ref={handleRef}
      className={`${tabStyles.tab} ${isActive ? tabStyles.tabActive : ''}`}
      onClick={() => onSelect(filePath)}
      role="tab"
      aria-selected={isActive}
      title={filePath}
    >
      <FileCode size={16} strokeWidth={1.75} className={tabStyles.tabIcon} aria-hidden />
      <span
        onPointerDown={handleTitlePointerDown}
        onClick={onTitleClick}
        className={`${tabStyles.tabTitle} ${tabStyles.tabTitleDraggable}`}
      >
        {fileLabel(filePath)}
        {isDirty ? <span className={tabStyles.tabDirtyDot} aria-label={ts('editor.unsaved')} /> : null}
      </span>
      <button
        type="button"
        className={`${tabStyles.tabClose} ${!showClose ? tabStyles.tabCloseReserved : ''}`}
        aria-label={ts('code.closeTab')}
        aria-hidden={!showClose}
        tabIndex={showClose ? 0 : -1}
        onClick={(e) => {
          e.stopPropagation()
          if (showClose) onClose(filePath)
        }}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

export default memo(CodeEditorTabItem)
