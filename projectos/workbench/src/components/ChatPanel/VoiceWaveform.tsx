import { useEffect, useRef } from 'react'
import styles from './VoiceWaveform.module.css'

interface Props {
  level: number
  active: boolean
  height?: number
}

export default function VoiceWaveform({ level, active, height = 28 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let raf = 0
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const width = canvas.clientWidth
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const bars = 24
      const gap = 2
      const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars)
      const amplitude = active ? 0.25 + level * 0.75 : 0.12

      for (let i = 0; i < bars; i += 1) {
        const wave = Math.sin(phaseRef.current + i * 0.45) * 0.5 + 0.5
        const barHeight = Math.max(4, height * amplitude * (0.35 + wave * 0.65))
        const x = i * (barWidth + gap)
        const y = (height - barHeight) / 2
        ctx.fillStyle = active ? 'var(--color-accent)' : 'var(--color-text-muted)'
        ctx.globalAlpha = active ? 0.55 + wave * 0.45 : 0.35
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, 999)
        ctx.fill()
      }

      ctx.globalAlpha = 1
      phaseRef.current += active ? 0.18 + level * 0.25 : 0.04
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [active, height, level])

  return <canvas ref={canvasRef} className={styles.canvas} style={{ height }} aria-hidden />
}
