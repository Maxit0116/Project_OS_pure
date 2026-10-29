import type { CSSProperties } from 'react'
import styles from './AgentPoolRow.module.css'

interface Props {
  label: string
  modelId?: string | null
}

/** Compact model chip — letter glyph until brand icons land. */
export default function AgentPoolModelIcon({ label, modelId }: Props) {
  const letter = (label.trim()[0] ?? 'M').toUpperCase()
  const hue = hashHue(modelId || label)
  return (
    <span
      className={styles.modelIcon}
      style={{ '--pool-model-hue': `${hue}` } as CSSProperties}
      title={label}
      aria-label={label}
    >
      {letter}
    </span>
  )
}

function hashHue(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash % 360
}
