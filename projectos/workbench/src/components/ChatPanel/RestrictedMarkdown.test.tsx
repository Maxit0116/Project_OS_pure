import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '../../state/workbenchStore'
import ChatMessageContent from './ChatMessageContent'
import RestrictedMarkdown, { restrictMarkdownUrl } from './RestrictedMarkdown'

function renderMessage(message: Partial<ChatMessage> & Pick<ChatMessage, 'content'>): string {
  return renderToStaticMarkup(
    <ChatMessageContent
      message={{
        id: 'message-1',
        role: 'assistant',
        timestamp: '2026-07-18T00:00:00.000Z',
        ...message,
      }}
    />,
  )
}

describe('RestrictedMarkdown', () => {
  it('renders answer headings, lists, emphasis, and code', () => {
    const html = renderMessage({
      format: 'markdown',
      content: [
        '## Login module',
        '',
        '- Uses **OAuth**',
        '- Calls `createSession(userId)`',
        '',
        '```ts',
        'const  session_id = createSession(userId)',
        '```',
      ].join('\n'),
    })

    expect(html).toContain('Login module</span>')
    expect(html).toContain('id="login-module"')
    expect(html).toContain('<ul>')
    expect(html).toContain('<strong>OAuth</strong>')
    expect(html).toContain('<code>createSession(userId)</code>')
    expect(html).toContain('hljs-keyword')
    expect(html).toContain('createSession</span>')
  })

  it('drops raw HTML and unsafe link destinations', () => {
    const html = renderToStaticMarkup(
      <RestrictedMarkdown>
        {'<script>alert("xss")</script>\n\n[unsafe](javascript:alert("xss"))'}
      </RestrictedMarkdown>,
    )

    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('href=')
    expect(html).toContain('unsafe')
  })

  it('renders GFM tables and task lists', () => {
    const html = renderToStaticMarkup(
      <RestrictedMarkdown>
        {[
          '| Name | Value |',
          '| --- | --- |',
          '| Demo | 1 |',
          '',
          '- [x] Done',
          '- [ ] Todo',
        ].join('\n')}
      </RestrictedMarkdown>,
    )

    expect(html).toContain('<table>')
    expect(html).toContain('task-list-item')
    expect(html).toContain('type="checkbox"')
  })

  it('keeps plain user and system messages out of the markdown renderer', () => {
    for (const role of ['user', 'system'] as const) {
      const html = renderMessage({ role, content: '## Plain **message** <b>text</b>' })
      expect(html).not.toContain('<h2>')
      expect(html).not.toContain('<strong>')
      expect(html).toContain('## Plain **message** &lt;b&gt;text&lt;/b&gt;')
    }
  })

  it('renders a language notice without replacing the Markdown answer', () => {
    const html = renderMessage({
      format: 'markdown',
      content: '**Answer remains available.**',
      notice: 'The answer may not use the requested language. The model was retried once.',
    })

    expect(html).toContain('<strong>Answer remains available.</strong>')
    expect(html).toContain('The answer may not use the requested language.')
  })

  it('allows only explicit web and mail link protocols', () => {
    expect(restrictMarkdownUrl('https://example.com/docs')).toBe('https://example.com/docs')
    expect(restrictMarkdownUrl('http://localhost:5173')).toBe('http://localhost:5173')
    expect(restrictMarkdownUrl('mailto:team@example.com')).toBe('mailto:team@example.com')
    expect(restrictMarkdownUrl('javascript:alert(1)')).toBeUndefined()
    expect(restrictMarkdownUrl('data:text/html,unsafe')).toBeUndefined()
    expect(restrictMarkdownUrl('/relative/path')).toBe('/relative/path')
  })

  it('opens allowed links in an isolated external browsing context', () => {
    const html = renderToStaticMarkup(
      <RestrictedMarkdown>{'[Documentation](https://example.com/docs)'}</RestrictedMarkdown>,
    )

    expect(html).toContain('href="https://example.com/docs"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
