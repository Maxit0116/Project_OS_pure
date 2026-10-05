import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { buildDisplacementMapCanvas, canvasToBlobUrl } from './displacementMap'
import { createBlobUrlLifecycle } from './blobUrlLifecycle'
import styles from './Glass.module.css'

/**
 * Tier B "true" liquid glass lens — real edge refraction via SVG
 * feDisplacementMap, per https://glass.outpacestudios.com/
 *
 * Scoping note: Outpace's reference implementation refracts a live copy of
 * arbitrary DOM content behind the lens (requires tracking an actual backdrop
 * element). Project OS's hero surfaces (Welcome card, command palette, demo
 * dropdown) all float above the app's `--ambient-mesh` background, which is
 * `background-attachment: fixed`. We exploit that: the refract layer paints
 * the *same* fixed background declaration, so it is pixel-aligned with the
 * real backdrop automatically, with no DOM cloning or position math. The
 * physics (Snell's law squircle-dome displacement map) and the cross-browser
 * architecture (CSS `filter` on a copy, not `backdrop-filter` + SVG) are the
 * real thing — only the "what gets duplicated" step is simplified for our
 * fixed-gradient backdrop.
 */

interface GlassLensProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  radius?: number
  gain?: number
  /** Tint layered between the refracted backdrop and content, for legibility. */
  tint?: 'regular' | 'clear' | 'overlay'
}

let filterSeq = 0

export default function GlassLens({
  children,
  className = '',
  style,
  radius = 20,
  gain = 14,
  tint = 'regular',
}: GlassLensProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [mapUrl, setMapUrl] = useState<string | null>(null)
  const mapUrlLifecycleRef = useRef<ReturnType<typeof createBlobUrlLifecycle> | null>(null)
  if (mapUrlLifecycleRef.current === null) {
    mapUrlLifecycleRef.current = createBlobUrlLifecycle()
  }
  // Safari caches filter output by id; a fresh id per rebuild avoids a frozen lens.
  const filterId = useMemo(() => `glass-lens-${++filterSeq}`, [size.width, size.height, radius, gain])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize((prev) =>
        Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1
          ? { width, height }
          : prev,
      )
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    mapUrlLifecycleRef.current?.committed(mapUrl)
  }, [mapUrl])

  useEffect(() => () => {
    mapUrlLifecycleRef.current?.dispose()
  }, [])

  useEffect(() => {
    if (size.width < 1 || size.height < 1) return
    let cancelled = false

    const canvas = buildDisplacementMapCanvas({ width: size.width, height: size.height, radius, gain })
    canvasToBlobUrl(canvas)
      .then((blobUrl) => {
        mapUrlLifecycleRef.current?.created(blobUrl)
        if (cancelled) {
          mapUrlLifecycleRef.current?.abandoned(blobUrl)
          return
        }
        setMapUrl(blobUrl)
      })
      .catch(() => {
        /* prefers-reduced-transparency / non-canvas fallback simply keeps no map */
      })

    return () => {
      cancelled = true
    }
  }, [size.width, size.height, radius, gain])

  return (
    <div
      ref={containerRef}
      className={`${styles.lens} ${styles[tint]} ${className}`}
      style={{ ...style, borderRadius: radius }}
    >
      {mapUrl && (
        <div
          className={styles.refractCopy}
          style={{ filter: `url(#${filterId})` }}
          aria-hidden
        />
      )}
      {mapUrl && (
        <svg className={styles.filterDefs} aria-hidden>
          <filter id={filterId} colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
            <feImage href={mapUrl} result="map" x="0" y="0" width={size.width} height={size.height} />
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={gain * 2.4}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
      )}
      <div className={styles.lensContent}>{children}</div>
    </div>
  )
}
