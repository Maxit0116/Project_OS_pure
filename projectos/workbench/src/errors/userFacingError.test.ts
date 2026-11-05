import { describe, expect, it } from 'vitest'
import { ProjectOSError } from '../../../errors.js'
import { encodeIpcError } from '../../../shared/ipc-error'
import { userFacingErrorMessage, userFacingProviderText } from './userFacingError'

describe('userFacingErrorMessage', () => {
  it('tells a person with no model to configure one, in their language, without any IPC wrapper', () => {
    const error = new ProjectOSError('model_not_configured', 'A configured model profile is required for grounded answers')
    expect(userFacingErrorMessage(error, 'en')).toMatch(/Settings → Models/u)
    expect(userFacingErrorMessage(error, 'zh')).toMatch(/设置 → 模型/u)
    expect(userFacingErrorMessage(error, 'en')).not.toMatch(/Error invoking|ProjectOSError|grounded answers/u)
  })

  it('says plainly that nothing changed when the model keeps returning unusable output', () => {
    const error = new ProjectOSError('model_output_invalid', 'The model did not return a usable planning step after a retry')
    expect(userFacingErrorMessage(error, 'en')).toMatch(/Nothing was changed/u)
    expect(userFacingErrorMessage(error, 'zh')).toMatch(/未做任何改动/u)
    const wrapped = new Error(`Error invoking remote method 'projectos:extractRequestIntent': ${encodeIpcError({ code: 'model_output_invalid', message: 'raw' })}`)
    // Over IPC the code arrives only inside the message; the transport rebuilds it into a coded error.
    expect(userFacingErrorMessage(Object.assign(wrapped, { code: 'model_output_invalid' }), 'en')).toMatch(/Nothing was changed/u)
  })

  it('explains each provider status instead of printing the status alone', () => {
    const failure = (status: number) => new ProjectOSError('model_connection_failed', `Model provider request failed (HTTP ${status})`)
    expect(userFacingErrorMessage(failure(401), 'en')).toMatch(/rejected the API key/u)
    expect(userFacingErrorMessage(failure(403), 'zh')).toMatch(/拒绝了该 API Key/u)
    expect(userFacingErrorMessage(failure(402), 'en')).toMatch(/insufficient balance/u)
    expect(userFacingErrorMessage(failure(404), 'en')).toMatch(/model name and Base URL/u)
    expect(userFacingErrorMessage(failure(429), 'en')).toMatch(/rate-limiting/u)
    expect(userFacingErrorMessage(failure(503), 'en')).toMatch(/server error/u)
    expect(userFacingErrorMessage(failure(400), 'en')).toMatch(/rejected the request \(HTTP 400\)/u)
  })

  it('reads a provider failure that arrives only as Electron-wrapped text', () => {
    const wrapped = new Error("Error invoking remote method 'projectos:askAgent': ProjectOSError: Model provider request failed (HTTP 401)")
    expect(userFacingErrorMessage(wrapped, 'en')).toMatch(/rejected the API key \(HTTP 401\)/u)
  })

  it('strips the wrapper from an unrelated error and still redacts secrets', () => {
    const wrapped = new Error("Error invoking remote method 'projectos:x': ProjectOSError: Provider said apiKey=sk-abcdefghijklmnop failed")
    const text = userFacingErrorMessage(wrapped, 'en')
    expect(text).not.toMatch(/Error invoking remote method|ProjectOSError:/u)
    expect(text).not.toContain('sk-abcdefghijklmnop')
    expect(text).toContain('failed')
  })

  it('decodes a structured error delivered through the message', () => {
    const encoded = new Error(`Error invoking remote method 'projectos:askAgent': Error: ${encodeIpcError({ code: 'model_not_configured', message: 'x' })}`)
    // Not yet a ProjectOSError (the transport does that); the message alone must still read well.
    expect(userFacingErrorMessage(encoded, 'en')).toBe('x')
  })
})

describe('userFacingProviderText', () => {
  it('leaves text that is not a provider failure alone', () => {
    expect(userFacingProviderText('Disk is full', 'en')).toBeUndefined()
  })

  it('tells a person which step to take when a debug fix has no target file', () => {
    const error = Object.assign(new Error('No target file could be resolved for the debug fix'), { code: 'debug_target_unresolved' })
    expect(userFacingErrorMessage(error, 'zh')).toMatch(/选中出问题的文件/u)
    expect(userFacingErrorMessage(error, 'en')).toMatch(/Select the file/u)
    expect(userFacingErrorMessage(error, 'en')).not.toMatch(/No target file could be resolved/u)
  })

  it('tells a person the model could not be reached instead of a bare fetch failure', () => {
    // Observed live: offline, every call failed with `fetch failed` and nothing said why.
    const dns = Object.assign(new Error('Model provider unreachable (dns): api.deepseek.com'), { code: 'model_unreachable' })
    expect(userFacingErrorMessage(dns, 'en')).toMatch(/could not reach the model service \(api\.deepseek\.com\)/u)
    expect(userFacingErrorMessage(dns, 'zh')).toMatch(/无法连接到模型服务（api\.deepseek\.com）/u)
    const refused = new Error('Model provider unreachable (refused): 127.0.0.1:11434')
    expect(userFacingErrorMessage(refused, 'en')).toMatch(/refused the connection.*local model/u)
    expect(userFacingErrorMessage(refused, 'en')).not.toMatch(/unreachable \(refused\)/u)
  })

  it('says how long the model was given before it timed out', () => {
    const timeout = Object.assign(new Error('Model request timed out after 120s'), { code: 'model_timeout' })
    expect(userFacingErrorMessage(timeout, 'en')).toMatch(/did not answer within 120 seconds/u)
    expect(userFacingErrorMessage(timeout, 'zh')).toMatch(/120 秒内没有响应/u)
  })

  it('says a file no feature owns cannot be changed yet and how to fix that', () => {
    const error = Object.assign(new Error("File 'lib/validators.ts' is not owned or linked by any functional node"), { code: 'file_owner_not_found' })
    expect(userFacingErrorMessage(error, 'en')).toMatch(/lib\/validators\.ts is not part of any feature.*add it to a feature/u)
    expect(userFacingErrorMessage(error, 'zh')).toMatch(/lib\/validators\.ts 不属于任何功能.*加入某个功能/u)
    expect(userFacingErrorMessage(error, 'en')).not.toMatch(/functional node/u)
  })

  it('says a change the review rejected was not applied, which requirement failed, and what to do', () => {
    // Observed live: a requirement that could not be met as written ended the run with "rejected the
    // whole-tree proposal batch" and nothing about what to change.
    const text = 'Independent agent validation rejected the whole-tree proposal batch: app/profile/page.tsx: The count is not restricted inside the nested select.'
    expect(userFacingErrorMessage(new Error(text), 'en')).toMatch(/not applied.*could not confirm a requirement \(app\/profile\/page\.tsx: The count is not restricted.*Nothing was written.*Reword the request/u)
    expect(userFacingErrorMessage(new Error(text), 'zh')).toMatch(/改动未应用.*app\/profile\/page\.tsx.*没有写入任何文件/u)
    const bare = 'Independent agent validation rejected the whole-tree proposal batch'
    expect(userFacingErrorMessage(new Error(bare), 'en')).toMatch(/Nothing was written/u)
  })

  it('says a change that went stale cannot be applied and what to do, not the internal diff text', () => {
    // Observed live: applying a debug fix after the probes were cleaned up showed this raw English line.
    const error = Object.assign(new Error("Generated diff is stale for 'lib/team.ts'"), { code: 'diff_stale' })
    expect(userFacingErrorMessage(error, 'zh')).toMatch(/无法再应用/u)
    expect(userFacingErrorMessage(error, 'en')).toMatch(/can no longer be applied/u)
    expect(userFacingErrorMessage(error, 'en')).not.toMatch(/Generated diff is stale/u)
  })
  it('says a held change was not applied because a requirement is unmet, and what the choices are', () => {
    const error = Object.assign(
      new Error('The independent review says this change does not meet: app/page.tsx: The heading must say Welcome'),
      { code: 'review_unmet_requirements' },
    )
    expect(userFacingErrorMessage(error, 'en')).toMatch(/not applied.*does not meet a requirement \(app\/page\.tsx: The heading must say Welcome\).*Apply anyway.*reword/u)
    expect(userFacingErrorMessage(error, 'zh')).toMatch(/改动未应用.*app\/page\.tsx.*仍然应用/u)
    const bare = Object.assign(new Error('refused'), { code: 'review_unmet_requirements' })
    expect(userFacingErrorMessage(bare, 'en')).toMatch(/does not meet a requirement\. Read the change/u)
  })
})
