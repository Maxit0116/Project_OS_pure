import { useEffect, useMemo, useRef, useState } from 'react'
import { Layers2, X } from 'lucide-react'
import type { WorkGroupSelectionItem } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import { GlassLens } from '../Glass'
import {
  handleTopmostOverlayEscape,
  isTopmostOverlay,
  registerOverlay,
} from '../overlays/overlayStack'
import { trapDialogTab } from '../Settings/settingsDialogFocus'
import { getMapArtifactDisplayTitle } from './mapArtifactTitle'
import { moveWorkGroupSuggestionIndex } from './mapWorkGroupDialogKeyboard'
import {
  buildWorkGroupSelectCandidates,
  decorateCandidateDisabledState,
  filterCandidatesByQuery,
  previewMergeOutcome,
  rankSuggestions,
  resolveSelectedItems,
  type WorkGroupSelectCandidate,
} from './mapWorkGroupSelection'
import styles from './MapWorkGroupCreateDialog.module.css'

interface Props {
  onCancel: () => void
  onConfirm: (items: WorkGroupSelectionItem[]) => void | Promise<void>
}

export default function MapWorkGroupCreateDialog({ onCancel, onConfirm }: Props) {
  const { ts } = useI18n()
  const mapContent = useWorkbenchStore((s) => s.mapContent)
  const [query, setQuery] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const overlayTokenRef = useRef(Symbol('map-workgroup-create-dialog'))
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  const labels = useMemo(
    () => ({
      untitled: ts('mapArtifacts.untitledTitle'),
      workgroup: ts('map.workGroup.memberKind.workgroup'),
      memberCount: (count: number) =>
        ts('map.workGroup.memberKind.memberCount', { count }),
      artifactType: {
        note: ts('map.workGroup.memberKind.note'),
        plan: ts('map.workGroup.memberKind.plan'),
        acceptance_list: ts('map.workGroup.memberKind.acceptance'),
        terminal: ts('map.workGroup.memberKind.terminal'),
        image: ts('map.workGroup.memberKind.image'),
        urls: ts('map.workGroup.memberKind.urls'),
      },
    }),
    [ts],
  )

  const baseCandidates = useMemo(() => {
    if (!mapContent) {
      return []
    }
    return buildWorkGroupSelectCandidates(
      mapContent.artifacts,
      mapContent.workGroups,
      labels,
      (artifactId, fallback) => {
        const artifact = mapContent.artifacts.find((item) => item.id === artifactId)
        return artifact ? getMapArtifactDisplayTitle(artifact, fallback) : fallback
      },
    )
  }, [labels, mapContent])

  const candidates = useMemo(
    () => decorateCandidateDisabledState(baseCandidates, selectedKeys),
    [baseCandidates, selectedKeys],
  )

  const suggestions = useMemo(
    () => rankSuggestions(candidates, query),
    [candidates, query],
  )

  const filteredCandidates = useMemo(
    () => filterCandidatesByQuery(candidates, query),
    [candidates, query],
  )

  const selectedCandidates = useMemo(
    () => baseCandidates.filter((candidate) => selectedKeys.has(candidate.key)),
    [baseCandidates, selectedKeys],
  )

  const items = useMemo(
    () => resolveSelectedItems(baseCandidates, selectedKeys),
    [baseCandidates, selectedKeys],
  )

  const preview = useMemo(() => {
    if (!mapContent) {
      return null
    }
    return previewMergeOutcome(mapContent, items)
  }, [items, mapContent])

  useEffect(() => {
    setActiveSuggestionIndex(moveWorkGroupSuggestionIndex(suggestions, -1, 'first'))
  }, [query, suggestions])

  useEffect(() => {
    const token = overlayTokenRef.current
    const unregisterOverlay = registerOverlay(token)
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusableElements = () => {
      const dialog = dialogRef.current
      if (!dialog) return []
      return Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ))
    }
    inputRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (handleTopmostOverlayEscape(event, token, () => onCancelRef.current())) return
      if (event.key !== 'Tab' || !isTopmostOverlay(token)) return
      if (
        trapDialogTab(
          focusableElements(),
          document.activeElement as HTMLElement | null,
          event.shiftKey,
        )
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      unregisterOverlay()
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  const toggleCandidate = (candidate: WorkGroupSelectCandidate) => {
    if (candidate.disabled) {
      return
    }
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(candidate.key)) {
        next.delete(candidate.key)
      } else {
        next.add(candidate.key)
      }
      return next
    })
  }

  const removeSelectedKey = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const move =
      event.key === 'ArrowDown'
        ? 'next'
        : event.key === 'ArrowUp'
          ? 'previous'
          : event.key === 'Home'
            ? 'first'
            : event.key === 'End'
              ? 'last'
              : null
    if (move) {
      event.preventDefault()
      setActiveSuggestionIndex((current) =>
        moveWorkGroupSuggestionIndex(suggestions, current, move),
      )
      return
    }
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    const target = suggestions[activeSuggestionIndex] ?? suggestions.find((item) => !item.disabled)
    if (target) {
      toggleCandidate(target)
    }
  }

  const renderListItem = (candidate: WorkGroupSelectCandidate, active = false) => {
    const selected = selectedKeys.has(candidate.key)
    return (
      <li key={candidate.key}>
        <button
          type="button"
          className={`${styles.listItem}${selected || active ? ` ${styles.listItemActive}` : ''}`}
          disabled={candidate.disabled}
          aria-pressed={selected}
          onClick={() => toggleCandidate(candidate)}
        >
          <span
            className={`${styles.checkbox}${selected ? ` ${styles.checkboxChecked}` : ''}`}
            aria-hidden
          >
            {selected ? '✓' : ''}
          </span>
          {candidate.kind === 'workgroup' ? (
            <Layers2 size={14} strokeWidth={1.75} aria-hidden />
          ) : null}
          <span className={styles.listItemBody}>
            <span className={styles.listItemTitle}>{candidate.title}</span>
            <span className={styles.listItemSubtitle}>{candidate.subtitle}</span>
          </span>
        </button>
      </li>
    )
  }

  const handleConfirm = () => {
    void onConfirm(items)
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="map-workgroup-create-dialog-heading"
      data-zone-interactive
    >
      <button
        type="button"
        className={styles.backdrop}
        onClick={onCancel}
        tabIndex={-1}
        aria-label={ts('common.close')}
      />
      <GlassLens radius={20} tint="overlay" className={styles.panel}>
        <div ref={dialogRef} className={styles.panelInner} tabIndex={-1}>
          <div className={styles.header}>
            <h2 id="map-workgroup-create-dialog-heading" className={styles.title}>
              {ts('map.workGroup.createDialog.title')}
            </h2>
            <p className={styles.prompt}>{ts('map.workGroup.createDialog.description')}</p>
          </div>

          <div className={styles.chips}>
            {selectedCandidates.length === 0 ? (
              <span className={styles.chipsEmpty}>
                {ts('map.workGroup.createDialog.selectedEmpty')}
              </span>
            ) : (
              selectedCandidates.map((candidate) => (
                <span key={candidate.key} className={styles.chip}>
                  <span className={styles.chipLabel}>{candidate.title}</span>
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={ts('common.close')}
                    onClick={() => removeSelectedKey(candidate.key)}
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </span>
              ))
            )}
          </div>

          <input
            ref={inputRef}
            type="search"
            className={styles.input}
            value={query}
            placeholder={ts('map.workGroup.createDialog.searchPlaceholder')}
            aria-label={ts('map.workGroup.createDialog.searchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />

          {query.trim() ? (
            <div className={styles.listSection}>
              <p className={styles.sectionLabel}>{ts('map.workGroup.createDialog.suggestions')}</p>
              {suggestions.length > 0 ? (
                <ul className={styles.suggestionList}>
                  {suggestions.map((candidate, index) =>
                    renderListItem(candidate, index === activeSuggestionIndex),
                  )}
                </ul>
              ) : (
                <p className={styles.emptyResults}>{ts('map.workGroup.createDialog.noResults')}</p>
              )}
            </div>
          ) : null}

          <div className={styles.listSection}>
            <p className={styles.sectionLabel}>{ts('map.workGroup.createDialog.fullList')}</p>
            {filteredCandidates.length > 0 ? (
              <ul className={styles.fullList}>
                {filteredCandidates.map((candidate) => renderListItem(candidate))}
              </ul>
            ) : (
              <p className={styles.emptyResults}>{ts('map.workGroup.createDialog.noResults')}</p>
            )}
          </div>

          {preview && preview.effectiveMemberCount > 0 ? (
            <>
              <p className={styles.preview}>
                {preview.willCreateNew
                  ? ts('map.workGroup.createDialog.previewCreate', {
                      title: preview.primaryWorkGroupTitle ?? '',
                      count: preview.effectiveMemberCount,
                    })
                  : ts('map.workGroup.createDialog.previewMerge', {
                      title: preview.primaryWorkGroupTitle ?? '',
                      count: preview.effectiveMemberCount,
                    })}
              </p>
              {preview.willRearrange ? (
                <p className={styles.previewHint}>
                  {preview.appendToExisting
                    ? ts('map.workGroup.createDialog.previewRearrange')
                    : ts('map.workGroup.createDialog.previewRearrangeNewGroup')}
                </p>
              ) : null}
            </>
          ) : null}

          <div className={styles.actions}>
            <Button variant="secondary" size="sm" onClick={onCancel}>
              {ts('common.skip')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirm}
            >
              {ts('map.workGroup.createDialog.confirm')}
            </Button>
          </div>
        </div>
      </GlassLens>
    </div>
  )
}
