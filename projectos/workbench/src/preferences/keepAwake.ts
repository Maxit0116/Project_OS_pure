import {
  parseKeepAwakeMode,
  type KeepAwakeMode,
} from '@contracts/keep-awake'

const MODE_KEY = 'projectos_keep_awake_mode'

export function loadKeepAwakeModePreference(): KeepAwakeMode {
  try {
    return parseKeepAwakeMode(localStorage.getItem(MODE_KEY))
  } catch {
    return 'off'
  }
}

export function saveKeepAwakeModePreference(mode: KeepAwakeMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}
