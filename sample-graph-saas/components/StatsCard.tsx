'use client'

import type * as React from 'react'

import styles from './StatsCard.module.css'

interface Props {
  title: string
  value: number
  style?: React.CSSProperties
  projectOSBlockParts?: Readonly<Record<string, string>>
  'data-projectos-block-id'?: string
  'data-projectos-document-id'?: string
  'data-projectos-document-revision'?: number
}

export default function StatsCard(props: Props) {
  const {
    title,
    value,
    style,
    projectOSBlockParts,
    'data-projectos-block-id': blockId,
    'data-projectos-document-id': documentId,
    'data-projectos-document-revision': documentRevision,
  } = props
  return (
    <div
      data-projectos-block-id={blockId}
      data-projectos-document-id={documentId}
      data-projectos-document-revision={documentRevision}
      className={styles.metricValue}
      style={{ padding: 16, border: '1px solid #eee', borderRadius: 8, color: '#111827', ...style }}
    >
      <h3 data-projectos-block-part={projectOSBlockParts?.title} className={styles.metricTitle}>{title}</h3>
      <p data-projectos-block-part={projectOSBlockParts?.value}>{value}</p>
    </div>
  )
}
