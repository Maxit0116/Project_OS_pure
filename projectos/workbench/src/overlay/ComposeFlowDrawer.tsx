import { useEffect, useRef, useState } from 'react'
import { currentCompactFlowLabel, type CoarseFlowLabel, type CompactFlowStep } from './coarseFlow'
import { flowBookmarkMode, isCompactFlowRunning } from './flowBookmarkMode'

export default function ComposeFlowDrawer({
  steps,
  phase,
}: {
  steps: CompactFlowStep[]
  phase: CoarseFlowLabel | null
}) {
  const [open, setOpen] = useState(false)
  const running = isCompactFlowRunning(steps, phase)
  const mode = flowBookmarkMode({ steps, phase, open })
  const wasRunning = useRef(false)

  useEffect(() => {
    if (wasRunning.current && !running) setOpen(false)
    wasRunning.current = running
  }, [running])

  if (mode === 'hidden') return null

  const current = currentCompactFlowLabel(steps, phase)
  const tabLabel = mode === 'tab' ? 'Flow' : current

  return (
    <div className={`overlay-flow-bookmark overlay-flow-bookmark-${mode}`}>
      <button
        type="button"
        className="overlay-flow-tab"
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className={`overlay-flow-step-dot${running ? ' overlay-flow-tab-dot-live' : ''}`}
          aria-hidden
        />
        <span className="overlay-flow-tab-label">{tabLabel}</span>
      </button>
      <div className={`overlay-flow-sheet${open ? ' overlay-flow-sheet-open' : ''}`}>
        <div className="overlay-flow-sheet-inner">
          {steps.length > 0 ? (
            <ol className="overlay-flow-steps overlay-flow-steps-history">
              {steps.map((step) => (
                <li
                  key={step.id}
                  className={`overlay-flow-step overlay-flow-step-${step.status}`}
                >
                  <span className="overlay-flow-step-dot" aria-hidden />
                  <span className="overlay-flow-step-label">{step.label}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="overlay-flow-step">{current}</p>
          )}
        </div>
      </div>
    </div>
  )
}
