import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { NoteDocument, NoteMapArtifact } from '@contracts/index'
import { useI18n } from '../../../i18n'
import { useDebouncedArtifactUpdate } from '../useDebouncedArtifactUpdate'
import NoteFontColorDialog from './NoteFontColorDialog'
import NoteSelectionContextMenu, {
  type NoteSelectionContextMenuState,
} from './NoteSelectionContextMenu'
import { buildNotePayloadPatch, resolveNoteDocument } from './noteDocument'
import { createNoteEditorExtensions } from './noteEditorExtensions'
import styles from './noteEditor.module.css'

interface Props {
  artifact: NoteMapArtifact
}

export default function NoteRichTextEditor({ artifact }: Props) {
  const { ts } = useI18n()
  const { schedule, flush } = useDebouncedArtifactUpdate(artifact.id)
  const [contextMenu, setContextMenu] = useState<NoteSelectionContextMenuState | null>(null)
  const [colorDialogOpen, setColorDialogOpen] = useState(false)
  const latestNoteRef = useRef(artifact.note)
  const artifactIdRef = useRef(artifact.id)

  latestNoteRef.current = artifact.note
  artifactIdRef.current = artifact.id

  const persistDocument = useCallback(
    (document: NoteDocument, immediate = false) => {
      const patch = {
        note: {
          ...latestNoteRef.current,
          ...buildNotePayloadPatch(latestNoteRef.current, document),
        },
      }
      if (immediate) {
        flush(patch)
      } else {
        schedule(patch)
      }
    },
    [flush, schedule],
  )

  const editor = useEditor(
    {
      extensions: createNoteEditorExtensions(),
      content: resolveNoteDocument(artifact.note),
      editorProps: {
        attributes: {
          class: 'nodrag nopan',
          'aria-label': ts('mapArtifacts.noteBodyPlaceholder'),
        },
      },
      onUpdate: ({ editor: currentEditor }) => {
        persistDocument(currentEditor.getJSON() as NoteDocument)
      },
      onBlur: ({ editor: currentEditor }) => {
        persistDocument(currentEditor.getJSON() as NoteDocument, true)
      },
    },
    [artifact.id],
  )

  useEffect(() => {
    if (!editor || artifact.id !== artifactIdRef.current) return
    const nextDocument = resolveNoteDocument(artifact.note)
    const currentDocument = editor.getJSON()
    if (JSON.stringify(currentDocument) !== JSON.stringify(nextDocument)) {
      editor.commands.setContent(nextDocument, { emitUpdate: false })
    }
  }, [artifact.id, artifact.note, artifact.updatedAt, editor])

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!editor) return

    const { empty } = editor.state.selection
    if (empty) return

    event.preventDefault()
    event.stopPropagation()
    setColorDialogOpen(false)
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      restoreFocusTo: event.currentTarget,
    })
  }

  return (
    <div className={`${styles.noteEditorRoot} nodrag nopan`} data-zone-interactive>
      <div className={`${styles.editorSurface} nodrag nopan`} onContextMenu={handleContextMenu}>
        <EditorContent editor={editor} className={`${styles.editorContent} nodrag nopan`} />
      </div>
      <NoteSelectionContextMenu
        menu={contextMenu}
        editor={editor}
        onClose={() => setContextMenu(null)}
        onAction={(action) => {
          if (action === 'changeTextColor') {
            setContextMenu(null)
            setColorDialogOpen(true)
          }
        }}
      />
      {colorDialogOpen && editor ? (
        <NoteFontColorDialog editor={editor} onClose={() => setColorDialogOpen(false)} />
      ) : null}
    </div>
  )
}
