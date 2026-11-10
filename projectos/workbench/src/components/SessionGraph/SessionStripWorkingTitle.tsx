import { useMemo } from 'react'
import {
  buildSessionStripWorkingUnits,
  sessionStripWorkingScript,
} from './sessionStripWorkingTitleModel'
import styles from './SessionGraphOverlay.module.css'

interface Props {
  title: string
  /** Accessible label — static title, not the animated glyph stream. */
  label?: string
}

/**
 * Live agent-working strip title:
 * - Latin: cascading lower→UPPER case wave in chat-mode color
 * - CJK (any Han/Kana/Hangul in title): cascading per-glyph color wave
 */
export default function SessionStripWorkingTitle({ title, label }: Props) {
  const script = useMemo(() => sessionStripWorkingScript(title), [title])
  const units = useMemo(
    () => buildSessionStripWorkingUnits(title, script),
    [script, title],
  )

  return (
    <span
      className={`${styles.workingTitle} ${
        script === 'cjk' ? styles.workingTitleCjk : styles.workingTitleLatin
      }`}
      aria-label={label ?? title}
      data-working-script={script}
    >
      {units.map((unit, index) => {
        if (script === 'latin' && unit.animates && unit.lower && unit.upper) {
          return (
            <span
              key={`${index}:${unit.raw}`}
              className={styles.workingLatinUnit}
              style={{ ['--unit-i' as string]: index }}
              aria-hidden
            >
              <span className={styles.workingLatinLower}>{unit.lower}</span>
              <span className={styles.workingLatinUpper}>{unit.upper}</span>
            </span>
          )
        }
        return (
          <span
            key={`${index}:${unit.raw}`}
            className={
              unit.animates ? styles.workingCjkUnit : styles.workingStaticUnit
            }
            style={unit.animates ? { ['--unit-i' as string]: index } : undefined}
            aria-hidden
          >
            {unit.raw === ' ' ? '\u00a0' : unit.raw}
          </span>
        )
      })}
    </span>
  )
}
