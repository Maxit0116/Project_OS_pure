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

  const { contextSummary, reasoning, answer } = trace.result
  return (
    <div className={styles.trace}>
      <section className={styles.card} data-ask-trace="context">
        <h3>{ts('agentFlow.askContextTitle')}</h3>
        <ScopeSummary scope={trace.scope} />
        <p className={styles.contextMeta}>
          {ts('agentFlow.askContextMeta', {
            count: contextSummary.files.length,
            synopsis: contextSummary.synopsisPresent
              ? ts('agentFlow.synopsisIncluded')
              : ts('agentFlow.synopsisMissing'),
          })}
        </p>
        <code className={styles.bundleHash}>{contextSummary.bundleHash}</code>
        <ul className={styles.files}>
          {contextSummary.files.map((file) => (
            <li key={file.path}>
              <code>{file.path}</code>
              <span>
                {ts('agentFlow.askContextFile', {
                  disposition: ts(`agentFlow.askDisposition.${file.disposition}`),
                  included: file.includedByteLength ?? 0,
                  total: file.byteLength ?? 0,
                })}
                {file.omissionReason ? ` · ${file.omissionReason}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {reasoning && (
        <details className={styles.card} data-ask-trace="reasoning">
          <summary>{ts('agentFlow.askReasoningTitle')}</summary>
          {reasoning.truncated && (
            <p className={styles.truncated}>{ts('agentFlow.askReasoningTruncated')}</p>
          )}
          <RestrictedMarkdown>{reasoning.content}</RestrictedMarkdown>
        </details>
      )}

      <section className={styles.card} data-ask-trace="answer">
        <h3>{ts('agentFlow.askAnswerTitle')}</h3>
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
