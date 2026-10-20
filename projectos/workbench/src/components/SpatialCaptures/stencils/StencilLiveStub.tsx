import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react'
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
 * Visual language matches StencilPreviewVisual; basic click affordances only.
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

  const interactive =
    stencilId === 'btn-primary' ||
    stencilId === 'btn-icon' ||
    stencilId === 'btn-shine' ||
    stencilId === 'dialog' ||
    stencilId === 'sheet' ||
    stencilId === 'checkbox-switch' ||
    stencilId === 'toast' ||
    stencilId === 'dropdown-menu' ||
    stencilId === 'popover'

  return (
    <div
      className={`${styles.root}${dimmed ? ` ${styles.dimmed}` : ''}${
        className ? ` ${className}` : ''
      }`}
      style={style}
      data-stencil-id={stencilId}
      onPointerDown={handleRootPointerDown}
      title={`${title} · drag to move`}
    >
      <span className={styles.badge} data-drag-handle>
        <span className={styles.grip} aria-hidden>
          ⋮⋮
        </span>
        {title}
      </span>

      {interactive ? (
        <div className={styles.body}>
          {(stencilId === 'btn-primary' ||
            stencilId === 'btn-shine' ||
            stencilId === 'btn-icon') && (
            <button
              type="button"
              className={
                stencilId === 'btn-icon' ? styles.iconBtn : styles.btn
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
          )}

          {stencilId === 'checkbox-switch' && (
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
          )}

          {stencilId === 'dialog' && (
            <>
              <button
                type="button"
                className={styles.btn}
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
            </>
          )}

          {stencilId === 'sheet' && (
            <>
              <button
                type="button"
                className={styles.btnGhost}
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
            </>
          )}

          {(stencilId === 'dropdown-menu' || stencilId === 'popover') && (
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
          )}

          {stencilId === 'toast' && (
            <button
              type="button"
              className={styles.btn}
              onClick={(event) => {
                stop(event)
                flashToast()
              }}
            >
              Show toast
            </button>
          )}

          {toastVisible ? (
            <div className={styles.toast} role="status">
              Saved
            </div>
          ) : null}
        </div>
      ) : (
        <div className={styles.previewFill}>
          <StencilPreviewVisual
            stencilId={stencilId}
            category={category}
            title={title}
          />
        </div>
      )}
    </div>
  )
}
