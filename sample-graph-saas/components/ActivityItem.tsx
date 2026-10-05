'use client'

import type * as React from 'react'

import styles from './ActivityItem.module.css'

interface Props {
  title: string
  label: string
  style?: React.CSSProperties
  projectOSBlockParts?: Readonly<Record<string, string>>
  'data-projectos-block-id'?: string
  'data-projectos-document-id'?: string
  'data-projectos-document-revision'?: number
}

export default function ActivityItem(props: Props) {
  const {
    title,
    label,
    style,
    projectOSBlockParts,
    'data-projectos-block-id': blockId,
    'data-projectos-document-id': documentId,
    'data-projectos-document-revision': documentRevision,
  } = props
  return (
    <li
      data-projectos-block-id={blockId}
      data-projectos-document-id={documentId}
      data-projectos-document-revision={documentRevision}
      className={styles.item}
      style={{ backgroundColor: '#ffffff', ...style }}
    >
      <strong data-projectos-block-part={projectOSBlockParts?.title} className={styles.title}>{title}</strong>
      <span data-projectos-block-part={projectOSBlockParts?.label}>{label}</span>
    </li>
  )
}
