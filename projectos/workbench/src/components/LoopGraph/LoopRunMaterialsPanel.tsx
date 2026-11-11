import { useEffect, useState } from 'react'
import type { LoopTaskMaterial } from '@contracts/index'
import { classifyLoopMaterialFormat } from '@contracts/loop-task-material-formats'
import { evaluateImageMaterialCapability } from '@contracts/loop-material-vision-preflight'
import { parseAndSelectCsv } from '@contracts/loop-material-csv'
import { normalizeModelProfile } from '@contracts/settings'
import { useI18n } from '../../i18n'
import { useLoopGraphStore } from '../../state/loopGraphStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { getEditorSelection } from '../CodeEditor/editorSelection'
import LoopMaterialImagePreview from './LoopMaterialImagePreview'
import styles from './LoopRunMaterialsPanel.module.css'

function newMaterialId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function materialLabel(
  ts: (key: string, params?: Record<string, string | number>) => string,
  prefix: string,
  code: string | null | undefined,
  fallback?: string,
): string {
  if (!code) return fallback ?? ''
  const key = `chat.loopGraph.${prefix}_${code}`
  const labeled = ts(key)
  return labeled === key ? (fallback ?? code) : labeled
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
  const addPw7ContextMaterial = useLoopGraphStore((s) => s.addPw7ContextMaterial)
  const acknowledgeMaterialRereview = useLoopGraphStore(
    (s) => s.acknowledgeMaterialRereview,
  )
  const materialRereview = useLoopGraphStore(
    (s) => s.document?.taskPack?.materialRereview ?? null,
  )
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
  const [diagnosticsId, setDiagnosticsId] = useState<string | null>(null)
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
  /** Ephemeral XLSX bytes for sheet/range re-ingest — never written into Intent. */
  const [xlsxBytesById, setXlsxBytesById] = useState<
    Record<string, { fileName: string; mimeType: string; bytesBase64: string }>
  >({})
  const [pw7Kind, setPw7Kind] = useState<
    'issue' | 'pull_request' | 'code_selection' | 'error_context'
  >('issue')
  const [pw7Title, setPw7Title] = useState('')
  const [pw7Body, setPw7Body] = useState('')
  const [pw7Ref, setPw7Ref] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)

  useEffect(() => {
    return () => {
      for (const url of Object.values(imageObjectUrls)) {
        URL.revokeObjectURL(url)
      }
    }
  }, [imageObjectUrls])

  const reingestXlsx = async (
    materialId: string,
    selection: { sheet: string; cellRange: string },
  ) => {
    const held = xlsxBytesById[materialId]
    const { client, project } = useWorkbenchStore.getState()
    if (!held || !client || !project || typeof client.ingestLoopTaskMaterial !== 'function') {
      return
    }
    setFileError(null)
    const result = await client.ingestLoopTaskMaterial(project.projectId, {
      fileName: held.fileName,
      mimeType: held.mimeType,
      bytesBase64: held.bytesBase64,
      materialId,
      xlsxSelection: {
        sheet: selection.sheet,
        cellRange: selection.cellRange,
      },
    })
    if (result.material) {
      replaceRunMaterial(materialId, { ...result.material, id: materialId })
      setExpandedId(materialId)
    }
    if (!result.ok) {
      setFileError(result.error ?? 'XLSX re-ingest failed')
    }
  }

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
          'CSV loaded — choose columns/rows for this run snapshot',
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
    if (format.formatId === 'xlsx' || format.formatId === 'pdf') {
      const { client, project } = useWorkbenchStore.getState()
      if (!client || !project || typeof client.ingestLoopTaskMaterial !== 'function') {
        const msg =
          'XLSX/PDF ingest requires Electron LocalApi host (unzip/pdftotext) — browser alone cannot parse'
        setFileError(msg)
        const blocked: LoopTaskMaterial = {
          id: replacingId ?? newMaterialId(`mat_${format.formatId}`),
          kind: format.formatId === 'xlsx' ? 'table' : 'file',
          purpose: format.formatId === 'xlsx' ? 'test_data' : 'requirement',
          title: file.name.slice(0, 240),
          source: 'upload',
          parseStatus: 'unsupported',
          parseLevel: 'unsupported',
          parseMessage: msg,
          mimeType: mime,
          sizeBytes: file.size,
          measuredSizeBytes: file.size,
          version: 1,
          runOverride: true,
          createdAt: now,
          updatedAt: now,
        }
        if (replacingId) {
          replaceRunMaterial(replacingId, blocked)
          setReplacingId(null)
        } else {
          addRunMaterial(blocked)
        }
        return
      }
      const buffer = await file.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buffer)
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      }
      const bytesBase64 = btoa(binary)
      const result = await client.ingestLoopTaskMaterial(project.projectId, {
        fileName: file.name,
        mimeType: mime,
        bytesBase64,
        ...(replacingId ? { materialId: replacingId } : {}),
        // First-batch default: first sheet A1:B50 so upload is structured_selection,
        // not text_preview-only. User can still refine via table controls later.
        ...(format.formatId === 'xlsx'
          ? { xlsxSelection: { cellRange: 'A1:B50' } }
          : {}),
        ...(format.formatId === 'pdf'
          ? { pdfSelection: { pageStart: 1, pageEnd: 1 } }
          : {}),
      })
      if (result.material) {
        if (format.formatId === 'xlsx') {
          setXlsxBytesById((prev) => ({
            ...prev,
            [result.material!.id]: {
              fileName: file.name,
              mimeType: mime,
              bytesBase64,
            },
          }))
        }
        if (replacingId) {
          replaceRunMaterial(replacingId, { ...result.material, id: replacingId })
          setReplacingId(null)
        } else {
          addRunMaterial(result.material)
        }
      }
      if (!result.ok) {
        setFileError(result.error ?? 'ingest failed')
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
          ? 'Selected columns/rows applied to this run snapshot'
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
  const rereviewBlocks =
    Boolean(materialRereview?.requiresRereview) &&
    !materialRereview?.acknowledgedAt
  const canStart = preflight?.canStart === true && !rereviewBlocks

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

      {materialRereview?.requiresRereview && !materialRereview.acknowledgedAt ? (
        <div data-loop-material-rereview="" role="status">
          <p className={styles.fileError}>{ts('chat.loopGraph.materialsRereviewTitle')}</p>
          <p className={styles.hint}>{ts('chat.loopGraph.materialsRereviewBody')}</p>
          {(materialRereview.staleEvidenceIds?.length ?? 0) > 0 ? (
            <p className={styles.hint} data-loop-material-rereview-evidence="">
              {ts('chat.loopGraph.materialsRereviewStale', {
                ids: (materialRereview.staleEvidenceIds ?? []).join(', '),
              })}
            </p>
          ) : null}
          <details className={styles.diagnostics}>
            <summary>{ts('chat.loopGraph.materialsShowDiagnostics')}</summary>
            <p className={styles.meta} data-loop-material-rereview-reason="">
              {ts('chat.loopGraph.materialsDiagnosticsCode')}: TM-8
              {materialRereview.reason ? ` — ${materialRereview.reason}` : ''}
            </p>
          </details>
          <button
            type="button"
            className={styles.secondary}
            data-loop-material-rereview-ack=""
            onClick={() => acknowledgeMaterialRereview()}
          >
            {ts('chat.loopGraph.materialsRereviewAck')}
          </button>
        </div>
      ) : null}

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
                  <span className={styles.rowKind}>
                    {materialLabel(ts, 'materialsKind', material.kind, material.kind)}
                  </span>
                  <span className={styles.rowTitle}>{material.title}</span>
                  <span className={styles.rowStatus}>
                    {materialLabel(
                      ts,
                      'materialsParseStatus',
                      material.parseStatus,
                      material.parseStatus,
                    )}
                  </span>
                </div>
                {material.parseLevel ? (
                  <p
                    className={styles.parseMsg}
                    data-loop-material-parse-level={material.parseLevel}
                  >
                    {materialLabel(
                      ts,
                      'materialsParseLevel',
                      material.parseLevel,
                      material.parseLevel,
                    )}
                  </p>
                ) : null}
                {material.parseMessage &&
                !/^(structured_selection|vision_|text_preview|ssrf_|Image bytes will attach)/i.test(
                  material.parseMessage,
                ) ? (
                  <p className={styles.parseMsg}>{material.parseMessage}</p>
                ) : null}
                {material.kind === 'image' ||
                (material.mimeType ?? '').startsWith('image/') ? (
                  <LoopMaterialImagePreview
                    material={material}
                    objectUrl={imageObjectUrls[material.id] ?? null}
                    visionGate={imageVisionGates[material.id] ?? null}
                    visionLabel={materialLabel(
                      ts,
                      'materialsVisionGate',
                      imageVisionGates[material.id] ?? material.parseLevel ?? null,
                      undefined,
                    )}
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
                      <span>{ts('chat.loopGraph.materialsCsvColumns')}</span>
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
                      <span>{ts('chat.loopGraph.materialsCsvRows')}</span>
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
                {material.kind === 'table' &&
                (material.title.toLowerCase().endsWith('.xlsx') ||
                  material.mimeType?.includes('spreadsheet')) &&
                xlsxBytesById[material.id] ? (
                  <div
                    className={styles.csvControls}
                    data-loop-material-xlsx-controls=""
                  >
                    <label className={styles.field}>
                      <span>{ts('chat.loopGraph.materialsXlsxSheet')}</span>
                      <input
                        type="text"
                        defaultValue={material.tablePreview?.sheet ?? 'Data'}
                        data-loop-material-xlsx-sheet=""
                        onBlur={(event) => {
                          const sheet = event.target.value.trim() || 'Data'
                          const range =
                            material.tablePreview?.rowRange ?? 'A1:B50'
                          void reingestXlsx(material.id, {
                            sheet,
                            cellRange: range,
                          })
                        }}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>{ts('chat.loopGraph.materialsXlsxRange')}</span>
                      <input
                        type="text"
                        defaultValue={
                          material.tablePreview?.rowRange ?? 'A1:B50'
                        }
                        data-loop-material-xlsx-range=""
                        onBlur={(event) => {
                          const cellRange =
                            event.target.value.trim() || 'A1:B50'
                          void reingestXlsx(material.id, {
                            sheet: material.tablePreview?.sheet ?? 'Data',
                            cellRange,
                          })
                        }}
                      />
                    </label>
                  </div>
                ) : null}
                {expandedId === material.id &&
                (material.textPreview ||
                  (material.tablePreview?.columns?.length ?? 0) > 0) ? (
                  <pre
                    className={styles.preview}
                    data-loop-material-preview=""
                    data-loop-material-preview-expanded=""
                    data-loop-material-preview-body=""
                  >
                    {material.textPreview
                      ? material.textPreview
                      : [
                          material.tablePreview?.sheet
                            ? `sheet=${material.tablePreview.sheet}`
                            : null,
                          material.tablePreview?.rowRange
                            ? `range=${material.tablePreview.rowRange}`
                            : null,
                          `columns=${(material.tablePreview?.columns ?? []).join(',')}`,
                        ]
                          .filter(Boolean)
                          .join('\n')}
                  </pre>
                ) : null}
                {diagnosticsId === material.id ? (
                  <details
                    className={styles.diagnostics}
                    open
                    data-loop-material-diagnostics=""
                  >
                    <summary>{ts('chat.loopGraph.materialsHideDiagnostics')}</summary>
                    <p className={styles.meta}>
                      {ts('chat.loopGraph.materialsDiagnosticsCode')}: kind=
                      {material.kind}
                      {material.parseLevel ? ` · parseLevel=${material.parseLevel}` : ''}
                      {material.parseStatus
                        ? ` · parseStatus=${material.parseStatus}`
                        : ''}
                      {imageVisionGates[material.id]
                        ? ` · vision=${imageVisionGates[material.id]}`
                        : ''}
                    </p>
                    {material.parseMessage ? (
                      <p className={styles.meta}>{material.parseMessage}</p>
                    ) : null}
                  </details>
                ) : null}
                <div className={styles.cardActions}>
                  {material.textPreview ||
                  (material.tablePreview?.columns?.length ?? 0) > 0 ? (
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
                    data-loop-material-diagnostics-toggle=""
                    onClick={() =>
                      setDiagnosticsId((id) =>
                        id === material.id ? null : material.id,
                      )
                    }
                  >
                    {diagnosticsId === material.id
                      ? ts('chat.loopGraph.materialsHideDiagnostics')
                      : ts('chat.loopGraph.materialsShowDiagnostics')}
                  </button>
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

      <section className={styles.section} data-loop-url-material="">
        <h4 className={styles.heading}>{ts('chat.loopGraph.materialsUrlTitle')}</h4>
        <p className={styles.hint}>{ts('chat.loopGraph.materialsUrlHint')}</p>
        <input
          type="url"
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          placeholder="https://…"
          data-loop-run-material-url=""
        />
        <button
          type="button"
          className={styles.secondary}
          data-loop-run-material-url-add=""
          disabled={urlBusy || !urlInput.trim()}
          onClick={() => {
            void (async () => {
              const { client, project } = useWorkbenchStore.getState()
              if (
                !client ||
                !project ||
                typeof client.ingestLoopUrlMaterial !== 'function'
              ) {
                setFileError(
                  'URL ingest requires Electron LocalApi host (DNS-pin fetch)',
                )
                return
              }
              setUrlBusy(true)
              setFileError(null)
              try {
                const result = await client.ingestLoopUrlMaterial(
                  project.projectId,
                  { url: urlInput.trim() },
                )
                if (result.material) {
                  if (replacingId) {
                    replaceRunMaterial(replacingId, {
                      ...result.material,
                      id: replacingId,
                    })
                    setReplacingId(null)
                  } else {
                    addRunMaterial(result.material)
                  }
                }
                if (!result.ok) {
                  setFileError(result.error ?? 'URL ingest failed')
                } else {
                  setUrlInput('')
                }
              } catch (error) {
                setFileError(
                  error instanceof Error ? error.message : 'URL ingest failed',
                )
              } finally {
                setUrlBusy(false)
              }
            })()
          }}
        >
          {urlBusy
            ? ts('chat.loopGraph.materialsUrlFetching')
            : ts('chat.loopGraph.materialsUrlAdd')}
        </button>
      </section>

      <section className={styles.section} data-loop-pw7-context="">
        <h4 className={styles.heading}>{ts('chat.loopGraph.materialsPw7Title')}</h4>
        <p className={styles.hint}>{ts('chat.loopGraph.materialsPw7Hint')}</p>
        <button
          type="button"
          className={styles.secondary}
          data-loop-pw7-from-editor=""
          onClick={() => {
            const selection = getEditorSelection()
            if (!selection) {
              // Dedicated PW-7 no-selection error (not generic preflight blocker).
              setFileError(ts('chat.loopGraph.materialsPw7NoSelection'))
              return
            }
            setFileError(null)
            addPw7ContextMaterial({
              kind: 'code_selection',
              title: `${selection.path}:${selection.startLine}-${selection.endLine}`,
              body: selection.text.slice(0, 8_000),
              ref: `${selection.path}:${selection.startLine}-${selection.endLine}`,
            })
          }}
        >
          {ts('chat.loopGraph.materialsPw7FromEditor')}
        </button>
        {fileError &&
        /无选区|no editor selection|PW-7/i.test(fileError) ? (
          <p
            className={styles.fileError}
            data-loop-pw7-no-selection=""
            data-loop-pw7-error=""
            role="alert"
          >
            {fileError}
          </p>
        ) : null}
        <select
          value={pw7Kind}
          onChange={(event) =>
            setPw7Kind(
              event.target.value as
                | 'issue'
                | 'pull_request'
                | 'code_selection'
                | 'error_context',
            )
          }
          data-loop-pw7-kind=""
        >
          <option value="issue">{ts('chat.loopGraph.materialsPw7Kind_issue')}</option>
          <option value="pull_request">
            {ts('chat.loopGraph.materialsPw7Kind_pull_request')}
          </option>
          <option value="code_selection">
            {ts('chat.loopGraph.materialsPw7Kind_code_selection')}
          </option>
          <option value="error_context">
            {ts('chat.loopGraph.materialsPw7Kind_error_context')}
          </option>
        </select>
        <input
          type="text"
          value={pw7Title}
          onChange={(event) => setPw7Title(event.target.value)}
          placeholder={ts('chat.loopGraph.materialsPw7TitlePh')}
          data-loop-pw7-title=""
        />
        <input
          type="text"
          value={pw7Ref}
          onChange={(event) => setPw7Ref(event.target.value)}
          placeholder={ts('chat.loopGraph.materialsPw7RefPh')}
          data-loop-pw7-ref=""
        />
        <textarea
          value={pw7Body}
          onChange={(event) => setPw7Body(event.target.value)}
          placeholder={ts('chat.loopGraph.materialsPw7BodyPh')}
          rows={2}
          data-loop-pw7-body=""
        />
        <button
          type="button"
          className={styles.secondary}
          data-loop-pw7-add=""
          onClick={() => {
            const title = pw7Title.trim()
            if (!title) return
            addPw7ContextMaterial({
              kind: pw7Kind,
              title,
              ...(pw7Body.trim() ? { body: pw7Body.trim() } : {}),
              ...(pw7Ref.trim() ? { ref: pw7Ref.trim() } : {}),
            })
            setPw7Title('')
            setPw7Body('')
            setPw7Ref('')
          }}
        >
          {ts('chat.loopGraph.materialsPw7Add')}
        </button>
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
