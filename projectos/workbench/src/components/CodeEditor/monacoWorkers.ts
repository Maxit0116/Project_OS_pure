export function installMonacoWorkers(): void {
  const scope = globalThis as typeof globalThis & {
    MonacoEnvironment?: {
      getWorker(workerId: string, label: string): Worker
    }
  }
  scope.MonacoEnvironment = {
    getWorker(_workerId, label) {
      switch (label) {
        case 'json':
          return new Worker(
            new URL('../../../node_modules/monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url),
            { type: 'module' },
          )
        case 'css':
        case 'scss':
        case 'less':
          return new Worker(
            new URL('../../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url),
            { type: 'module' },
          )
        case 'html':
        case 'handlebars':
        case 'razor':
          return new Worker(
            new URL('../../../node_modules/monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url),
            { type: 'module' },
          )
        case 'typescript':
        case 'javascript':
          return new Worker(
            new URL('../../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url),
            { type: 'module' },
          )
        default:
          return new Worker(
            new URL('../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
            { type: 'module' },
          )
      }
    },
  }
}
