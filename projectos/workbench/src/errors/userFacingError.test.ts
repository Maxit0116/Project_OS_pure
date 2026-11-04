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
})
