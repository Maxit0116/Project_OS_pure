import { useEffect } from 'react'
import { useFunctionMap } from './FunctionMapContext'
import FunctionMapCanvas from './FunctionMapCanvas'
import FunctionMapNodePreview from './FunctionMapNodePreview'
import styles from './FunctionMap.module.css'

interface Props {
  bleed?: boolean
}

export default function FunctionMapView({ bleed = false }: Props) {
  const { mapSurfaceRef, syncChromeInsetCssVars } = useFunctionMap()

  useEffect(() => {
    syncChromeInsetCssVars()
  }, [syncChromeInsetCssVars])

  return (
    <div ref={mapSurfaceRef} className={styles.mapViewHost} data-canvas="interactive">
      <FunctionMapCanvas bleed={bleed} />
      <FunctionMapNodePreview />
    </div>
  )
}
