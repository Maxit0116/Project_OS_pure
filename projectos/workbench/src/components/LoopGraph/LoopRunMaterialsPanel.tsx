import { useState } from 'react'
import type { LoopTaskMaterial } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useLoopGraphStore } from '../../state/loopGraphStore'
import styles from './LoopRunMaterialsPanel.module.css'

function newMaterialId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

const TEXT_LIKE = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
])

/**
 * First closed-loop materials + preflight UI for project manual runs.
 * Real input cards: preview / replace / error / persist via store (reopen with doc).
 */
export default function LoopRunMaterialsPanel() {
  const { ts } = useI18n()
  const materials = useLoopGraphStore((s) => s.runMaterials)
  const branch = useLoopGraphStore((s) => s.runBranch)
  const preflight = useLoopGraphStore((s) => s.preflightResult)
  const preflightBusy = useLoopGraphStore((s) => s.preflightBusy)
  const setRunBranch = useLoopGraphStore((s) => s.setRunBranch)
  const addRunMaterial = useLoopGraphStore((s) => s.addRunMaterial)
  const replaceRunMaterial = useLoopGraphStore((s) => s.replaceRunMaterial)
  const removeRunMaterial = useLoopGraphStore((s) => s.removeRunMaterial)
  const runPreflight = useLoopGraphStore((s) => s.runPreflight)
  const startRun = useLoopGraphStore((s) => s.startRun)

  const [textTitle, setTextTitle] = useState('')
  const [textBody, setTextBody] = useState('')
  const [refPath, setRefPath] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replacingId, setReplacingId] = useState<string | null>(null)

  const addText = () => {
    const title = textTitle.trim() || textBody.trim().slice(0, 80) || 'Task text'
    const body = textBody.trim()
    if (!body) return
    const now = new Date().toISOString()
    const material: LoopTaskMaterial = {
      id: newMaterialId('mat_text'),
      kind: 'text',
      purpose: 'requirement',
      title: title.slice(0, 240),
      source: 'composer_text',
      parseStatus: 'ok',
      textPreview: body.slice(0, 8_000),
      version: 1,
      runOverride: true,
      createdAt: now,
      updatedAt: now,
    }
    if (replacingId) {
      replaceRunMaterial(replacingId, { ...material, id: replacingId })
      setReplacingId(null)
    } else {
      addRunMaterial(material)
    }
    setTextTitle('')
    setTextBody('')
  }

  const addProjectRef = () => {
    const path = refPath.trim()
    if (!path) return
    const now = new Date().toISOString()
    const material: LoopTaskMaterial = {
      id: newMaterialId('mat_ref'),
      kind: 'project_ref',
      purpose: 'code_context',
      title: path.slice(0, 240),
      source: 'project_ref',
      parseStatus: 'ok',
      parseMessage: 'path recorded; bytes resolved at run bind',
      projectRef: { path, kind: path.endsWith('/') ? 'dir' : 'file' },
      version: 1,
      runOverride: true,
      createdAt: now,
      updatedAt: now,
    }
    if (replacingId) {
      replaceRunMaterial(replacingId, { ...material, id: replacingId })
      setReplacingId(null)
    } else {
      addRunMaterial(material)
    }
    setRefPath('')
  }

  const onFileSelected = async (fileList: FileList | null) => {
    setFileError(null)
    const file = fileList?.[0]
    if (!file) return
    const now = new Date().toISOString()
    const mime = file.type || 'application/octet-stream'
    const isTextLike =
      TEXT_LIKE.has(mime) ||
      /\.(txt|md|json|csv|log)$/i.test(file.name)
    if (!isTextLike) {
      const unsupported: LoopTaskMaterial = {
        id: replacingId ?? newMaterialId('mat_file'),
        kind: 'file',
        purpose: 'other',
        title: file.name.slice(0, 240),
        source: 'upload',
        parseStatus: 'unsupported',
        parseMessage: `First-batch materials only preview plaintext; “${mime || file.name}” deferred`,
        mimeType: mime,
        sizeBytes: file.size,
        measuredSizeBytes: file.size,
        version: 1,
        runOverride: true,
        createdAt: now,
        updatedAt: now,
      }
      if (replacingId) {
        replaceRunMaterial(replacingId, unsupported)
        setReplacingId(null)
      } else {
        addRunMaterial(unsupported)
      }
      setFileError(unsupported.parseMessage ?? 'unsupported')
      return
    }
    try {
      const text = await file.text()
      const material: LoopTaskMaterial = {
        id: replacingId ?? newMaterialId('mat_file'),
        kind: 'file',
        purpose: 'other',
        title: file.name.slice(0, 240),
        source: 'upload',
        parseStatus: 'ok',
        parseMessage: 'plaintext preview available',
        textPreview: text.slice(0, 8_000),
        mimeType: mime || 'text/plain',
        sizeBytes: file.size,
        measuredSizeBytes: file.size,
        contentRef: `upload://${file.name}`,
        version: 1,
        runOverride: true,
        createdAt: now,
        updatedAt: now,
      }
      if (replacingId) {
        replaceRunMaterial(replacingId, material)
        setReplacingId(null)
      } else {
        addRunMaterial(material)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to read file'
      setFileError(message)
      const failed: LoopTaskMaterial = {
        id: replacingId ?? newMaterialId('mat_file'),
        kind: 'file',
        purpose: 'other',
        title: file.name.slice(0, 240),
        source: 'upload',
        parseStatus: 'failed',
        parseMessage: message.slice(0, 500),
        mimeType: mime,
        sizeBytes: file.size,
        measuredSizeBytes: file.size,
        version: 1,
        runOverride: true,
        createdAt: now,
        updatedAt: now,
      }
      if (replacingId) {
        replaceRunMaterial(replacingId, failed)
        setReplacingId(null)
      } else {
        addRunMaterial(failed)
      }
    }
  }

  const blockers = preflight?.items.filter((item) => item.severity === 'blocker') ?? []
  const canStart = preflight?.canStart === true

  return (
    <div className={styles.panel} data-loop-run-materials="">
      <header className={styles.header}>
        <h3 className={styles.title}>{ts('chat.loopGraph.materialsTitle')}</h3>
        <p className={styles.hint}>{ts('chat.loopGraph.materialsHint')}</p>
        {replacingId ? (
          <p className={styles.replaceHint} data-loop-material-replacing="">
            {ts('chat.loopGraph.materialsReplacing')}
            <button
              type="button"
              className={styles.linkish}
              onClick={() => setReplacingId(null)}
            >
              {ts('chat.loopGraph.materialsCancelReplace')}
            </button>
          </p>
        ) : null}
      </header>

      <label className={styles.field}>
        <span>{ts('chat.loopGraph.materialsBranch')}</span>
        <input
          type="text"
          value={branch}
          onChange={(event) => setRunBranch(event.target.value)}
          placeholder="main"
          data-loop-run-branch=""
        />
      </label>

      <section className={styles.section}>
        <h4 className={styles.heading}>{ts('chat.loopGraph.materialsAddText')}</h4>
        <input
          type="text"
          value={textTitle}
          onChange={(event) => setTextTitle(event.target.value)}
          placeholder={ts('chat.loopGraph.materialsTextTitle')}
        />
        <textarea
          value={textBody}
          onChange={(event) => setTextBody(event.target.value)}
          placeholder={ts('chat.loopGraph.materialsTextBody')}
          rows={3}
          data-loop-run-material-text=""
        />
        <button type="button" className={styles.secondary} onClick={addText}>
          {replacingId
            ? ts('chat.loopGraph.materialsReplaceWithText')
            : ts('chat.loopGraph.materialsAddText')}
        </button>
      </section>

      <section className={styles.section}>
        <h4 className={styles.heading}>{ts('chat.loopGraph.materialsAddRef')}</h4>
        <input
          type="text"
          value={refPath}
          onChange={(event) => setRefPath(event.target.value)}
          placeholder="src/…"
          data-loop-run-material-ref=""
        />
        <button type="button" className={styles.secondary} onClick={addProjectRef}>
          {replacingId
            ? ts('chat.loopGraph.materialsReplaceWithRef')
            : ts('chat.loopGraph.materialsAddRef')}
        </button>
      </section>

      <section className={styles.section}>
        <h4 className={styles.heading}>{ts('chat.loopGraph.materialsAddFile')}</h4>
        <input
          type="file"
          data-loop-run-material-file=""
          onChange={(event) => {
            void onFileSelected(event.target.files)
            event.target.value = ''
          }}
        />
        {fileError ? (
          <p className={styles.fileError} data-loop-material-file-error="" role="alert">
            {fileError}
          </p>
        ) : (
          <p className={styles.hint}>{ts('chat.loopGraph.materialsFileHint')}</p>
        )}
      </section>

      <section className={styles.section}>
        <h4 className={styles.heading}>{ts('chat.loopGraph.materialsList')}</h4>
        {materials.length === 0 ? (
          <p className={styles.empty}>{ts('chat.loopGraph.materialsEmpty')}</p>
        ) : (
          <ul className={styles.list}>
            {materials.map((material) => (
              <li
                key={material.id}
                className={styles.card}
                data-loop-material-card=""
                data-loop-material-id={material.id}
                data-loop-material-status={material.parseStatus}
              >
                <div className={styles.rowMain}>
                  <span className={styles.rowKind}>{material.kind}</span>
                  <span className={styles.rowTitle}>{material.title}</span>
                  <span className={styles.rowStatus}>{material.parseStatus}</span>
                </div>
                {material.parseMessage ? (
                  <p className={styles.parseMsg}>{material.parseMessage}</p>
                ) : null}
                {expandedId === material.id && material.textPreview ? (
                  <pre
                    className={styles.preview}
                    data-loop-material-preview=""
                  >
                    {material.textPreview}
                  </pre>
                ) : null}
                <div className={styles.cardActions}>
                  {material.textPreview ? (
                    <button
                      type="button"
                      className={styles.linkish}
                      data-loop-material-preview-toggle=""
                      onClick={() =>
                        setExpandedId((id) =>
                          id === material.id ? null : material.id,
                        )
                      }
                    >
                      {expandedId === material.id
                        ? ts('chat.loopGraph.materialsHidePreview')
                        : ts('chat.loopGraph.materialsShowPreview')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.linkish}
                    data-loop-material-replace=""
                    onClick={() => setReplacingId(material.id)}
                  >
                    {ts('chat.loopGraph.materialsReplace')}
                  </button>
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => removeRunMaterial(material.id)}
                    aria-label={ts('chat.loopGraph.materialsRemove')}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          disabled={preflightBusy}
          onClick={() => void runPreflight()}
          data-loop-run-preflight=""
        >
          {preflightBusy
            ? ts('chat.loopGraph.materialsPreflightBusy')
            : ts('chat.loopGraph.materialsPreflight')}
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={!canStart || preflightBusy}
          onClick={() => void startRun()}
          data-loop-run-start-confirmed=""
          title={
            canStart
              ? ts('chat.loopGraph.start')
              : ts('chat.loopGraph.materialsStartBlocked')
          }
        >
          {ts('chat.loopGraph.start')}
        </button>
      </div>

      {preflight ? (
        <section className={styles.section} data-loop-preflight-result="">
          <h4 className={styles.heading}>{ts('chat.loopGraph.materialsPreflightResult')}</h4>
          <p className={styles.meta}>
            {canStart
              ? ts('chat.loopGraph.materialsCanStart')
              : ts('chat.loopGraph.materialsCannotStart', {
                  count: String(blockers.length),
                })}
          </p>
          <ul className={styles.list}>
            {preflight.items.map((item) => (
              <li
                key={item.id}
                className={`${styles.checkRow} ${styles[`sev_${item.severity}`] ?? ''}`}
              >
                <span className={styles.sev}>{item.severity}</span>
                <span className={styles.checkMsg}>{item.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className={styles.empty}>{ts('chat.loopGraph.materialsPreflightHint')}</p>
      )}
    </div>
  )
}
