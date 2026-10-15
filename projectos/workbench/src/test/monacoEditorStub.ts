export class Emitter<T = void> {
  event = (_listener: (value: T) => void) => ({ dispose() {} })
  fire(_value?: T): void {}
  dispose(): void {}
}

export const editor = {
  defineTheme() {},
}

const diagnostics = {
  setDiagnosticsOptions() {},
}

export const languages = {
  registerDocumentSemanticTokensProvider() {
    return { dispose() {} }
  },
  typescript: {
    typescriptDefaults: diagnostics,
    javascriptDefaults: diagnostics,
  },
}
