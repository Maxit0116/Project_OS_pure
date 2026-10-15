import { Layers } from 'lucide-react'
import styles from './FeatureNode.module.css'

interface Props {
  label: string
  active?: boolean
  onOpen: () => void
}

/** Corner drill control. The full sentence stays in the accessible name and tooltip. */
export function OpenGraphButton({ label, active = false, onOpen }: Props) {
  return (
    <button
      type="button"
      className={`${styles.openGraphCorner} nodrag nopan`}
      data-zone-interactive
      data-active={active ? 'true' : 'false'}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Layers size={13} strokeWidth={1.75} aria-hidden />
    </button>
  )
}
