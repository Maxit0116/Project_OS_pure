import {
  emptyNoteDocument,
  migrateLegacyNotePayload,
  plainTextToNoteDocument,
  type NoteDocument,
  type NotePayload,
} from '@contracts/index'

export { emptyNoteDocument, plainTextToNoteDocument }

export function resolveNoteDocument(note: NotePayload): NoteDocument {
  const migrated = migrateLegacyNotePayload(note) as NotePayload
  if (migrated.document) {
    return migrated.document
  }
  if (migrated.body != null) {
    return plainTextToNoteDocument(migrated.body)
  }
  return emptyNoteDocument()
}

export function buildNotePayloadPatch(
  _note: NotePayload,
  document: NoteDocument,
): Pick<NotePayload, 'document'> {
  return { document }
}
