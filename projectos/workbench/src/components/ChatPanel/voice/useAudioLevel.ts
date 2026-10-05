import { useEffect, useRef, useState } from 'react'

export function useAudioLevel(active: boolean, stream?: MediaStream | null) {
  const [level, setLevel] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      setLevel(0)
      return
    }

    let disposed = false
    let audioContext: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let ownedStream: MediaStream | null = null
    let buffer: Uint8Array<ArrayBuffer> | null = null

    const cleanup = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      ownedStream?.getTracks().forEach((track) => track.stop())
      ownedStream = null
      void audioContext?.close()
      audioContext = null
      analyser = null
    }

    const tick = () => {
      if (!analyser || disposed) return
      if (!buffer || buffer.length !== analyser.frequencyBinCount) {
        buffer = new Uint8Array(analyser.frequencyBinCount)
      }
      analyser.getByteFrequencyData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i += 1) sum += buffer[i]
      const average = buffer.length > 0 ? sum / buffer.length / 255 : 0
      setLevel(average)
      rafRef.current = requestAnimationFrame(tick)
    }

    void (async () => {
      try {
        const activeStream =
          stream ??
          (await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            },
          }))
        if (!stream) ownedStream = activeStream
        if (disposed) {
          activeStream.getTracks().forEach((track) => track.stop())
          return
        }
        audioContext = new AudioContext()
        const source = audioContext.createMediaStreamSource(activeStream)
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        rafRef.current = requestAnimationFrame(tick)
      } catch {
        if (!disposed) setLevel(0)
      }
    })()

    return () => {
      disposed = true
      cleanup()
    }
  }, [active, stream])

  return level
}
