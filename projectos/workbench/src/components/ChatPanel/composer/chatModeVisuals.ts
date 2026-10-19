import type { LucideIcon } from 'lucide-react'
import { Bug, ListTree, MessageCircle, SquarePen, Anchor } from 'lucide-react'
import type { ChatMode } from '../../../state/workbenchStore'

export interface ChatModeVisual {
  icon: LucideIcon
  toneClass: string
  /** Whether this mode can write files (instrumentation / diffs). */
  canEdit: boolean
}

export const CHAT_MODE_VISUALS: Record<ChatMode, ChatModeVisual> = {
  ask: { icon: MessageCircle, toneClass: 'modeAsk', canEdit: false },
  plan: { icon: ListTree, toneClass: 'modePlan', canEdit: false },
  change: { icon: SquarePen, toneClass: 'modeChange', canEdit: true },
  debug: { icon: Bug, toneClass: 'modeDebug', canEdit: true },
  anchored: { icon: Anchor, toneClass: 'modeAsk', canEdit: false },
}

/** Modes shown in the picker dropdown (includes Anchored). */
export const CHAT_MODES: ChatMode[] = ['ask', 'plan', 'change', 'debug', 'anchored']

/**
 * Shift+Tab cycle — Anchored is intentionally excluded (enter via node menu / picker).
 * Order aligns with Cursor: Ask → Plan → Agent(change) → Debug.
 */
export const CYCLE_CHAT_MODES: ChatMode[] = ['ask', 'plan', 'change', 'debug']

export function cycleChatMode(current: ChatMode): ChatMode {
  const index = CYCLE_CHAT_MODES.indexOf(current)
  if (index < 0) {
    // Anchored (or unknown): jump into the main cycle at Ask
    return CYCLE_CHAT_MODES[0] ?? 'ask'
  }
  return CYCLE_CHAT_MODES[(index + 1) % CYCLE_CHAT_MODES.length] ?? 'ask'
}

export function chatModeHelpKey(mode: ChatMode): `chat.${ChatMode}ModeHelp` | 'chat.askModeHelp' {
  if (mode === 'anchored') return 'chat.anchoredModeHelp'
  return `chat.${mode}ModeHelp`
}
