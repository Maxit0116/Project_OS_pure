import type { AgentConversationScope } from '@contracts/index'
import type { LatestAskTrace } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import RestrictedMarkdown from '../ChatPanel/RestrictedMarkdown'
import AgentActivityIndicator from '../ui/AgentActivityIndicator'
import styles from './AskTraceView.module.css'

export default function AskTraceView({ trace }: { trace: LatestAskTrace }) {
  const { ts } = useI18n()

  if (trace.status === 'running') {
    return (
      <div className={styles.trace}>
        <ScopeSummary scope={trace.scope} />
        <AgentActivityIndicator
          variant="pill"
          state="searching"
          label={ts('agentFlow.askRunning')}
        />
      </div>
    )
  }

  if (trace.status === 'error') {
    return (
      <div className={styles.trace}>
        <ScopeSummary scope={trace.scope} />
        <section className={`${styles.card} ${styles.error}`} role="alert">
          <h3>{ts('agentFlow.askErrorTitle')}</h3>
          <p>{trace.message}</p>
        </section>
      </div>
    )
  }

  const { answer } = trace.result
  return (
    <div className={styles.trace}>
      <section className={styles.card} data-ask-trace="answer">
        <h3>{ts('agentFlow.askAnswerTitle')}</h3>
        <ScopeSummary scope={trace.scope} />
        <RestrictedMarkdown>{answer}</RestrictedMarkdown>
        {trace.result.responseLanguage.validation === 'mismatch_after_retry' && (
          <p className={styles.languageNotice} data-ask-trace="language-notice">
            {ts('chat.askLanguageMismatchNotice')}
          </p>
        )}
      </section>
    </div>
  )
}

function ScopeSummary({ scope }: { scope: AgentConversationScope }) {
  const { ts } = useI18n()
  if (scope.kind === 'global') {
    return (
      <dl className={styles.scope}>
        <div>
          <dt>{ts('context.globalAgentScope')}</dt>
          <dd>{ts('context.scopeGlobal')}</dd>
        </div>
      </dl>
    )
  }
  return (
    <dl className={styles.scope}>
      <div>
        <dt>{ts('context.scopeNode')}</dt>
        <dd><code>{scope.nodeId}</code></dd>
      </div>
      {scope.kind === 'file' && (
        <div>
          <dt>{ts('context.scopeFile')}</dt>
          <dd><code>{scope.selectedFilePath}</code></dd>
        </div>
      )}
    </dl>
  )
}
