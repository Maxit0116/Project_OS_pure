/**
 * Extensible Loop SaaS integration metadata + local icon registry.
 * Display name / action / trigger semantics are separate from runtime readiness.
 */

export type LoopIntegrationId =
  | 'github'
  | 'slack'
  | 'feishu'
  | 'lark'
  | 'sentry'
  | 'gmail'
  | 'supabase'
  | 'posthog'
  | 'http'
  | 'webhook'

export type LoopIntegrationRuntimeStatus =
  | 'ready'
  | 'unconfigured'
  | 'auth_missing'
  | 'offline'
  | 'unimplemented'

export type LoopIntegrationAction = {
  id: string
  label: string
  kind: 'action' | 'trigger'
}

export type LoopIntegrationMeta = {
  id: LoopIntegrationId
  displayName: string
  /** Local icon key under ./icons — never a remote URL. */
  iconKey: string
  actions: LoopIntegrationAction[]
  /** Default product posture until credentials exist. */
  defaultRuntimeStatus: Exclude<LoopIntegrationRuntimeStatus, 'ready'>
  /** Brand note for UI (Lark ≠ 飞书 copy). */
  brandNote?: string
}

const REGISTRY: Record<LoopIntegrationId, LoopIntegrationMeta> = {
  github: {
    id: 'github',
    displayName: 'GitHub',
    iconKey: 'github',
    defaultRuntimeStatus: 'auth_missing',
    actions: [
      { id: 'create_pr', label: 'Create PR', kind: 'action' },
      { id: 'create_branch', label: 'Create branch', kind: 'action' },
    ],
  },
  slack: {
    id: 'slack',
    displayName: 'Slack',
    iconKey: 'slack',
    defaultRuntimeStatus: 'unconfigured',
    actions: [
      { id: 'post_message', label: 'Post message', kind: 'action' },
      { id: 'incoming_webhook_notify', label: 'Webhook notify', kind: 'action' },
      { id: 'message_trigger', label: 'On message', kind: 'trigger' },
    ],
  },
  feishu: {
    id: 'feishu',
    displayName: '飞书 Feishu',
    iconKey: 'feishu',
    defaultRuntimeStatus: 'unconfigured',
    brandNote: 'Domestic Feishu (open.feishu.cn). Distinct from international Lark.',
    actions: [
      { id: 'post_message', label: 'Send message', kind: 'action' },
      { id: 'custom_bot_notify', label: 'Custom bot notify', kind: 'action' },
      { id: 'message_trigger', label: 'On message', kind: 'trigger' },
    ],
  },
  lark: {
    id: 'lark',
    displayName: 'Lark',
    iconKey: 'lark',
    defaultRuntimeStatus: 'unconfigured',
    brandNote: 'International Lark (open.larksuite.com). Feishu is a separate brand/API host.',
    actions: [
      { id: 'post_message', label: 'Send message', kind: 'action' },
      { id: 'custom_bot_notify', label: 'Custom bot notify', kind: 'action' },
      { id: 'message_trigger', label: 'On message', kind: 'trigger' },
    ],
  },
  sentry: {
    id: 'sentry',
    displayName: 'Sentry',
    iconKey: 'sentry',
    defaultRuntimeStatus: 'unconfigured',
    actions: [
      { id: 'list_issues', label: 'List issues', kind: 'action' },
      { id: 'get_issue', label: 'Get issue', kind: 'action' },
      { id: 'issue_created', label: 'Issue created', kind: 'trigger' },
    ],
  },
  gmail: {
    id: 'gmail',
    displayName: 'Gmail',
    iconKey: 'gmail',
    defaultRuntimeStatus: 'auth_missing',
    brandNote:
      'Phase-1 gmail.readonly. List IDs ≠ body. Push is users.watch→Pub/Sub (not deployed). Send default off.',
    actions: [
      { id: 'messages_search', label: 'Search messages', kind: 'action' },
      { id: 'messages_get', label: 'Get message', kind: 'action' },
      { id: 'threads_get', label: 'Get thread', kind: 'action' },
      { id: 'attachments_get', label: 'Get attachment', kind: 'action' },
      { id: 'poll_history', label: 'Online history poll', kind: 'trigger' },
    ],
  },
  /** Batch3 catalog_only — offline product surface; not a live-auth excuse. */
  supabase: {
    id: 'supabase',
    displayName: 'Supabase',
    iconKey: 'fallback',
    defaultRuntimeStatus: 'unimplemented',
    brandNote:
      'Batch3 catalog_only: capabilities listed; dispatch blocked as catalog_only (no live adapter yet).',
    actions: [
      { id: 'read_rows', label: 'Read rows', kind: 'action' },
      { id: 'invoke_rpc_readonly', label: 'Read RPC', kind: 'action' },
      { id: 'write_rows', label: 'Write rows', kind: 'action' },
    ],
  },
  posthog: {
    id: 'posthog',
    displayName: 'PostHog',
    iconKey: 'fallback',
    defaultRuntimeStatus: 'unimplemented',
    brandNote:
      'Batch3 catalog_only: capabilities listed; dispatch blocked as catalog_only (no live adapter yet).',
    actions: [
      { id: 'capture_event', label: 'Capture event', kind: 'action' },
      { id: 'query_insights', label: 'Query insights', kind: 'action' },
    ],
  },
  http: {
    id: 'http',
    displayName: 'HTTP',
    iconKey: 'fallback',
    defaultRuntimeStatus: 'unconfigured',
    actions: [{ id: 'request', label: 'Request', kind: 'action' }],
  },
  webhook: {
    id: 'webhook',
    displayName: 'Webhook',
    iconKey: 'fallback',
    defaultRuntimeStatus: 'unconfigured',
    actions: [{ id: 'inbound', label: 'Inbound', kind: 'trigger' }],
  },
}

/** Vite-resolved local SVG URLs (bundled, not hotlinked). */
const ICON_URLS: Record<string, string> = {
  github: new URL('./icons/github.svg', import.meta.url).href,
  slack: new URL('./icons/slack.svg', import.meta.url).href,
  feishu: new URL('./icons/feishu.svg', import.meta.url).href,
  lark: new URL('./icons/lark.svg', import.meta.url).href,
  sentry: new URL('./icons/sentry.svg', import.meta.url).href,
  gmail: new URL('./icons/gmail.svg', import.meta.url).href,
}

export function listLoopIntegrations(): LoopIntegrationMeta[] {
  return Object.values(REGISTRY)
}

export function getLoopIntegration(id: string | undefined | null): LoopIntegrationMeta | null {
  if (!id) return null
  return REGISTRY[id as LoopIntegrationId] ?? null
}

export function resolveLoopIntegrationIconUrl(iconKey: string): string | null {
  return ICON_URLS[iconKey] ?? null
}

export function integrationIdFromActionNode(input: {
  actionIntegration?: string | null
  actionOperation?: string | null
}): LoopIntegrationId | null {
  const raw = (input.actionIntegration ?? '').trim().toLowerCase()
  if (
    raw === 'github' ||
    raw === 'slack' ||
    raw === 'feishu' ||
    raw === 'lark' ||
    raw === 'sentry' ||
    raw === 'gmail' ||
    raw === 'supabase' ||
    raw === 'posthog' ||
    raw === 'http' ||
    raw === 'webhook'
  ) {
    return raw
  }
  return null
}

export function runtimeStatusBlocksExecution(
  status: LoopIntegrationRuntimeStatus,
): boolean {
  return status !== 'ready'
}

export function runtimeStatusNextStep(
  meta: LoopIntegrationMeta,
  status: LoopIntegrationRuntimeStatus,
): string {
  if (status === 'ready') return ''
  if (status === 'auth_missing') {
    return `Connect ${meta.displayName} account before running this node`
  }
  if (status === 'offline') {
    return `${meta.displayName} is offline — retry when available`
  }
  if (status === 'unimplemented') {
    if (meta.id === 'supabase' || meta.id === 'posthog') {
      return `${meta.displayName} is catalog_only — listed offline; not executable until an adapter ships (not a live-account gap)`
    }
    return `${meta.displayName} connector is not implemented yet`
  }
  return `Configure ${meta.displayName} before running this node`
}
