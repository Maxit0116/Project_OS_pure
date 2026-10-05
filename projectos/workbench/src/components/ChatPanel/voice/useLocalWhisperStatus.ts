import { useSyncExternalStore } from 'react'
import {
  getLocalWhisperStatus,
  subscribeLocalWhisperStatus,
  type LocalWhisperStatus,
} from './localWhisperTranscribe'

export function useLocalWhisperStatus(): LocalWhisperStatus {
  return useSyncExternalStore(subscribeLocalWhisperStatus, getLocalWhisperStatus)
}
