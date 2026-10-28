import {
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from 'react'
import { getStencilById } from '@contracts/ui-stencil'
import StencilPreviewVisual from './StencilPreviewVisual'
import styles from './StencilLiveStub.module.css'

interface Props {
  stencilId: string
  dimmed?: boolean
  className?: string
  style?: CSSProperties
  /** Drag the placed stub (badge / empty chrome). Interactive controls stay clickable. */
  onMovePointerDown?: (event: ReactPointerEvent<HTMLElement>) => void
}

/**
 * Interactive on-canvas stub for a placed stencil.
 * Outer box size comes from placement.rect (corner-resize); inner chrome fills it.
 */
export default function StencilLiveStub({
  stencilId,
  dimmed = false,
  className,
  style,
  onMovePointerDown,
}: Props) {
  const def = getStencilById(stencilId)
  const title = def?.title ?? stencilId
  const category = def?.category ?? 'base'
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [switchOn, setSwitchOn] = useState(true)
  const [pressed, setPressed] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)

  function stop(event: SyntheticEvent) {
    event.stopPropagation()
  }

  function flashToast() {
    setToastVisible(true)
    window.setTimeout(() => setToastVisible(false), 1200)
  }

  function handleRootPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (
      target.closest(
        'button, summary, details, a, input, select, textarea, [data-no-drag]',
      )
    ) {
      stop(event)
      return
    }
    stop(event)
    onMovePointerDown?.(event)
  }

  const kind = stubKind(stencilId)

  return (
    <div
      className={`${styles.root}${dimmed ? ` ${styles.dimmed}` : ''}${
        className ? ` ${className}` : ''
      }`}
      style={style}
      data-stencil-id={stencilId}
      onPointerDown={handleRootPointerDown}
      title={`${title} · drag to move · corners to resize`}
    >
      <span className={styles.badge} data-drag-handle>
        <span className={styles.grip} aria-hidden>
          ⋮⋮
        </span>
        {title}
      </span>

      {kind === 'button' && (
        <div className={styles.body}>
          <button
            type="button"
            className={
              stencilId === 'btn-icon' ? styles.iconBtn : styles.btnFill
            }
            aria-pressed={pressed}
            onClick={(event) => {
              stop(event)
              setPressed(true)
              flashToast()
              window.setTimeout(() => setPressed(false), 200)
            }}
          >
            {stencilId === 'btn-icon' ? '✦' : 'Continue'}
          </button>
        </div>
      )}

      {kind === 'input' && (
        <div className={styles.formField}>
          <span className={styles.fieldLabel}>Email</span>
          <div className={styles.fieldControl}>name@example.com</div>
        </div>
      )}

      {kind === 'textarea' && (
        <div className={styles.formField}>
          <span className={styles.fieldLabel}>Notes</span>
          <div className={`${styles.fieldControl} ${styles.fieldMultiline}`}>
            Multi-line…
          </div>
        </div>
      )}

      {kind === 'select' && (
        <div className={styles.formField}>
          <span className={styles.fieldLabel}>Status</span>
          <div className={`${styles.fieldControl} ${styles.fieldSelect}`}>
            <span>Active</span>
            <span className={styles.chev} aria-hidden>
              ▾
            </span>
          </div>
        </div>
      )}

      {kind === 'switch' && (
        <div className={styles.body}>
          <button
            type="button"
            className={styles.switchRow}
            onClick={(event) => {
              stop(event)
              setSwitchOn((value) => !value)
            }}
          >
            <span>Notifications</span>
            <span
              className={styles.switch}
              data-on={switchOn || undefined}
            />
          </button>
        </div>
      )}

      {kind === 'dialog' && (
        <div className={styles.body}>
          <button
            type="button"
            className={styles.btnFill}
            onClick={(event) => {
              stop(event)
              setDialogOpen(true)
            }}
          >
            Open dialog
          </button>
          {dialogOpen ? (
            <div className={styles.modal} role="dialog" data-no-drag>
              <strong>Confirm</strong>
              <p>Apply this change?</p>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={(event) => {
                    stop(event)
                    setDialogOpen(false)
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={(event) => {
                    stop(event)
                    setDialogOpen(false)
                    flashToast()
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {kind === 'sheet' && (
        <div className={styles.body}>
          <button
            type="button"
            className={styles.btnGhostFill}
            onClick={(event) => {
              stop(event)
              setSheetOpen(true)
            }}
          >
            Open sheet
          </button>
          {sheetOpen ? (
            <div className={styles.sheet} role="dialog" data-no-drag>
              <strong>Details</strong>
              <p className={styles.muted}>Side panel stub</p>
              <button
                type="button"
                className={styles.btn}
                onClick={(event) => {
                  stop(event)
                  setSheetOpen(false)
                }}
              >
                Close
              </button>
            </div>
          ) : null}
        </div>
      )}

      {kind === 'menu' && (
        <div className={styles.body}>
          <details className={styles.details} onClick={stop}>
            <summary>
              {stencilId === 'popover' ? 'Quick tip' : 'Actions'}
            </summary>
            <div className={styles.menu}>
              <button type="button" onClick={stop}>
                Edit
              </button>
              <button type="button" onClick={stop}>
                Duplicate
              </button>
            </div>
          </details>
        </div>
      )}

      {kind === 'toast' && (
        <div className={styles.body}>
          <button
            type="button"
            className={styles.btnFill}
            onClick={(event) => {
              stop(event)
              flashToast()
            }}
          >
            Show toast
          </button>
        </div>
      )}

      {kind === 'preview' && (
        <div className={styles.previewFill}>
          <StencilPreviewVisual
            stencilId={stencilId}
            category={category}
            title={title}
            fill
          />
        </div>
      )}

      {toastVisible ? (
        <div className={styles.toast} role="status">
          Saved
        </div>
      ) : null}
    </div>
  )
}

type StubKind =
  | 'button'
  | 'input'
  | 'textarea'
  | 'select'
  | 'switch'
  | 'dialog'
  | 'sheet'
  | 'menu'
  | 'toast'
  | 'preview'

function stubKind(stencilId: string): StubKind {
  if (
    stencilId === 'btn-primary' ||
    stencilId === 'btn-shine' ||
    stencilId === 'btn-icon'
  ) {
    return 'button'
  }
  if (stencilId === 'input-text') return 'input'
  if (stencilId === 'textarea') return 'textarea'
  if (stencilId === 'select') return 'select'
  if (stencilId === 'checkbox-switch') return 'switch'
  if (stencilId === 'dialog') return 'dialog'
  if (stencilId === 'sheet') return 'sheet'
  if (stencilId === 'dropdown-menu' || stencilId === 'popover') return 'menu'
  if (stencilId === 'toast') return 'toast'
  return 'preview'
}
