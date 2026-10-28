export type ChatModeSwitchPreference = 'new_session' | 'same_session'

const MODE_SWITCH_KEY = 'projectos_chat_mode_switch'

/**
 * Default matches Cursor: one chat can mix Ask / Plan / Agent / Debug turns.
 * Users who want isolated chats per mode can opt into `new_session` in Settings.
 */
export function loadChatModeSwitchPreference(): ChatModeSwitchPreference {
  try {
    const stored = localStorage.getItem(MODE_SWITCH_KEY)
    if (stored === 'same_session' || stored === 'new_session') return stored
  } catch {
    /* ignore */
  }
  return 'same_session'
}

export function saveChatModeSwitchPreference(value: ChatModeSwitchPreference) {
  try {
    localStorage.setItem(MODE_SWITCH_KEY, value)
  } catch {
    /* ignore */
  }
}
