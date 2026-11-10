import { useEffect, useState } from 'react'
import type { LoopTaskMaterial } from '@contracts/index'
import { classifyLoopMaterialFormat } from '@contracts/loop-task-material-formats'
import { evaluateImageMaterialCapability } from '@contracts/loop-material-vision-preflight'
import { parseAndSelectCsv } from '@contracts/loop-material-csv'
import { normalizeModelProfile } from '@contracts/settings'
import { useI18n } from '../../i18n'
import { useLoopGraphStore } from '../../state/loopGraphStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import LoopMaterialImagePreview from './LoopMaterialImagePreview'
import styles from './LoopRunMaterialsPanel.module.css'

function newMaterialId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

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
  const settings = useWorkbenchStore((s) => s.settings)
  const selectedModelProfileId = useWorkbenchStore((s) => s.selectedModelProfileId)
  const activeProfile =
    settings?.modelProfiles.find((p) => p.id === selectedModelProfileId) ??
    settings?.modelProfiles.find((p) => p.isDefault) ??
    settings?.modelProfiles[0] ??
    null
  const activeApiFormat = activeProfile
    ? normalizeModelProfile(activeProfile).apiFormat
    : null

  const [textTitle, setTextTitle] = useState('')
  const [textBody, setTextBody] = useState('')
  const [refPath, setRefPath] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replacingId, setReplacingId] = useState<string | null>(null)
  /** Ephemeral local thumbs — never written into document.taskPack / Intent. */
  const [imageObjectUrls, setImageObjectUrls] = useState<Record<string, string>>(
    {},
  )
  const [imageVisionGates, setImageVisionGates] = useState<
    Record<string, string>
  >({})
  /** Raw CSV text keyed by material id — selection reshapes textPreview in pack. */
  const [csvRawById, setCsvRawById] = useState<Record<string, string>>({})

  useEffect(() => {
    return () => {
      for (const url of Object.values(imageObjectUrls)) {
        URL.revokeObjectURL(url)
      }
    }
  }, [imageObjectUrls])

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
      parseLevel: 'text_preview',
      parseMessage: 'text_preview only — full_text_parse not implemented',
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
      parseLevel: 'text_preview',
      parseMessage: 'path recorded; bytes resolved at run bind (text_preview path only)',
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
    const format = classifyLoopMaterialFormat({
      mimeType: mime,
      fileName: file.name,
    })
    if (format.formatId === 'image') {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      const mimeOk =
        mime === 'image/png' || mime === 'image/jpeg'
          ? mime
          : /\.png$/i.test(file.name)
            ? 'image/png'
            : /\.jpe?g$/i.test(file.name)
              ? 'image/jpeg'
              : mime
      let base64 = ''
      {
        let binary = ''
        const chunk = 0x8000
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
        }
        base64 = btoa(binary)
      }
      const hasBytes = base64.length > 0
      const contentRef =
        hasBytes && (mimeOk === 'image/png' || mimeOk === 'image/jpeg')
          ? `data:${mimeOk};base64,${base64}`
          : undefined
      const vision = evaluateImageMaterialCapability({
        mimeType: mimeOk,
        fileName: file.name,
        sizeBytes: file.size,
        apiFormat: activeApiFormat,
        hasBytes: Boolean(contentRef),
      })
      const materialId = replacingId ?? newMaterialId('mat_image')
      const wired = vision.parseLevel === 'vision_attach'
      const imageMaterial: LoopTaskMaterial = {
        id: materialId,
        kind: 'image',
        purpose: 'error_screenshot',
        title: file.name.slice(0, 240),
        source: 'upload',
        parseStatus: wired ? 'ok' : 'unsupported',
        parseLevel: vision.parseLevel,
        parseMessage: vision.reason,
        mimeType: mimeOk,
        sizeBytes: file.size,
        measuredSizeBytes: file.size,
        ...(contentRef ? { contentRef } : {}),
        version: 1,
        runOverride: true,
        createdAt: now,
        updatedAt: now,
      }
      const objectUrl = URL.createObjectURL(file)
      setImageObjectUrls((prev) => {
        const prior = prev[materialId]
        if (prior) URL.revokeObjectURL(prior)
        return { ...prev, [materialId]: objectUrl }
      })
      setImageVisionGates((prev) => ({
        ...prev,
        [materialId]: vision.visionGate,
      }))
      if (replacingId) {
        replaceRunMaterial(replacingId, imageMaterial)
        setReplacingId(null)
      } else {
        addRunMaterial(imageMaterial)
      }
      if (!wired) setFileError(imageMaterial.parseMessage ?? 'unsupported')
      return
    }
    if (format.formatId === 'csv') {
      const text = await file.text()
      const parsed = parseAndSelectCsv(text)
      const materialId = replacingId ?? newMaterialId('mat_csv')
      if (!parsed.ok) {
        const failed: LoopTaskMaterial = {
          id: materialId,
          kind: 'table',
          purpose: 'test_data',
          title: file.name.slice(0, 240),
          source: 'upload',
          parseStatus: 'failed',
          parseLevel: 'unsupported',
          parseMessage: parsed.error.slice(0, 500),
          mimeType: mime || 'text/csv',
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
        setFileError(parsed.error)
        return
      }
      setCsvRawById((prev) => ({ ...prev, [materialId]: text }))
      const material: LoopTaskMaterial = {
        id: materialId,
        kind: 'table',
        purpose: 'test_data',
        title: file.name.slice(0, 240),
        source: 'upload',
        parseStatus: 'ok',
        parseLevel: parsed.parseLevel,
        parseMessage:
          'CSV loaded — choose columns/rows to apply structured_selection into run snapshot',
        textPreview: parsed.textPreview,
        tablePreview: {
          columns: parsed.table.headers,
          rowStart: 1,
          rowEnd: Math.max(1, parsed.table.rows.length),
        },
        mimeType: mime || 'text/csv',
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
      return
    }
    if (format.parseLevel === 'unsupported') {
      const unsupported: LoopTaskMaterial = {
        id: replacingId ?? newMaterialId('mat_file'),
        kind: 'file',
        purpose: 'other',
        title: file.name.slice(0, 240),
        source: 'upload',
        parseStatus: 'unsupported',
        parseLevel: 'unsupported',
        parseMessage: format.reason,
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
        parseLevel: 'text_preview',
        parseMessage: format.reason,
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

  const applyCsvStructure = (
    materialId: string,
    patch: {
      columns?: string[]
      rowStart?: number
      rowEnd?: number
      role?: 'requirement' | 'test' | 'business'
    },
  ) => {
    const raw = csvRawById[materialId]
    const current = materials.find((item) => item.id === materialId)
    if (!raw || !current) return
    const selection = {
      columns: patch.columns ?? current.tablePreview?.columns,
      rowStart: patch.rowStart ?? current.tablePreview?.rowStart,
      rowEnd: patch.rowEnd ?? current.tablePreview?.rowEnd,
      role: patch.role ?? current.tablePreview?.role,
    }
    const parsed = parseAndSelectCsv(raw, selection)
    if (!parsed.ok) {
      setFileError(parsed.error)
      return
    }
    replaceRunMaterial(materialId, {
      ...current,
      parseStatus: 'ok',
      parseLevel: parsed.parseLevel,
      parseMessage:
        parsed.parseLevel === 'structured_selection'
          ? 'structured_selection applied — textPreview/run snapshot use selected columns/rows'
          : current.parseMessage,
      textPreview: parsed.textPreview,
      tablePreview: {
        columns: selection.columns,
        rowStart: selection.rowStart,
        rowEnd: selection.rowEnd,
        rowRange:
          selection.rowStart != null && selection.rowEnd != null
            ? `${selection.rowStart}-${selection.rowEnd}`
            : undefined,
        role: selection.role,
      },
      updatedAt: new Date().toISOString(),
    })
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
                {material.parseLevel ? (
                  <p
                    className={styles.parseMsg}
                    data-loop-material-parse-level={material.parseLevel}
                  >
                    level: {material.parseLevel}
                  </p>
                ) : null}
                {material.parseMessage ? (
                  <p className={styles.parseMsg}>{material.parseMessage}</p>
                ) : null}
                {material.kind === 'image' ||
                (material.mimeType ?? '').startsWith('image/') ? (
                  <LoopMaterialImagePreview
                    material={material}
                    objectUrl={imageObjectUrls[material.id] ?? null}
                    visionGate={imageVisionGates[material.id] ?? null}
                  />
                ) : null}
                {material.kind === 'table' &&
                (material.mimeType === 'text/csv' ||
                  material.title.toLowerCase().endsWith('.csv')) &&
                csvRawById[material.id] ? (
                  <div
                    className={styles.csvControls}
                    data-loop-material-csv-controls=""
                  >
                    <label className={styles.field}>
                      <span>columns (comma)</span>
                      <input
                        type="text"
                        defaultValue={(material.tablePreview?.columns ?? []).join(
                          ',',
                        )}
                        data-loop-material-csv-columns=""
                        onBlur={(event) => {
                          const columns = event.target.value
                            .split(',')
                            .map((part) => part.trim())
                            .filter(Boolean)
                          applyCsvStructure(material.id, { columns })
                        }}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>rows</span>
                      <input
                        type="text"
                        defaultValue={`${material.tablePreview?.rowStart ?? 1}-${material.tablePreview?.rowEnd ?? 1}`}
                        data-loop-material-csv-rows=""
                        onBlur={(event) => {
                          const match = /^(\d+)\s*-\s*(\d+)$/.exec(
                            event.target.value.trim(),
                          )
                          if (!match) return
                          applyCsvStructure(material.id, {
                            rowStart: Number(match[1]),
                            rowEnd: Number(match[2]),
                          })
                        }}
                      />
                    </label>
                  </div>
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
