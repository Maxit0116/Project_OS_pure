import {
  getLoopIntegration,
  resolveLoopIntegrationIconUrl,
} from './loopIntegrationRegistry'

type Props = {
  integrationId?: string | null
  iconKey?: string | null
  size?: number
  className?: string
  title?: string
}

/** Local brand mark (or neutral letter fallback). Never hotlinks remote URLs. */
export function LoopIntegrationIcon({
  integrationId,
  iconKey,
  size = 16,
  className,
  title,
}: Props) {
  const meta = getLoopIntegration(integrationId)
  const key = iconKey ?? meta?.iconKey ?? 'fallback'
  const url = resolveLoopIntegrationIconUrl(key)
  const label = title ?? meta?.displayName ?? integrationId ?? 'Integration'
  if (!url) {
    return (
      <span
        className={className}
        style={{
          width: size,
          height: size,
          display: 'inline-grid',
          placeItems: 'center',
          fontSize: Math.max(10, Math.round(size * 0.55)),
          fontWeight: 700,
        }}
        aria-hidden
        title={label}
      >
        {label.slice(0, 1).toUpperCase()}
      </span>
    )
  }
  return (
    <img
      className={className}
      src={url}
      alt=""
      width={size}
      height={size}
      draggable={false}
      title={label}
      aria-hidden
    />
  )
}
