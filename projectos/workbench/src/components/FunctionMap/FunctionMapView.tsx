import { useEffect } from 'react'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useFunctionMap } from './FunctionMapContext'
import FunctionMapCanvas from './FunctionMapCanvas'
import FunctionMapNodePreview from './FunctionMapNodePreview'
import LiveGraphFocusChip from './LiveGraphFocusChip'
import LiveGraphUnmappedRail from './LiveGraphUnmappedRail'
import StructureScanProgressCard from './StructureScanProgressCard'
import styles from './FunctionMap.module.css'

interface Props {
  bleed?: boolean
}

export default function FunctionMapView({ bleed = false }: Props) {
  const { mapSurfaceRef, syncChromeInsetCssVars, chromeInsets } = useFunctionMap()
  const structureScanProgress = useWorkbenchStore((s) => s.structureScanProgress)

  const showScanCard =
    !!structureScanProgress &&
    (structureScanProgress.status === 'running' ||
      structureScanProgress.status === 'failed' ||
      structureScanProgress.status === 'success' ||
      structureScanProgress.status === 'cancelled')

  useEffect(() => {
    syncChromeInsetCssVars()
  }, [syncChromeInsetCssVars, chromeInsets, showScanCard])

  return (
    <div ref={mapSurfaceRef} className={styles.mapViewHost} data-canvas="interactive">
      <FunctionMapCanvas bleed={bleed} />
      <FunctionMapNodePreview />
      <LiveGraphFocusChip />
      <LiveGraphUnmappedRail />
      {showScanCard && structureScanProgress ? (
        <StructureScanProgressCard progress={structureScanProgress} />
      ) : null}
    </div>
  )
}
