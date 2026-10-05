'use client'

import { useEffect, useState } from 'react'
import type * as React from 'react'

import ActivityItem from '@/components/ActivityItem'
import StatsCard from '@/components/StatsCard'

const SNAPSHOT_MESSAGE_TYPE = 'projectos:block-render-snapshot-v1'
const READY_MESSAGE_TYPE = 'projectos:design-host-ready-v1'

type Value =
  | { type: 'literal'; value: string | number | boolean | null }
  | { type: 'binding'; path: string }
  | { type: 'input'; inputName: string }
  | { type: 'token'; tokenId: string; tokenVersion: number }

interface LayoutBlock {
  id: string
  label: string
  kind: 'layout'
  semantic: { element: 'div' | 'main' | 'header' | 'section' | 'h1' | 'h2' | 'p' | 'ol' }
  layout: {
    padding?: number
    margin?: number
    marginBottom?: number
    sizing?: { maxWidth?: number }
  }
  style?: {
    color?: string
    backgroundColor?: string
    border?: string
    borderRadius?: number
    fontSize?: number
    fontWeight?: number
    lineHeight?: number
    textTransform?: React.CSSProperties['textTransform']
  }
  content?: Value
  slots: Record<string, string[]>
}

interface ComponentBlock {
  id: string
  label: string
  kind: 'component'
  definitionId: string
  props: Record<string, Value>
}

interface TextBlock {
  id: string
  label: string
  kind: 'text'
  content: Value
}

type Block = LayoutBlock | ComponentBlock | TextBlock

interface DesignHostSnapshot {
  version: 1
  document: {
    documentId: string
    revision: number
    rootBlockId: string
    blocks: Record<string, Block>
  }
  viewportProfile: { id: string }
  fixtureState: { id: string; sha256: string }
  fixtureData: unknown
}

export default function DesignHostClient() {
  const [snapshot, setSnapshot] = useState<DesignHostSnapshot | undefined>()
  const [geometryProofSha256, setGeometryProofSha256] = useState<string | undefined>()

  useEffect(() => {
    const view = document.defaultView
    if (!view) return undefined
    const receive = (event: MessageEvent) => {
      if (event.source !== view || event.origin !== document.location.origin) return
      const data = event.data as { type?: unknown; snapshot?: unknown } | null
      if (!data || data.type !== SNAPSHOT_MESSAGE_TYPE || !isSnapshot(data.snapshot)) return
      setSnapshot(data.snapshot)
    }

    view.addEventListener('message', receive)
    view.postMessage({ type: READY_MESSAGE_TYPE }, document.location.origin)
    return () => view.removeEventListener('message', receive)
  }, [])

  useEffect(() => {
    if (!snapshot) {
      setGeometryProofSha256(undefined)
      return undefined
    }
    const view = document.defaultView
    if (!view) return undefined
    let cancelled = false
    const frame = view.requestAnimationFrame(() => {
      void createGeometryProofSha256(snapshot).then((hash) => {
        if (!cancelled) setGeometryProofSha256(hash)
      })
    })
    return () => {
      cancelled = true
      view.cancelAnimationFrame(frame)
    }
  }, [snapshot])

  if (!snapshot) {
    return (
      <section
        data-projectos-design-host-status="waiting-for-block-snapshot"
        aria-label="ProjectOS design host waiting for block snapshot"
      >
        Waiting for ProjectOS block snapshot.
      </section>
    )
  }

  return (
    <div
      data-projectos-design-host-status="ready"
      data-projectos-render-source="blocks-snapshot"
      data-projectos-document-id={snapshot.document.documentId}
      data-projectos-document-revision={snapshot.document.revision}
      data-projectos-viewport-profile-id={snapshot.viewportProfile.id}
      data-projectos-fixture-state-id={snapshot.fixtureState.id}
      data-projectos-fixture-state-sha256={snapshot.fixtureState.sha256}
      data-projectos-geometry-proof-sha256={geometryProofSha256}
    >
      {renderBlock(snapshot, snapshot.document.rootBlockId)}
    </div>
  )
}

function renderBlock(snapshot: DesignHostSnapshot, blockId: string): React.ReactNode {
  const block = snapshot.document.blocks[blockId]
  if (!block) return null
  const identity = {
    'data-projectos-block-id': block.id,
    'data-projectos-document-id': snapshot.document.documentId,
    'data-projectos-document-revision': snapshot.document.revision,
  }
  if (block.kind === 'text') return valueAsText(block.content, snapshot.fixtureData)
  if (block.kind === 'component') {
    if (block.definitionId === 'sample.stats-card') {
      return (
        <StatsCard
          key={block.id}
          {...identity}
          title={valueAsText(block.props.title, snapshot.fixtureData)}
          value={Number(valueAsText(block.props.value, snapshot.fixtureData))}
          projectOSBlockParts={{ title: 'title', value: 'value' }}
        />
      )
    }
    if (block.definitionId === 'sample.activity-item') {
      return (
        <ActivityItem
          key={block.id}
          {...identity}
          title={valueAsText(block.props.title, snapshot.fixtureData)}
          label={valueAsText(block.props.label, snapshot.fixtureData)}
          projectOSBlockParts={{ title: 'title', label: 'label' }}
        />
      )
    }
    return null
  }
  const Tag = block.semantic.element
  const children = block.slots.children?.map((childId) => renderBlock(snapshot, childId)) ?? []
  const content = block.content ? valueAsText(block.content, snapshot.fixtureData) : null
  return (
    <Tag
      key={block.id}
      {...identity}
      style={styleFor(block)}
      aria-label={block.semantic.element === 'section' ? block.label : undefined}
    >
      {content}
      {children}
    </Tag>
  )
}

function styleFor(block: LayoutBlock): React.CSSProperties {
  return {
    ...(block.layout.padding === undefined ? {} : { padding: block.layout.padding }),
    ...(block.layout.margin === undefined ? {} : { margin: block.layout.margin }),
    ...(block.layout.marginBottom === undefined ? {} : { marginBottom: block.layout.marginBottom }),
    ...(block.layout.sizing?.maxWidth === undefined ? {} : { maxWidth: block.layout.sizing.maxWidth }),
    ...(block.style ?? {}),
  }
}

function valueAsText(value: Value | undefined, data: unknown): string {
  if (!value) return ''
  if (value.type === 'literal') return String(value.value ?? '')
  if (value.type === 'binding') return String(readPath(data, value.path) ?? '')
  return ''
}

function readPath(value: unknown, path: string): unknown {
  let current = value
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function isSnapshot(value: unknown): value is DesignHostSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<DesignHostSnapshot>
  return snapshot.version === 1 &&
    Boolean(snapshot.document?.documentId) &&
    Number.isSafeInteger(snapshot.document?.revision) &&
    Boolean(snapshot.document?.rootBlockId) &&
    Boolean(snapshot.document?.blocks) &&
    Boolean(snapshot.viewportProfile?.id) &&
    Boolean(snapshot.fixtureState?.id) &&
    Boolean(snapshot.fixtureState?.sha256)
}

async function createGeometryProofSha256(
  snapshot: DesignHostSnapshot,
): Promise<string | undefined> {
  const view = document.defaultView
  if (!view?.crypto.subtle) return undefined
  const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-projectos-block-id]'))
  const entries = elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return {
      blockId: element.dataset.projectosBlockId,
      documentId: element.dataset.projectosDocumentId,
      documentRevision: element.dataset.projectosDocumentRevision,
      tagName: element.tagName.toLowerCase(),
      x: stableCssPixel(rect.x),
      y: stableCssPixel(rect.y),
      width: stableCssPixel(rect.width),
      height: stableCssPixel(rect.height),
    }
  })
  const encoded = new TextEncoder().encode(JSON.stringify({
    version: 1,
    documentId: snapshot.document.documentId,
    documentRevision: snapshot.document.revision,
    viewportProfileId: snapshot.viewportProfile.id,
    fixtureStateId: snapshot.fixtureState.id,
    entries,
  }))
  const digest = await view.crypto.subtle.digest('SHA-256', encoded)
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

function stableCssPixel(value: number): number {
  return Math.round(value * 1000) / 1000
}
