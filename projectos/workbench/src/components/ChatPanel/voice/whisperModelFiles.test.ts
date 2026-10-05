import { describe, expect, it } from 'vitest'
import { WHISPER_MODEL_FILES, WHISPER_MODEL_REQUIRED_FILES } from './whisperModelFiles'

describe('whisperModelFiles', () => {
  it('marks the quantized encoder and merged decoder as required', () => {
    expect(WHISPER_MODEL_REQUIRED_FILES).toContain('tokenizer_config.json')
    expect(WHISPER_MODEL_REQUIRED_FILES).toContain('onnx/encoder_model_quantized.onnx')
    expect(WHISPER_MODEL_REQUIRED_FILES).toContain('onnx/decoder_model_merged_quantized.onnx')
    expect(WHISPER_MODEL_FILES).toEqual(expect.arrayContaining([...WHISPER_MODEL_REQUIRED_FILES]))
  })
})
