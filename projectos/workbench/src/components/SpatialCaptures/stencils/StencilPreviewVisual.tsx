import type { StencilCategory } from '@contracts/ui-stencil'
import styles from './StencilPreviewVisual.module.css'

interface Props {
  stencilId: string
  category: StencilCategory
  title: string
  /** Fill parent (live stub); default fixed card height for library preview. */
  fill?: boolean
}

/**
 * In-app visual mock for library hover preview.
 * Real png/webm assets can replace these later via previewAsset;
 * motion/visual use CSS so users see the interaction without binary media.
 */
export default function StencilPreviewVisual({
  stencilId,
  category,
  title,
  fill = false,
}: Props) {
  return (
    <div
      className={`${styles.stage}${fill ? ` ${styles.stageFill}` : ''}`}
      data-id={stencilId}
      data-category={category}
      aria-hidden
    >
      <PreviewBody stencilId={stencilId} category={category} title={title} />
    </div>
  )
}

function PreviewBody({
  stencilId,
  category,
  title,
}: {
  stencilId: string
  category: StencilCategory
  title: string
}) {
  switch (stencilId) {
    case 'btn-primary':
      return (
        <div className={styles.center}>
          <span className={styles.btn}>Continue</span>
        </div>
      )
    case 'btn-icon':
      return (
        <div className={styles.center}>
          <span className={styles.iconBtn}>✦</span>
        </div>
      )
    case 'input-text':
      return (
        <div className={styles.stack}>
          <span className={styles.label}>Email</span>
          <span className={styles.input}>name@example.com</span>
        </div>
      )
    case 'textarea':
      return (
        <div className={styles.stack}>
          <span className={styles.label}>Notes</span>
          <span className={`${styles.input} ${styles.textarea}`}>
            Multi-line…
          </span>
        </div>
      )
    case 'select':
      return (
        <div className={styles.stack}>
          <span className={styles.label}>Status</span>
          <span className={`${styles.input} ${styles.select}`}>
            Active <span className={styles.chev}>▾</span>
          </span>
        </div>
      )
    case 'checkbox-switch':
      return (
        <div className={styles.rowBetween}>
          <span className={styles.labelInline}>Notifications</span>
          <span className={styles.switch} data-on />
        </div>
      )
    case 'form-field-row':
      return (
        <div className={styles.fieldRow}>
          <span className={styles.labelInline}>Name</span>
          <span className={styles.inputCompact}>Ada Lovelace</span>
        </div>
      )
    case 'dialog':
      return (
        <div className={styles.dialog}>
          <span className={styles.dialogTitle}>Confirm</span>
          <span className={styles.dialogBody}>Apply this change?</span>
          <div className={styles.dialogActions}>
            <span className={styles.btnGhost}>Cancel</span>
            <span className={styles.btn}>Confirm</span>
          </div>
        </div>
      )
    case 'sheet':
      return (
        <div className={styles.sheetScene}>
          <div className={styles.sheetPanel}>
            <span className={styles.dialogTitle}>Details</span>
            <span className={styles.line} />
            <span className={styles.lineShort} />
          </div>
        </div>
      )
    case 'dropdown-menu':
      return (
        <div className={styles.center}>
          <div className={styles.menu}>
            <span className={styles.menuItem}>Edit</span>
            <span className={styles.menuItem}>Duplicate</span>
            <span className={`${styles.menuItem} ${styles.menuDanger}`}>
              Delete
            </span>
          </div>
        </div>
      )
    case 'popover':
      return (
        <div className={styles.center}>
          <div className={styles.popover}>
            <span className={styles.dialogTitle}>Quick tip</span>
            <span className={styles.dialogBody}>Contextual help content.</span>
          </div>
        </div>
      )
    case 'tabs':
      return (
        <div className={styles.tabs}>
          <div className={styles.tabBar}>
            <span className={styles.tabActive}>Overview</span>
            <span className={styles.tabIdle}>Activity</span>
          </div>
          <div className={styles.tabPanel}>Panel content</div>
        </div>
      )
    case 'card':
      return (
        <div className={styles.card}>
          <span className={styles.dialogTitle}>{title}</span>
          <span className={styles.line} />
          <span className={styles.lineShort} />
        </div>
      )
    case 'table-basic':
      return (
        <div className={styles.table}>
          <div className={styles.tableHead}>
            <span>Name</span>
            <span>Status</span>
          </div>
          <div className={styles.tableRow}>
            <span>Alpha</span>
            <span>Live</span>
          </div>
          <div className={styles.tableRow}>
            <span>Beta</span>
            <span>Draft</span>
          </div>
        </div>
      )
    case 'command':
      return (
        <div className={styles.command}>
          <span className={styles.input}>Type a command…</span>
          <span className={styles.menuItem}>Open file</span>
          <span className={styles.menuItem}>Search symbols</span>
        </div>
      )
    case 'toast':
      return (
        <div className={styles.toastScene}>
          <span className={styles.toast}>Saved successfully</span>
        </div>
      )
    case 'fade-in':
      return (
        <div className={styles.center}>
          <span className={`${styles.demoBox} ${styles.animFadeIn}`}>Fade</span>
        </div>
      )
    case 'slide-panel':
      return (
        <div className={styles.sheetScene}>
          <div className={`${styles.sheetPanel} ${styles.animSlideIn}`}>
            Slide
          </div>
        </div>
      )
    case 'expand-collapse':
      return (
        <div className={styles.stack}>
          <span className={styles.labelInline}>Section</span>
          <div className={`${styles.expandBody} ${styles.animExpand}`}>
            Expanded content
          </div>
        </div>
      )
    case 'layout-shared':
      return (
        <div className={styles.sharedScene}>
          <span className={`${styles.sharedCard} ${styles.animShared}`}>
            Item → Detail
          </span>
        </div>
      )
    case 'tab-crossfade':
      return (
        <div className={styles.tabs}>
          <div className={styles.tabBar}>
            <span className={styles.tabActive}>A</span>
            <span className={styles.tabIdle}>B</span>
          </div>
          <div className={`${styles.tabPanel} ${styles.animCrossfade}`}>
            Crossfade
          </div>
        </div>
      )
    case 'list-stagger':
      return (
        <div className={styles.staggerList}>
          <span className={`${styles.staggerItem} ${styles.animStagger1}`} />
          <span className={`${styles.staggerItem} ${styles.animStagger2}`} />
          <span className={`${styles.staggerItem} ${styles.animStagger3}`} />
        </div>
      )
    case 'drag-reorder':
      return (
        <div className={styles.staggerList}>
          <span className={`${styles.staggerItem} ${styles.animDrag}`}>
            ⋮⋮ Row
          </span>
          <span className={styles.staggerItem}>Row</span>
        </div>
      )
    case 'page-transition':
      return (
        <div className={styles.pageScene}>
          <span className={`${styles.pageCard} ${styles.animPage}`}>Page</span>
        </div>
      )
    case 'bg-grid-fade':
      return <div className={styles.bgGrid} />
    case 'bg-gradient-mesh':
      return <div className={styles.bgMesh} />
    case 'text-gradient':
      return (
        <div className={styles.center}>
          <span className={styles.textGradient}>Headline</span>
        </div>
      )
    case 'text-split-reveal':
      return (
        <div className={styles.center}>
          <span className={`${styles.textReveal} ${styles.animReveal}`}>
            Reveal
          </span>
        </div>
      )
    case 'btn-shine':
      return (
        <div className={styles.center}>
          <span className={`${styles.btn} ${styles.animShine}`}>Shine</span>
        </div>
      )
    case 'card-glow-hover':
      return (
        <div className={styles.center}>
          <span className={`${styles.card} ${styles.animGlow}`}>Glow</span>
        </div>
      )
    case 'preset-login':
      return (
        <div className={styles.preset}>
          <span className={styles.dialogTitle}>Sign in</span>
          <span className={styles.input}>Email</span>
          <span className={styles.input}>Password</span>
          <span className={styles.btn}>Continue</span>
        </div>
      )
    case 'preset-settings':
      return (
        <div className={styles.preset}>
          <span className={styles.dialogTitle}>Settings</span>
          <div className={styles.rowBetween}>
            <span className={styles.labelInline}>Email alerts</span>
            <span className={styles.switch} data-on />
          </div>
          <span className={`${styles.input} ${styles.select}`}>Theme ▾</span>
        </div>
      )
    case 'preset-dashboard':
      return (
        <div className={styles.dashboard}>
          <div className={styles.kpiRow}>
            <span className={styles.kpi} />
            <span className={styles.kpi} />
            <span className={styles.kpi} />
          </div>
          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Metric</span>
              <span>Value</span>
            </div>
            <div className={styles.tableRow}>
              <span>Sessions</span>
              <span>1.2k</span>
            </div>
          </div>
        </div>
      )
    default:
      return (
        <div className={styles.center}>
          <span className={styles.fallback} data-category={category}>
            {title.slice(0, 1)}
          </span>
        </div>
      )
  }
}
