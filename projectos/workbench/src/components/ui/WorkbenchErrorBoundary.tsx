import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './WorkbenchErrorBoundary.module.css'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class WorkbenchErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WorkbenchErrorBoundary]', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <div className={styles.fallback} role="alert">
        <h1 className={styles.title}>Workbench hit a rendering error</h1>
        <p className={styles.message}>{this.state.error.message}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={this.handleRetry}>
            Try again
          </button>
          <button type="button" className={styles.btnPrimary} onClick={this.handleReload}>
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
