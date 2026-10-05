import { useEffect, useMemo, useState } from 'react'
import { Box, FunctionSquare, Variable } from 'lucide-react'
import type { DocumentSymbolItem, DocumentSymbolKind } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useOutlineStore } from '../../state/outlineStore'
import { revealPosition } from '../CodeEditor/editorNavigation'
import TreeRowChevron from '../SemanticFileTree/TreeRowChevron'
import styles from './OutlinePanel.module.css'

interface Props {
  filePath: string | null
}

const KIND_ICON: Partial<Record<DocumentSymbolKind, typeof Box>> = {
  class: Box,
  interface: Box,
  function: FunctionSquare,
  method: FunctionSquare,
  variable: Variable,
  constant: Variable,
}

function SymbolNode({
  symbol,
  depth,
  onSelect,
}: {
  symbol: DocumentSymbolItem
  depth: number
  onSelect: (symbol: DocumentSymbolItem) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = symbol.children.length > 0
  const Icon = KIND_ICON[symbol.kind] ?? Box

  return (
    <div className={styles.node}>
      <button
        type="button"
        className={styles.row}
        style={{ paddingLeft: `calc(var(--space-sm) + ${depth} * 12px)` }}
        onClick={() => onSelect(symbol)}
      >
        <TreeRowChevron
          expanded={expanded}
          visible={hasChildren}
          onToggle={() => setExpanded((value) => !value)}
          label={symbol.name}
        />
        <Icon size={12} strokeWidth={1.75} className={styles.icon} aria-hidden />
        <span className={styles.label}>{symbol.name}</span>
      </button>
      {hasChildren && expanded
        ? symbol.children.map((child) => (
            <SymbolNode
              key={`${child.name}:${child.startLine}:${child.startColumn}`}
              symbol={child}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  )
}

export default function OutlinePanel({ filePath }: Props) {
  const { ts } = useI18n()
  const symbolsByFile = useOutlineStore((s) => s.symbolsByFile)
  const loadingFiles = useOutlineStore((s) => s.loadingFiles)
  const unavailableReason = useOutlineStore((s) => s.unavailableReason)
  const fetchOutline = useOutlineStore((s) => s.fetchOutline)

  useEffect(() => {
    if (!filePath) return
    void fetchOutline(filePath)
  }, [filePath, fetchOutline])

  const symbols = filePath ? symbolsByFile[filePath] ?? [] : []
  const loading = filePath ? loadingFiles[filePath] : false

  const emptyMessage = useMemo(() => {
    if (!filePath) return ts('outline.noFile')
    if (loading) return ts('outline.loading')
    if (unavailableReason) return ts('outline.unavailable')
    return ts('outline.empty')
  }, [filePath, loading, unavailableReason, ts])

  const handleSelect = (symbol: DocumentSymbolItem) => {
    if (!filePath) return
    revealPosition(filePath, symbol.startLine, symbol.startColumn)
  }

  if (!filePath) {
    return <p className={styles.empty}>{emptyMessage}</p>
  }

  if (loading && symbols.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>
  }

  if (symbols.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>
  }

  return (
    <div className={styles.panel}>
      {symbols.map((symbol) => (
        <SymbolNode
          key={`${symbol.name}:${symbol.startLine}:${symbol.startColumn}`}
          symbol={symbol}
          depth={0}
          onSelect={handleSelect}
        />
      ))}
    </div>
  )
}
