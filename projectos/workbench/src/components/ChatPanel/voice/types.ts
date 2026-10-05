export type VoiceInputStatus =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'transcribing'
  | 'error'

export interface VoiceInputState {
  status: VoiceInputStatus
  interimText?: string
  error?: string
  elapsedMs: number
}

export interface SubmitKeywordMatch {
  isTrigger: boolean
  spokenText: string
}

export type VoiceInputEngine = 'batch' | 'webSpeech'
