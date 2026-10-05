import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import type { AgentAnswerResult } from '@contracts/index'
import { useWorkbenchStore } from '../../state/workbenchStore'
import AskTraceView from './AskTraceView'

function answerResult(reasoning = true): AgentAnswerResult {
  return {
    id: 'answer-1',
    projectId: 'sample-graph-saas',
    scope: { kind: 'file', nodeId: 'feat_login', selectedFilePath: 'app/login/page.tsx' },
    answer: '## Answer\n\nThe node uses **OAuth**.',
    backend: 'model',
    modelProfileId: 'model-1',
    contextBundleHash: `sha256:${'a'.repeat(64)}`,
    contextSummary: {
      files: [
        {
          path: 'app/login/page.tsx',
          disposition: 'exact',
          byteLength: 120,
          includedByteLength: 120,
        },
        {
          path: 'lib/auth.ts',
          disposition: 'truncated',
          byteLength: 9000,
          includedByteLength: 800,
        },
        {
          path: 'lib/secret.ts',
          disposition: 'omitted',
          byteLength: 300,
          omissionReason: 'sensitive_path',
        },
      ],
      synopsisPresent: true,
      childrenCoverage: { totalCount: 2, includedCount: 2, omittedCount: 0 },
      bundleHash: `sha256:${'a'.repeat(64)}`,
    },
    reasoning: reasoning
      ? {
          content: '## Provider trace\n\nChecked `app/login/page.tsx` first.',
          source: 'provider_supplied',
          truncated: true,
        }
      : undefined,
    responseLanguage: { tag: 'en', source: 'detected', validation: 'passed' },
    createdAt: '2026-07-18T00:00:00.000Z',
  }
}

afterEach(() => {
  useWorkbenchStore.setState({
    locale: 'en',
    agentFlowSubject: 'run',
    latestAskTrace: null,
  })
})

describe('AskTraceView', () => {
  it('renders context metadata, provider-supplied reasoning, and the answer as Markdown', () => {
    useWorkbenchStore.setState({ locale: 'en' })
    const result = answerResult()
    const html = renderToStaticMarkup(
      <AskTraceView trace={{ status: 'complete', scope: result.scope, result }} />,
    )

    expect(html).toContain('app/login/page.tsx')
    expect(html).toContain('lib/auth.ts')
    expect(html).toContain('sensitive_path')
    expect(html).toContain(`sha256:${'a'.repeat(64)}`)
    expect(html).toContain('模型推理 — 由提供商返回，可能不完整或不可靠')
    expect(html).toContain('Provider trace</span></h2>')
    expect(html).toContain('Answer</span></h2>')
    expect(html).toContain('<strong>OAuth</strong>')
  })

  it('does not render a reasoning disclosure when the provider supplied none', () => {
    const result = answerResult(false)
    const html = renderToStaticMarkup(
      <AskTraceView trace={{ status: 'complete', scope: result.scope, result }} />,
    )

    expect(html).not.toContain('data-ask-trace="reasoning"')
    expect(html).toContain('data-ask-trace="answer"')
  })

  it('renders a non-blocking notice for a language mismatch after retry', () => {
    const result = answerResult(false)
    result.responseLanguage.validation = 'mismatch_after_retry'
    const html = renderToStaticMarkup(
      <AskTraceView trace={{ status: 'complete', scope: result.scope, result }} />,
    )

    expect(html).toContain('data-ask-trace="answer"')
    expect(html).toContain('data-ask-trace="language-notice"')
    expect(html).toContain('回答可能未使用期望语言，系统已重试一次。')
    expect(html).not.toContain('role="alert"')
  })

  it('shows only an honest waiting state while Ask is running', () => {
    const html = renderToStaticMarkup(
      <AskTraceView
        trace={{ status: 'running', scope: { kind: 'node', nodeId: 'feat_login' } }}
      />,
    )

    expect(html).toContain('正在组装上下文并等待模型响应。')
    expect(html).not.toContain('data-ask-trace="reasoning"')
    expect(html).not.toContain('时间线')
    expect(html).not.toContain('流程图')
  })

  it('renders global Ask scope without inventing a node or file', () => {
    const html = renderToStaticMarkup(
      <AskTraceView trace={{ status: 'running', scope: { kind: 'global' } }} />,
    )

    expect(html).toContain('全局 Agent 范围')
    expect(html).toContain('全局 / 整个项目')
    expect(html).not.toContain('<code>')
  })
})
