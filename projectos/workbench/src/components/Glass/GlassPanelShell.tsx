import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildDisplacementMapCanvas, canvasToBlobUrl } from './displacementMap'
import { createBlobUrlLifecycle } from './blobUrlLifecycle'
import styles from './Glass.module.css'

/**
 * Tier B glass shell for navigation panels over a live canvas backdrop.
 * Samples painted pixels behind the panel via backdrop-filter (live blur /
 * colour bleed as nodes move underneath) and adds rim refraction via SVG
 * displacement on a counter-positioned ambient layer at the edges.
 */

interface GlassPanelShellProps {
  children: ReactNode
  className?: string
  /** Which edge gets the stronger glass rim highlight. */
  edge?: 'left' | 'right' | 'top' | 'none'
  /** When false, children render without the glass shell (e.g. code editor tab). */
  active?: boolean
  /** Restores pointer events when parent layout is in graph-bleed pass-through mode. */
  zoneInteractive?: boolean
}

/** Keep in sync with --radius-glass-lg in tokens.css */
const PANEL_SHELL_RADIUS_LG = 24

let filterSeq = 0

export default function GlassPanelShell({
  children,
  className = '',
  edge = 'none',
  active = true,
  zoneInteractive = false,
}: GlassPanelShellProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [mapUrl, setMapUrl] = useState<string | null>(null)
  const mapUrlLifecycleRef = useRef<ReturnType<typeof createBlobUrlLifecycle> | null>(null)
  if (mapUrlLifecycleRef.current === null) {
    mapUrlLifecycleRef.current = createBlobUrlLifecycle()
  }
  const filterId = useMemo(
    () => `glass-panel-${++filterSeq}`,
    [size.width, size.height, edge],
  )

  useEffect(() => {
    if (!active) return
    const el = shellRef.current
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
  }, [active])

  useEffect(() => {
    mapUrlLifecycleRef.current?.committed(mapUrl)
  }, [mapUrl])

  useEffect(() => () => {
    mapUrlLifecycleRef.current?.dispose()
  }, [])

  useEffect(() => {
    if (!active && mapUrl !== null) setMapUrl(null)
  }, [active, mapUrl])

  useEffect(() => {
    if (!active || size.width < 1 || size.height < 1) return
    let cancelled = false
    const radius = PANEL_SHELL_RADIUS_LG

    const canvas = buildDisplacementMapCanvas({
      width: size.width,
      height: size.height,
      radius,
      gain: 10,
    })
    canvasToBlobUrl(canvas)
      .then((blobUrl) => {
        mapUrlLifecycleRef.current?.created(blobUrl)
        if (cancelled) {
          mapUrlLifecycleRef.current?.abandoned(blobUrl)
          return
        }
        setMapUrl(blobUrl)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [active, size.width, size.height, edge])

  if (!active) {
    return (
      <div className={className} {...(zoneInteractive ? { 'data-zone-interactive': '' } : {})}>
        {children}
      </div>
    )
  }

  return (
    <div
      ref={shellRef}
      className={`${styles.panelShell} ${styles[`edge${edge.charAt(0).toUpperCase()}${edge.slice(1)}`]} ${className}`}
      data-glass-panel
      {...(zoneInteractive ? { 'data-zone-interactive': '' } : {})}
    >
      <div className={styles.panelGlassLive} aria-hidden />
      {mapUrl && (
        <>
          <div
            className={styles.panelRimRefract}
            style={{ filter: `url(#${filterId})` }}
            aria-hidden
          />
          <svg className={styles.filterDefs} aria-hidden>
            <filter id={filterId} colorInterpolationFilters="sRGB" x="-10%" y="-10%" width="120%" height="120%">
              <feImage href={mapUrl} result="map" x="0" y="0" width={size.width} height={size.height} />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={18}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </svg>
        </>
      )}
      <div className={styles.panelContent}>{children}</div>
    </div>
  )
}
