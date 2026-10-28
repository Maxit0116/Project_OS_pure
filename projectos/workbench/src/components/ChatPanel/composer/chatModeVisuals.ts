import type { LucideIcon } from 'lucide-react'
import { Bug, ListTree, MessageCircle, SquarePen, Anchor } from 'lucide-react'
import type { ChatMode } from '../../../state/workbenchStore'

export interface ChatModeVisual {
  icon: LucideIcon
  /**
   * CSS module class for the *selected* mode chip (and nav markers).
   * Dropdown rows stay uncolored — Cursor-style.
   */
  toneClass: 'modeAsk' | 'modePlan' | 'modeAgent' | 'modeDebug'
}

export const CHAT_MODE_VISUALS: Record<ChatMode, ChatModeVisual> = {
  ask: { icon: MessageCircle, toneClass: 'modeAsk' },
  plan: { icon: ListTree, toneClass: 'modePlan' },
  /** Agent mode — no brand color on the chip / markers. */
  change: { icon: SquarePen, toneClass: 'modeAgent' },
  debug: { icon: Bug, toneClass: 'modeDebug' },
  anchored: { icon: Anchor, toneClass: 'modeAsk' },
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

/** Map a persisted / message chatMode string to a tone class for markers. */
export function toneClassForChatMode(
  mode: string | undefined | null,
): ChatModeVisual['toneClass'] | null {
  if (!mode) return null
  if (mode === 'ask' || mode === 'anchored') return 'modeAsk'
  if (mode === 'plan') return 'modePlan'
  if (mode === 'change') return 'modeAgent'
  if (mode === 'debug') return 'modeDebug'
  return null
}
