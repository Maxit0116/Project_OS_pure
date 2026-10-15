import type * as Monaco from 'monaco-editor'

export type ProjectOsEditorTheme = 'projectos-dark' | 'projectos-light'

export function editorThemeName(resolvedTheme: 'dark' | 'light'): ProjectOsEditorTheme {
  return resolvedTheme === 'dark' ? 'projectos-dark' : 'projectos-light'
}

const DARK_RULES: Monaco.editor.ITokenThemeRule[] = [
  { token: 'comment', foreground: '6b6b73', fontStyle: 'italic' },
  { token: 'keyword', foreground: '7aa2ff' },
  { token: 'string', foreground: '9dcf8a' },
  { token: 'number', foreground: 'd6b48a' },
  { token: 'regexp', foreground: 'd6b48a' },
  { token: 'type', foreground: '7dced6' },
  { token: 'class', foreground: '7dced6' },
  { token: 'interface', foreground: '7dced6' },
  { token: 'enum', foreground: '7dced6' },
  { token: 'namespace', foreground: '7dced6' },
  { token: 'typeParameter', foreground: '7dced6' },
  { token: 'function', foreground: 'd2c48a' },
  { token: 'method', foreground: 'd2c48a' },
  { token: 'variable', foreground: 'e8e8ec' },
  { token: 'parameter', foreground: 'e0b38a' },
  { token: 'property', foreground: '9ec5e8' },
  { token: 'enumMember', foreground: '9ec5e8' },
]

const LIGHT_RULES: Monaco.editor.ITokenThemeRule[] = [
  { token: 'comment', foreground: '6b6b73', fontStyle: 'italic' },
  { token: 'keyword', foreground: '2546c8' },
  { token: 'string', foreground: '1f7a3a' },
  { token: 'number', foreground: '8a5a12' },
  { token: 'regexp', foreground: '8a5a12' },
  { token: 'type', foreground: '0f6f78' },
  { token: 'class', foreground: '0f6f78' },
  { token: 'interface', foreground: '0f6f78' },
  { token: 'enum', foreground: '0f6f78' },
  { token: 'namespace', foreground: '0f6f78' },
  { token: 'typeParameter', foreground: '0f6f78' },
  { token: 'function', foreground: '6b4f12' },
  { token: 'method', foreground: '6b4f12' },
  { token: 'variable', foreground: '111113' },
  { token: 'parameter', foreground: '8a4b12' },
  { token: 'property', foreground: '1d4e89' },
  { token: 'enumMember', foreground: '1d4e89' },
]

export function registerProjectOsThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme('projectos-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: DARK_RULES,
    colors: {
      'editor.background': '#181818',
      'editor.foreground': '#f4f4f5',
      'editorLineNumber.foreground': '#52525b',
      'editorLineNumber.activeForeground': '#d4d4d8',
      'editorCursor.foreground': '#4c7dff',
      'editor.selectionBackground': '#4c7dff33',
      'editor.inactiveSelectionBackground': '#4c7dff1f',
      'editor.lineHighlightBackground': '#ffffff0a',
      'editorIndentGuide.background1': '#ffffff14',
      'editorIndentGuide.activeBackground1': '#ffffff2e',
    },
  })
  monaco.editor.defineTheme('projectos-light', {
    base: 'vs',
    inherit: true,
    rules: LIGHT_RULES,
    colors: {
      'editor.background': '#fcfcfc',
      'editor.foreground': '#111113',
      'editorLineNumber.foreground': '#a1a1aa',
      'editorLineNumber.activeForeground': '#3f3f46',
      'editorCursor.foreground': '#2563eb',
      'editor.selectionBackground': '#2563eb24',
      'editor.inactiveSelectionBackground': '#2563eb14',
      'editor.lineHighlightBackground': '#11111308',
      'editorIndentGuide.background1': '#11111314',
      'editorIndentGuide.activeBackground1': '#1111132e',
    },
  })
}
