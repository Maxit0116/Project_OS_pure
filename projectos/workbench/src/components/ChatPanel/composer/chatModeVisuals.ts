import type { LucideIcon } from 'lucide-react'
import { Bug, ListTree, MessageCircle, SquarePen, Anchor } from 'lucide-react'
import type { ChatMode } from '../../../state/workbenchStore'

export interface ChatModeVisual {
  icon: LucideIcon
  toneClass: string
}

export const CHAT_MODE_VISUALS: Record<ChatMode, ChatModeVisual> = {
  ask: { icon: MessageCircle, toneClass: 'modeAsk' },
  plan: { icon: ListTree, toneClass: 'modePlan' },
  change: { icon: SquarePen, toneClass: 'modeChange' },
  debug: { icon: Bug, toneClass: 'modeDebug' },
  anchored: { icon: Anchor, toneClass: 'modeAsk' },
}

export const CHAT_MODES: ChatMode[] = ['ask', 'plan', 'change', 'debug', 'anchored']

export function cycleChatMode(current: ChatMode): ChatMode {
  const index = CHAT_MODES.indexOf(current)
  return CHAT_MODES[(index + 1) % CHAT_MODES.length] ?? 'ask'
}
