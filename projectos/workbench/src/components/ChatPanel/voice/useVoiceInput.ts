import { useCallback, useEffect, useRef, useState } from 'react'
import { startBatchRecorder, type BatchRecorderSession } from './batchRecorder'
import { createSpeechSession, isSpeechRecognitionSupported } from './speechRecognition'
import { matchSubmitKeyword } from './submitKeyword'
import type { VoiceInputEngine, VoiceInputState } from './types'
import { mapSpeechRecognitionError, mapVoiceInputError } from './voiceInputErrors'

const IDLE_STATE: VoiceInputState = {
  status: 'idle',
  elapsedMs: 0,
}

export interface UseVoiceInputOptions {
  language: string
  submitKeywords?: string[]
  disabled?: boolean
  engine: VoiceInputEngine
  transcribeBlob?: (blob: Blob) => Promise<string>
  onPartial: (spokenText: string) => void
  onFinal: (spokenText: string) => void
  onSubmitKeyword?: (spokenText: string) => void
}

export function useVoiceInput({
  language,
  submitKeywords = [],
  disabled = false,
  engine,
  transcribeBlob,
  onPartial,
  onFinal,
  onSubmitKeyword,
}: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>(IDLE_STATE)
  const [micStream, setMicStream] = useState<MediaStream | null>(null)

  const speechSessionRef = useRef<ReturnType<typeof createSpeechSession> | null>(null)
  const batchSessionRef = useRef<BatchRecorderSession | null>(null)
  const spokenRef = useRef('')
  const stopModeRef = useRef<'stop' | 'cancel'>('stop')
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const callbacksRef = useRef({ onPartial, onFinal, onSubmitKeyword, submitKeywords, transcribeBlob })
  callbacksRef.current = { onPartial, onFinal, onSubmitKeyword, submitKeywords, transcribeBlob }

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const beginTimer = useCallback(() => {
    startedAtRef.current = Date.now()
    timerRef.current = window.setInterval(() => {
      setState((prev) => ({
        ...prev,
        elapsedMs: Date.now() - startedAtRef.current,
      }))
    }, 200)
  }, [])

  const resetToIdle = useCallback(() => {
    clearTimer()
    setMicStream(null)
    setState(IDLE_STATE)
  }, [clearTimer])

  const finalizeTranscript = useCallback((transcript: string) => {
    const { isTrigger, spokenText } = matchSubmitKeyword(
      transcript,
      callbacksRef.current.submitKeywords,
    )

    if (!spokenText) {
      if (isTrigger) callbacksRef.current.onSubmitKeyword?.('')
      return
    }

    if (isTrigger) {
      callbacksRef.current.onFinal(spokenText)
      callbacksRef.current.onSubmitKeyword?.(spokenText)
      return
    }

    callbacksRef.current.onFinal(spokenText)
  }, [])

  const stopBatch = useCallback(async () => {
    const session = batchSessionRef.current
    batchSessionRef.current = null
    if (!session) {
      resetToIdle()
      return
    }

    if (stopModeRef.current === 'cancel') {
      session.cancel()
      resetToIdle()
      return
    }

    setState((prev) => ({ ...prev, status: 'transcribing' }))
    clearTimer()
    setMicStream(null)

    try {
      const blob = await session.stop()
      const transcribe = callbacksRef.current.transcribeBlob
      if (!transcribe) {
        throw new Error('speech_not_supported')
      }
      const transcript = (await transcribe(blob)).trim()
      spokenRef.current = ''
      resetToIdle()
      finalizeTranscript(transcript)
    } catch (error) {
      spokenRef.current = ''
      setState({
        status: 'error',
        error: mapVoiceInputError(error),
        elapsedMs: 0,
      })
      setMicStream(null)
    }
  }, [clearTimer, finalizeTranscript, resetToIdle])

  const finishSpeechSession = useCallback(
    (mode: 'stop' | 'cancel') => {
      const session = speechSessionRef.current
      speechSessionRef.current = null
      clearTimer()
      setMicStream(null)

      if (!session) {
        resetToIdle()
        return
      }

      if (mode === 'cancel') {
        session.abort()
        spokenRef.current = ''
        resetToIdle()
        return
      }

      session.stop()
      const transcript = session.getFinalTranscript() || spokenRef.current
      spokenRef.current = ''
      resetToIdle()
      finalizeTranscript(transcript)
    },
    [clearTimer, finalizeTranscript, resetToIdle],
  )

  const startWebSpeech = useCallback(() => {
    const session = createSpeechSession(language, {
      onPartial: (text) => {
        spokenRef.current = text
        callbacksRef.current.onPartial(text)
        setState((prev) => ({ ...prev, interimText: text }))
      },
      onFinalSegment: (segment) => {
        const { isTrigger, spokenText } = matchSubmitKeyword(
          segment,
          callbacksRef.current.submitKeywords,
        )
        if (isTrigger) {
          if (spokenText) callbacksRef.current.onFinal(spokenText)
          callbacksRef.current.onSubmitKeyword?.(spokenText)
          stopModeRef.current = 'cancel'
          speechSessionRef.current?.abort()
          speechSessionRef.current = null
          clearTimer()
          spokenRef.current = ''
          resetToIdle()
        }
      },
      onError: (code) => {
        speechSessionRef.current = null
        clearTimer()
        spokenRef.current = ''
        setState({
          status: 'error',
          error: mapSpeechRecognitionError(code),
          elapsedMs: 0,
        })
        setMicStream(null)
      },
      onEnd: () => {
        if (stopModeRef.current === 'cancel') return
        const active = speechSessionRef.current
        if (!active) return
        speechSessionRef.current = null
        clearTimer()
        const transcript = active.getFinalTranscript() || spokenRef.current
        spokenRef.current = ''
        resetToIdle()
        finalizeTranscript(transcript)
      },
    })

    speechSessionRef.current = session
    session.start()
    beginTimer()
    setState({
      status: 'recording',
      elapsedMs: 0,
      interimText: undefined,
      error: undefined,
    })
  }, [beginTimer, clearTimer, finalizeTranscript, language, resetToIdle])

  const startBatch = useCallback(async () => {
    const session = await startBatchRecorder()
    batchSessionRef.current = session
    setMicStream(session.stream)
    beginTimer()
    setState({
      status: 'recording',
      elapsedMs: 0,
      interimText: undefined,
      error: undefined,
    })
  }, [beginTimer])

  const start = useCallback(async () => {
    if (disabled || state.status === 'recording' || state.status === 'requesting_permission') {
      return
    }
    if (state.status === 'transcribing') return

    if (engine === 'webSpeech' && !isSpeechRecognitionSupported()) {
      setState({
        status: 'error',
        error: 'not_supported',
        elapsedMs: 0,
      })
      return
    }

    stopModeRef.current = 'stop'
    spokenRef.current = ''
    setState({
      status: 'requesting_permission',
      elapsedMs: 0,
      interimText: undefined,
      error: undefined,
    })

    try {
      if (engine === 'batch') {
        await startBatch()
        return
      }
      startWebSpeech()
    } catch (error) {
      setState({
        status: 'error',
        error: mapVoiceInputError(error),
        elapsedMs: 0,
      })
      setMicStream(null)
    }
  }, [disabled, engine, startBatch, startWebSpeech, state.status])

  const stop = useCallback(() => {
    if (state.status !== 'recording') return
    stopModeRef.current = 'stop'
    if (engine === 'batch') {
      void stopBatch()
      return
    }
    finishSpeechSession('stop')
  }, [engine, finishSpeechSession, state.status, stopBatch])

  const cancel = useCallback(() => {
    if (state.status === 'transcribing') return
    if (state.status !== 'recording' && state.status !== 'requesting_permission') return
    stopModeRef.current = 'cancel'
    if (engine === 'batch') {
      batchSessionRef.current?.cancel()
      batchSessionRef.current = null
      resetToIdle()
      return
    }
    finishSpeechSession('cancel')
  }, [engine, finishSpeechSession, resetToIdle, state.status])

  const toggle = useCallback(() => {
    if (state.status === 'recording') {
      stop()
      return
    }
    if (state.status === 'idle' || state.status === 'error') {
      void start()
    }
  }, [start, state.status, stop])

  const dismissError = useCallback(() => {
    setState(IDLE_STATE)
  }, [])

  useEffect(() => {
    return () => {
      stopModeRef.current = 'cancel'
      speechSessionRef.current?.abort()
      speechSessionRef.current = null
      batchSessionRef.current?.cancel()
      batchSessionRef.current = null
      clearTimer()
      setMicStream(null)
    }
  }, [clearTimer])

  const isSupported =
    engine === 'batch' ? typeof MediaRecorder !== 'undefined' : isSpeechRecognitionSupported()

  return {
    state,
    micStream,
    isSupported,
    isRecording: state.status === 'recording',
    isTranscribing: state.status === 'transcribing',
    start,
    stop,
    cancel,
    toggle,
    dismissError,
  }
}
