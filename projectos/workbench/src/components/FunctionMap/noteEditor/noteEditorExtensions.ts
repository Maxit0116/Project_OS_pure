import { Mark, mergeAttributes } from '@tiptap/core'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'

export const NoteHighlight = Mark.create({
  name: 'noteHighlight',
  priority: 50,

  parseHTML() {
    return [{ tag: 'span[data-note-highlight]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-note-highlight': '',
        class: 'noteEditorHighlight',
      }),
      0,
    ]
  },
})

export function createNoteEditorExtensions() {
  return [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      code: false,
    }),
    TextStyle,
    Color,
    NoteHighlight,
  ]
}
