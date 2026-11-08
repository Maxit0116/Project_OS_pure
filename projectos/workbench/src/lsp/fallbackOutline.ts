import type { DocumentSymbolItem, DocumentSymbolKind } from '@contracts/index'

/**
 * A line-based outline for languages the bundled language server does not cover. The server speaks
 * TypeScript and JavaScript only, so every other file showed "no symbols". This reads declarations
 * (classes, functions, methods, types) from the text itself: it is approximate, it never fails, and
 * it is used only when the server has nothing to say.
 */

const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'else', 'do', 'try', 'new', 'throw', 'synchronized',
  'when', 'with', 'using', 'lock', 'foreach', 'elif', 'until', 'unless', 'case', 'sizeof', 'typeof',
])

type Draft = { name: string; kind: DocumentSymbolKind; line: number; column: number; indent: number }

function toItems(drafts: Draft[], lines: string[], endOf: (draft: Draft, index: number, all: Draft[]) => number): DocumentSymbolItem[] {
  const items = drafts.map((draft, index): DocumentSymbolItem & { _indent: number } => {
    const endLine = Math.max(draft.line, endOf(draft, index, drafts))
    return {
      name: draft.name,
      kind: draft.kind,
      startLine: draft.line,
      startColumn: draft.column,
      endLine,
      endColumn: (lines[endLine - 1]?.length ?? 0) + 1,
      children: [],
      _indent: draft.indent,
    }
  })
  const roots: Array<DocumentSymbolItem & { _indent: number }> = []
  const stack: Array<DocumentSymbolItem & { _indent: number }> = []
  for (const item of items) {
    while (stack.length > 0 && !(item.startLine <= stack.at(-1)!.endLine && item._indent > stack.at(-1)!._indent)) stack.pop()
    const parent = stack.at(-1)
    if (parent) parent.children.push(item)
    else roots.push(item)
    stack.push(item)
  }
  const strip = (item: DocumentSymbolItem & { _indent?: number }): DocumentSymbolItem => {
    const { _indent: _ignored, ...rest } = item
    return { ...rest, children: rest.children.map((child) => strip(child as DocumentSymbolItem & { _indent?: number })) }
  }
  return roots.map(strip)
}

const indentOf = (line: string): number => (/^[ \t]*/u.exec(line)?.[0] ?? '').replace(/\t/gu, '    ').length

/** The end of a declaration that is closed by indentation (Python, Ruby): the line before the next line indented no deeper. */
function endByIndent(lines: string[], closedByEnd = false): (draft: Draft) => number {
  return (draft) => {
    let last = draft.line
    let next = draft.line
    for (let index = draft.line; index < lines.length; index += 1) {
      const text = lines[index]!
      if (text.trim() === '') continue
      next = index
      if (indentOf(text) <= draft.indent) break
      last = index + 1
      next = index + 1
    }
    // Ruby closes a block with `end` at the declaration's own indentation.
    if (closedByEnd && /^\s*end\b/u.test(lines[next] ?? '') && indentOf(lines[next]!) === draft.indent) return next + 1
    return last
  }
}

/** The end of a declaration closed by braces: where the first `{` after it is closed. */
function endByBraces(lines: string[]): (draft: Draft) => number {
  return (draft) => {
    let depth = 0
    let opened = false
    for (let index = draft.line - 1; index < lines.length; index += 1) {
      const text = lines[index]!.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\/.*$/gu, '')
      for (const char of text) {
        if (char === '{') { depth += 1; opened = true }
        else if (char === '}') { depth -= 1; if (opened && depth <= 0) return index + 1 }
      }
      if (!opened && index > draft.line + 2 && /;\s*$/u.test(text)) return draft.line
    }
    return opened ? lines.length : draft.line
  }
}

function python(lines: string[]): DocumentSymbolItem[] {
  const drafts: Draft[] = []
  const containers: Array<{ indent: number }> = []
  lines.forEach((text, index) => {
    const match = /^([ \t]*)(?:(class)|(?:async\s+)?(def))\s+([A-Za-z_]\w*)/u.exec(text)
    if (!match) return
    const indent = indentOf(text)
    while (containers.length > 0 && containers.at(-1)!.indent >= indent) containers.pop()
    // Functions nested inside functions are not outline material.
    const parentIsFunction = containers.some((entry) => (entry as { fn?: boolean }).fn)
    if (parentIsFunction) return
    const isClass = match[2] === 'class'
    const inClass = containers.length > 0
    drafts.push({ name: match[4]!, kind: isClass ? 'class' : inClass ? 'method' : 'function', line: index + 1, column: (match[1]?.length ?? 0) + 1, indent })
    containers.push(isClass ? { indent } : Object.assign({ indent }, { fn: true }))
  })
  return toItems(drafts, lines, (draft) => endByIndent(lines)(draft))
}

function ruby(lines: string[]): DocumentSymbolItem[] {
  const drafts: Draft[] = []
  lines.forEach((text, index) => {
    const match = /^([ \t]*)(?:(class|module)\s+([A-Z]\w*(?:::\w+)*)|def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?))/u.exec(text)
    if (!match) return
    const indent = indentOf(text)
    if (match[2]) drafts.push({ name: match[3]!, kind: match[2] === 'module' ? 'module' : 'class', line: index + 1, column: indent + 1, indent })
    else drafts.push({ name: match[4]!, kind: indent > 0 ? 'method' : 'function', line: index + 1, column: indent + 1, indent })
  })
  return toItems(drafts, lines, (draft) => endByIndent(lines, true)(draft))
}

const TYPE_DECLARATION =
  /^([ \t]*)(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|private|protected|internal|static|final|abstract|sealed|open|data|partial|export|default|inner|enum|annotation|value)\s+)*(class|interface|enum|record|struct|trait|object|protocol|namespace|extension)\s+([A-Za-z_]\w*)/u
const KOTLIN_FUN = /^([ \t]*)(?:(?:public|private|protected|internal|override|open|suspend|inline|operator|abstract)\s+)*fun\s+(?:<[^>]+>\s*)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)\s*\(/u
const SWIFT_FUNC = /^([ \t]*)(?:(?:public|private|fileprivate|internal|open|static|class|final|override|mutating)\s+)*func\s+([A-Za-z_]\w*)/u
const PHP_FUNC = /^([ \t]*)(?:(?:public|private|protected|static|final|abstract)\s+)*function\s+&?([A-Za-z_]\w*)\s*\(/u
const JAVA_METHOD =
  /^([ \t]+)(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|protected|private|static|final|abstract|synchronized|default|native|override|virtual|async|internal|sealed|unsafe|extern)\s+)*(?:<[^>]+>\s*)?[A-Za-z_][\w.<>\[\],?]*\s+([A-Za-z_]\w*)\s*\([^;]*$/u

function braceLanguage(lines: string[], ext: string): DocumentSymbolItem[] {
  const drafts: Draft[] = []
  lines.forEach((text, index) => {
    let match = TYPE_DECLARATION.exec(text)
    if (match) {
      const kind: DocumentSymbolKind = match[2] === 'interface' || match[2] === 'protocol' || match[2] === 'trait'
        ? 'interface'
        : match[2] === 'enum' ? 'enum' : match[2] === 'struct' || match[2] === 'record' ? 'struct' : match[2] === 'namespace' ? 'namespace' : 'class'
      drafts.push({ name: match[3]!, kind, line: index + 1, column: indentOf(text) + 1, indent: indentOf(text) })
      return
    }
    const functionPattern = ext === '.kt' || ext === '.kts' ? KOTLIN_FUN : ext === '.swift' ? SWIFT_FUNC : ext === '.php' ? PHP_FUNC : undefined
    if (functionPattern) {
      match = functionPattern.exec(text)
      if (match) drafts.push({ name: match[2]!, kind: indentOf(text) > 0 ? 'method' : 'function', line: index + 1, column: indentOf(text) + 1, indent: indentOf(text) })
      return
    }
    match = JAVA_METHOD.exec(text)
    if (match && !KEYWORDS.has(match[2]!) && !/^\s*(return|new|throw|else)\b/u.test(text) && !/=/u.test(text.split('(')[0]!)) {
      drafts.push({ name: match[2]!, kind: 'method', line: index + 1, column: indentOf(text) + 1, indent: indentOf(text) })
    }
  })
  return toItems(drafts, lines, (draft) => endByBraces(lines)(draft))
}

function golang(lines: string[]): DocumentSymbolItem[] {
  const drafts: Draft[] = []
  lines.forEach((text, index) => {
    let match = /^func\s+(?:\(\s*\w*\s*\*?\s*(\w+)(?:\[[^\]]*\])?\s*\)\s*)?([A-Za-z_]\w*)/u.exec(text)
    if (match) {
      drafts.push({ name: match[1] ? `${match[1]}.${match[2]}` : match[2]!, kind: match[1] ? 'method' : 'function', line: index + 1, column: 1, indent: 0 })
      return
    }
    match = /^type\s+([A-Za-z_]\w*)\s+(struct|interface)\b/u.exec(text)
    if (match) drafts.push({ name: match[1]!, kind: match[2] === 'struct' ? 'struct' : 'interface', line: index + 1, column: 1, indent: 0 })
  })
  return toItems(drafts, lines, (draft) => endByBraces(lines)(draft))
}

function rust(lines: string[]): DocumentSymbolItem[] {
  const drafts: Draft[] = []
  lines.forEach((text, index) => {
    const indent = indentOf(text)
    let match = /^[ \t]*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)/u.exec(text)
    if (match) { drafts.push({ name: match[1]!, kind: indent > 0 ? 'method' : 'function', line: index + 1, column: indent + 1, indent }); return }
    match = /^[ \t]*(?:pub(?:\([^)]*\))?\s+)?(struct|enum|trait|mod)\s+([A-Za-z_]\w*)/u.exec(text)
    if (match) {
      drafts.push({ name: match[2]!, kind: match[1] === 'struct' ? 'struct' : match[1] === 'enum' ? 'enum' : match[1] === 'trait' ? 'interface' : 'module', line: index + 1, column: indent + 1, indent })
      return
    }
    match = /^[ \t]*impl(?:<[^>]*>)?\s+(?:[\w:<>]+\s+for\s+)?([A-Za-z_][\w:]*)/u.exec(text)
    if (match) drafts.push({ name: `impl ${match[1]}`, kind: 'class', line: index + 1, column: indent + 1, indent })
  })
  return toItems(drafts, lines, (draft) => endByBraces(lines)(draft))
}

const EXTENSIONS_NEEDING_NO_FALLBACK = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'])

/** True when the bundled language server handles this file's language, so the fallback stays out of its way. */
export function isServedByLanguageServer(path: string): boolean {
  return EXTENSIONS_NEEDING_NO_FALLBACK.has(extensionOf(path))
}

function extensionOf(path: string): string {
  const name = path.split('/').at(-1) ?? path
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

export function fallbackOutline(path: string, text: string): DocumentSymbolItem[] {
  if (text.length === 0 || text.length > 2_000_000) return []
  const lines = text.split('\n')
  const ext = extensionOf(path)
  try {
    if (ext === '.py' || ext === '.pyw') return python(lines)
    if (ext === '.rb') return ruby(lines)
    if (ext === '.go') return golang(lines)
    if (ext === '.rs') return rust(lines)
    if (['.java', '.kt', '.kts', '.scala', '.cs', '.swift', '.php', '.dart', '.c', '.h', '.cc', '.cpp', '.hpp', '.cxx'].includes(ext)) {
      return braceLanguage(lines, ext)
    }
  } catch {
    return []
  }
  return []
}
