import { createRoot } from 'react-dom/client'
import { OverlayApp } from './OverlayApp'
import '../styles/tokens.css'
import './overlay.css'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<OverlayApp />)
}
