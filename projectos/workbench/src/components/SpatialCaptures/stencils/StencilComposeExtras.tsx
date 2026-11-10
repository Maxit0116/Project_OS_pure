import { useRef, type KeyboardEvent } from 'react'
import type { StencilGenerationScope, StencilPlacement } from '@contracts/ui-stencil'
import {
  combinedBriefForArrow,
  isMotionAttachable,
  listMotionModifierStencils,
  placementsForArrow,
  stencilTitle,
  withMotionModifier,
  DEFAULT_STENCIL_SCOPE,
} from './placeStencil'
import {
  STENCIL_UI_STRINGS_EN,
  type StencilUiStrings,
} from './stencilStrings'
import type { OverlayRegion } from '../../../overlay/overlayRegions'
import { useI18n } from '../../../i18n'
import { useComposePromptVoice } from '../../ChatPanel/composer/useComposePromptVoice'
import {
  VoiceInputDock,
  VoiceInputErrorBanner,
} from '../../ChatPanel/VoiceInputControls'
import styles from './StencilComposeExtras.module.css'

interface Props {
  region: OverlayRegion
  arrowId: string
  brief: string
  scope: StencilGenerationScope
  strings?: StencilUiStrings
  onBriefChange: (value: string) => void
  onScopeChange: (scope: StencilGenerationScope) => void
  onPlacementsChange: (stencils: StencilPlacement[]) => void
  onFocus?: () => void
}

/**
 * Compose extras for stencil-backed arrows: brief, scope, motion chip.
 * Shared by Workbench SpatialCaptureCanvas and desktop OverlayApp.
 */
export default function StencilComposeExtras({
  region,
  arrowId,
  brief,
  scope,
  strings = STENCIL_UI_STRINGS_EN,
  onBriefChange,
  onScopeChange,
  onPlacementsChange,
  onFocus,
}: Props) {
  const { locale } = useI18n()
  const briefRef = useRef(brief)
  briefRef.current = brief
  const onBriefChangeRef = useRef(onBriefChange)
  onBriefChangeRef.current = onBriefChange

  const composeVoice = useComposePromptVoice({
    locale,
    getText: () => briefRef.current,
    setText: (text) => onBriefChangeRef.current(text),
  })

  const linked = placementsForArrow(region, arrowId)
  if (linked.length === 0) return null

  const primary = linked[0]!
  const canMotion = isMotionAttachable(primary.stencilId)
  const currentMotion = primary.motionModifierIds?.[0] ?? ''

  function setMotion(motionId: string) {
    const next = linked.map((item, index) =>
      index === 0
        ? withMotionModifier(item, motionId || null)
        : item,
    )
    const merged = (region.stencils ?? []).map((item) => {
      const replacement = next.find((n) => n.id === item.id)
      return replacement ?? item
    })
    onPlacementsChange(merged)
    const synthetic: OverlayRegion = { ...region, stencils: merged }
    const regenerated =
      combinedBriefForArrow(synthetic, arrowId) ??
      brief
    onBriefChange(regenerated)
    composeVoice.syncBaseFromExternalText(regenerated)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Escape' &&
      (composeVoice.voice.isRecording || composeVoice.voice.isTranscribing)
    ) {
      event.preventDefault()
      composeVoice.cancelVoice()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'Space') {
      event.preventDefault()
      composeVoice.dockProps.onMicToggle()
    }
  }

  return (
    <div className={styles.block}>
      <div className={styles.header}>
        <span className={styles.label}>
          {strings.brief}
          {': '}
          {linked.map((item) => stencilTitle(item.stencilId)).join(' · ')}
          {currentMotion
            ? ` + ${stencilTitle(currentMotion)}`
            : ''}
        </span>
        <label className={styles.scopeLabel}>
          <span>{strings.scope}</span>
          <select
            className={styles.scopeSelect}
            value={scope ?? DEFAULT_STENCIL_SCOPE}
            onChange={(event) =>
              onScopeChange(event.target.value as StencilGenerationScope)
            }
          >
            <option value="ui_only">{strings.scopeUiOnly}</option>
            <option value="ui_api_stub">{strings.scopeUiApi}</option>
            <option value="full_stack">{strings.scopeFull}</option>
          </select>
        </label>
      </div>

      {canMotion ? (
        <label className={styles.motionLabel}>
          <span>{strings.motionModifier}</span>
          <select
            className={styles.scopeSelect}
            value={currentMotion}
            onChange={(event) => setMotion(event.target.value)}
            onFocus={onFocus}
          >
            <option value="">{strings.motionNone}</option>
            {listMotionModifierStencils().map((motion) => (
              <option key={motion.id} value={motion.id}>
                {motion.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {composeVoice.voice.state.error ? (
        <VoiceInputErrorBanner
          errorKey={composeVoice.voice.state.error}
          onDismiss={composeVoice.voice.dismissError}
          labels={composeVoice.voiceLabels}
        />
      ) : null}

      <div className={styles.briefWrap}>
        <textarea
          className={styles.briefInput}
          rows={3}
          value={brief}
          placeholder={strings.briefPlaceholder}
          onChange={(event) => {
            const value = event.target.value
            onBriefChange(value)
            composeVoice.syncBaseFromExternalText(value)
          }}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
        />
        <VoiceInputDock {...composeVoice.dockProps} />
      </div>
    </div>
  )
}
