import type { CSSProperties, ReactNode } from 'react'
import {
  getLoopIntegration,
  resolveLoopIntegrationIconUrl,
  runtimeStatusBlocksExecution,
  runtimeStatusNextStep,
  type LoopIntegrationRuntimeStatus,
} from './loopIntegrationRegistry'
import './LoopSaaSNodeCard.css'

export type LoopSaaSNodeCardState =
  | 'idle'
  | 'selected'
  | 'hover'
  | 'disabled'
  | 'error'
  | 'running'
  | 'complete'
  | 'awaiting_hitl'

export type LoopSaaSNodeCardProps = {
  integrationId: string
  /** Secondary line — operation / action label. */
  operationLabel: string
  runtimeStatus?: LoopIntegrationRuntimeStatus
  state?: LoopSaaSNodeCardState
  titleOverride?: string
  className?: string
  style?: CSSProperties
  onSelect?: () => void
  /**
   * Canvas embed: non-button chrome so Overlay owns ports/drag/selection.
   * Standalone (default): interactive button for palette/tests.
   */
  embedded?: boolean
  children?: ReactNode
}

/**
 * Compact SaaS node card (n8n-like: logo center, name + operation secondary).
 * Independent Pure implementation — does not import n8n source/styles.
 */
export function LoopSaaSNodeCard({
  integrationId,
  operationLabel,
  runtimeStatus,
  state = 'idle',
  titleOverride,
  className,
  style,
  onSelect,
  embedded = false,
  children,
}: LoopSaaSNodeCardProps) {
  const meta = getLoopIntegration(integrationId)
  const displayName = titleOverride ?? meta?.displayName ?? integrationId
  const iconKey = meta?.iconKey ?? 'fallback'
  const iconUrl = resolveLoopIntegrationIconUrl(iconKey)
  const status = runtimeStatus ?? meta?.defaultRuntimeStatus ?? 'unconfigured'
  const blocked = runtimeStatusBlocksExecution(status)
  const nextStep = runtimeStatusNextStep(
    meta ?? {
      id: 'http',
      displayName,
      iconKey: 'fallback',
      actions: [],
      defaultRuntimeStatus: 'unconfigured',
    },
    status,
  )

  const classes = [
    'loopSaaSNodeCard',
    embedded ? 'loopSaaSNodeCard--embedded' : '',
    `loopSaaSNodeCard--${state}`,
    blocked ? 'loopSaaSNodeCard--blocked' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const body = (
    <>
      <span className="loopSaaSNodeCard__logo" aria-hidden="true">
        {iconUrl ? (
          <img src={iconUrl} alt="" width={28} height={28} draggable={false} />
        ) : (
          <span className="loopSaaSNodeCard__fallback">{displayName.slice(0, 1)}</span>
        )}
      </span>
      <span className="loopSaaSNodeCard__text">
        <span className="loopSaaSNodeCard__name">{displayName}</span>
        <span className="loopSaaSNodeCard__op">{operationLabel}</span>
      </span>
      {blocked ? (
        <span
          className="loopSaaSNodeCard__badge"
          data-testid="saas-blocked-badge"
          data-loop-saas-catalog-only={
            status === 'unimplemented' &&
            (integrationId === 'supabase' || integrationId === 'posthog')
              ? 'true'
              : undefined
          }
        >
          {status === 'unimplemented' &&
          (integrationId === 'supabase' || integrationId === 'posthog')
            ? '仅目录'
            : status === 'unimplemented'
              ? '未实现'
              : '未配置'}
        </span>
      ) : null}
      {state === 'awaiting_hitl' ? (
        <span className="loopSaaSNodeCard__badge" data-testid="saas-hitl-badge">
          等待人工
        </span>
      ) : null}
      {state === 'error' ? (
        <span className="loopSaaSNodeCard__badge loopSaaSNodeCard__badge--error">错误</span>
      ) : null}
      {state === 'running' ? (
        <span className="loopSaaSNodeCard__badge">执行中</span>
      ) : null}
      {state === 'complete' ? (
        <span className="loopSaaSNodeCard__badge loopSaaSNodeCard__badge--ok">完成</span>
      ) : null}
      {children}
    </>
  )

  if (embedded) {
    return (
      <div
        className={classes}
        style={style}
        data-integration={integrationId}
        data-runtime-status={status}
        data-state={state}
        data-blocked={blocked ? 'true' : 'false'}
        data-saas-card="embedded"
        title={blocked ? nextStep : `${displayName} · ${operationLabel}`}
      >
        {body}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={classes}
      style={style}
      data-integration={integrationId}
      data-runtime-status={status}
      data-state={state}
      data-blocked={blocked ? 'true' : 'false'}
      aria-label={`${displayName}: ${operationLabel}`}
      aria-disabled={blocked || state === 'disabled'}
      title={blocked ? nextStep : `${displayName} · ${operationLabel}`}
      onClick={() => {
        if (state === 'disabled') return
        onSelect?.()
      }}
    >
      {body}
    </button>
  )
}
