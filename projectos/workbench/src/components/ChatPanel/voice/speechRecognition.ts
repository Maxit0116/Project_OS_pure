type SpeechRecognitionCtor = new () => SpeechRecognition

interface SpeechRecognitionResultItem {
  transcript: string
}

interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: { isFinal: boolean; [index: number]: SpeechRecognitionResultItem }
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
}

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null
}

export interface SpeechSessionCallbacks {
  onPartial: (text: string) => void
  onFinalSegment: (text: string) => void
  onError: (message: string) => void
  onEnd: () => void
}

const RETRYABLE_ERRORS = new Set(['network', 'service-not-available', 'audio-capture'])

export function createSpeechSession(language: string, callbacks: SpeechSessionCallbacks) {
  const Ctor = getSpeechRecognitionCtor()
  if (!Ctor) {
    throw new Error('speech_not_supported')
  }

  const recognition = new Ctor()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = language

  let finalTranscript = ''
  let shouldRestart = false
  let networkRetries = 0

  recognition.onresult = (event) => {
    networkRetries = 0
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      const piece = result[0]?.transcript ?? ''
      if (result.isFinal) {
        finalTranscript += piece
        const trimmed = piece.trim()
        if (trimmed) callbacks.onFinalSegment(trimmed)
      } else {
        interim += piece
      }
    }
    callbacks.onPartial((finalTranscript + interim).trim())
  }

  recognition.onerror = (event) => {
    if (event.error === 'aborted' || event.error === 'no-speech') return
    if (shouldRestart && RETRYABLE_ERRORS.has(event.error) && networkRetries < 3) {
      networkRetries += 1
      window.setTimeout(() => {
        if (!shouldRestart) return
        try {
          recognition.start()
        } catch {
          callbacks.onError(event.error)
        }
      }, 250 * networkRetries)
      return
    }
    callbacks.onError(event.error)
  }

  recognition.onend = () => {
    if (shouldRestart) {
      try {
        recognition.start()
        return
      } catch {
        /* fall through */
      }
    }
    callbacks.onEnd()
  }

  return {
    start() {
      finalTranscript = ''
      networkRetries = 0
      shouldRestart = true
      recognition.start()
    },
    stop() {
      shouldRestart = false
      recognition.stop()
    },
    abort() {
      shouldRestart = false
      recognition.abort()
    },
    getFinalTranscript() {
      return finalTranscript.trim()
    },
  }
}
