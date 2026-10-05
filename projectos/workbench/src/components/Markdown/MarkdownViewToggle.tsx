import { Columns2, Eye, FileText, GitCompare } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { MarkdownDiffViewMode, MarkdownEditorViewMode } from './markdownPath'
import styles from './MarkdownViewToggle.module.css'

type EditorProps = {
  variant: 'editor'
  mode: MarkdownEditorViewMode
  onChange: (mode: MarkdownEditorViewMode) => void
}

type DiffProps = {
  variant: 'diff'
  mode: MarkdownDiffViewMode
  onChange: (mode: MarkdownDiffViewMode) => void
}

type Props = EditorProps | DiffProps

export default function MarkdownViewToggle(props: Props) {
  const { ts } = useI18n()

  if (props.variant === 'editor') {
    const { mode, onChange } = props
    const options: { id: MarkdownEditorViewMode; label: string; icon: typeof FileText }[] = [
      { id: 'source', label: ts('editor.markdownView.source'), icon: FileText },
      { id: 'preview', label: ts('editor.markdownView.preview'), icon: Eye },
      { id: 'split', label: ts('editor.markdownView.split'), icon: Columns2 },
    ]

    return (
      <div className={styles.toggle} role="tablist" aria-label={ts('editor.markdownView.source')}>
        {options.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={`${styles.btn} ${mode === id ? styles.btnActive : ''}`}
            title={label}
            onClick={() => onChange(id)}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden />
            <span className={styles.label}>{label}</span>
          </button>
        ))}
      </div>
    )
  }

  const { mode, onChange } = props
  const options: { id: MarkdownDiffViewMode; label: string; icon: typeof GitCompare }[] = [
    { id: 'text', label: ts('diff.markdownView.text'), icon: GitCompare },
    { id: 'preview', label: ts('diff.markdownView.preview'), icon: Eye },
  ]

  return (
    <div className={styles.toggle} role="tablist" aria-label={ts('diff.markdownView.text')}>
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          className={`${styles.btn} ${mode === id ? styles.btnActive : ''}`}
          title={label}
          onClick={() => onChange(id)}
        >
          <Icon size={14} strokeWidth={1.75} aria-hidden />
          <span className={styles.label}>{label}</span>
        </button>
      ))}
    </div>
  )
}
