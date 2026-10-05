import { describe, expect, it } from 'vitest'

import { emptyNoteDocument, plainTextToNoteDocument, resolveNoteDocument } from './noteDocument'
import { selectionHasNoteHighlight, selectionHasTextColor } from './noteSelectionUtils'
import { createNoteEditorExtensions } from './noteEditorExtensions'
import { Editor } from '@tiptap/core'

describe('noteDocument', () => {
  it('resolves legacy body-only payloads to document', () => {
    const document = resolveNoteDocument({ body: 'Hello\nWorld' })
    expect(document).toEqual(plainTextToNoteDocument('Hello\nWorld'))
  })

  it('returns empty document for document-only payloads', () => {
    const document = resolveNoteDocument({ document: emptyNoteDocument() })
    expect(document).toEqual(emptyNoteDocument())
  })
})

describe('noteSelectionUtils', () => {
  it('detects text color and highlight marks in a selection', () => {
    const editor = new Editor({
      extensions: createNoteEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'plain ' },
              {
                type: 'text',
                text: 'colored',
                marks: [{ type: 'textStyle', attrs: { color: '#ff0000' } }],
              },
              { type: 'text', text: ' ' },
              {
                type: 'text',
                text: 'highlighted',
                marks: [{ type: 'noteHighlight' }],
              },
            ],
          },
        ],
      },
    })

    editor.commands.setTextSelection({ from: 7, to: 14 })
    expect(selectionHasTextColor(editor)).toBe(true)
    expect(selectionHasNoteHighlight(editor)).toBe(false)

    editor.commands.setTextSelection({ from: 15, to: 26 })
    expect(selectionHasTextColor(editor)).toBe(false)
    expect(selectionHasNoteHighlight(editor)).toBe(true)

    editor.destroy()
  })

  it('keeps text color when highlight is applied after color', () => {
    const editor = new Editor({
      extensions: createNoteEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'styled text' }],
          },
        ],
      },
    })

    editor.commands.setTextSelection({ from: 1, to: 12 })
    editor.commands.setColor('#ff0000')
    editor.commands.setMark('noteHighlight')

    const paragraph = editor.getJSON().content?.[0] as {
      content?: Array<{ text?: string; marks?: Array<{ type: string; attrs?: { color?: string } }> }>
    }
    const styledNode = paragraph.content?.[0]
    expect(styledNode?.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'textStyle', attrs: { color: '#ff0000' } }),
        expect.objectContaining({ type: 'noteHighlight' }),
      ]),
    )

    editor.destroy()
  })
})
