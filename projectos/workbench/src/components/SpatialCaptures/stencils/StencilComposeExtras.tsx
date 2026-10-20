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

      <textarea
        className={styles.briefInput}
        rows={3}
        value={brief}
        placeholder={strings.briefPlaceholder}
        onChange={(event) => onBriefChange(event.target.value)}
        onFocus={onFocus}
      />
    </div>
  )
}
