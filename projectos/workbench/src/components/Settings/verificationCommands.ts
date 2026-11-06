import type { ExecCommand } from '@contracts/index'

/**
 * Verification commands as a person writes them: one line, like `npx tsc --noEmit`. The runner
 * starts a program with arguments and no shell, so a line with `&&`, a pipe or a redirect would not
 * do what it looks like; it is refused here instead of being run as odd arguments.
 */

export const MAX_VERIFICATION_COMMANDS = 10
export const MIN_TIMEOUT_SECONDS = 1
export const MAX_TIMEOUT_SECONDS = 300
export const DEFAULT_TIMEOUT_SECONDS = 180

export type CommandLineProblem = 'empty' | 'shell_operator' | 'unterminated_quote'

export type ParsedCommandLine =
  | { ok: true; command: ExecCommand }
  | { ok: false; problem: CommandLineProblem }

const SHELL_OPERATORS = /(&&|\|\||[|;<>`]|\$\()/u

export function clampTimeoutSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_TIMEOUT_SECONDS
  return Math.min(MAX_TIMEOUT_SECONDS, Math.max(MIN_TIMEOUT_SECONDS, Math.round(seconds)))
}

export function parseCommandLine(line: string, timeoutSeconds: number): ParsedCommandLine {
  const words: string[] = []
  let current = ''
  let started = false
  let quote: '"' | "'" | null = null
  for (const char of line.trim()) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }
    if (/\s/u.test(char)) {
      if (started) {
        words.push(current)
        current = ''
        started = false
      }
      continue
    }
    current += char
    started = true
  }
  if (quote) return { ok: false, problem: 'unterminated_quote' }
  if (started) words.push(current)
  if (words.length === 0) return { ok: false, problem: 'empty' }
  // Only unquoted text can be a shell operator; "a && b" inside quotes is just an argument.
  const unquoted = line.replace(/"[^"]*"|'[^']*'/gu, '')
  if (SHELL_OPERATORS.test(unquoted)) return { ok: false, problem: 'shell_operator' }
  const [command, ...args] = words
  return {
    ok: true,
    command: { command: command as string, args, timeoutMs: clampTimeoutSeconds(timeoutSeconds) * 1000 },
  }
}

export function formatCommandLine(command: ExecCommand): string {
  return [command.command, ...command.args]
    .map((word) => (/[\s"']/u.test(word) || word === '' ? JSON.stringify(word) : word))
    .join(' ')
}

export interface VerificationSuggestion {
  id: string
  /** `typecheck`, `lint`, `test` or `build`: the key of the translated label. */
  kind: 'typecheck' | 'lint' | 'test' | 'build'
  line: string
  timeoutSeconds: number
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export function detectPackageManager(lockfiles: { pnpm: boolean; yarn: boolean; bun: boolean }): PackageManager {
  if (lockfiles.pnpm) return 'pnpm'
  if (lockfiles.yarn) return 'yarn'
  if (lockfiles.bun) return 'bun'
  return 'npm'
}

const NPM_DEFAULT_TEST = /no test specified/u

function runScript(manager: PackageManager, script: string): string {
  if (manager === 'yarn') return `yarn ${script}`
  if (manager === 'npm' && script === 'test') return 'npm test'
  if (manager === 'pnpm' && script === 'test') return 'pnpm test'
  return `${manager} run ${script}`
}

/**
 * What this project can be checked with, from its own scripts. Suggestions only: nothing is added
 * or run until the person picks it, and a command still needs approval before it first runs.
 */
export function detectVerificationSuggestions(input: {
  packageJson?: string | undefined
  hasTsconfig: boolean
  packageManager: PackageManager
}): VerificationSuggestion[] {
  const suggestions: VerificationSuggestion[] = []
  let scripts: Record<string, unknown> = {}
  if (input.packageJson) {
    try {
      const parsed = JSON.parse(input.packageJson) as { scripts?: unknown }
      if (parsed.scripts && typeof parsed.scripts === 'object') scripts = parsed.scripts as Record<string, unknown>
    } catch {
      scripts = {}
    }
  }
  const has = (name: string): boolean => typeof scripts[name] === 'string' && (scripts[name] as string).trim() !== ''
  const add = (kind: VerificationSuggestion['kind'], line: string, timeoutSeconds: number) => {
    suggestions.push({ id: `${kind}:${line}`, kind, line, timeoutSeconds })
  }

  const typecheckScript = ['typecheck', 'type-check', 'tsc'].find(has)
  if (typecheckScript) add('typecheck', runScript(input.packageManager, typecheckScript), 180)
  else if (input.hasTsconfig) add('typecheck', 'npx tsc --noEmit', 180)
  if (has('lint')) add('lint', runScript(input.packageManager, 'lint'), 180)
  if (has('test') && !NPM_DEFAULT_TEST.test(scripts.test as string)) add('test', runScript(input.packageManager, 'test'), 300)
  if (has('build')) add('build', runScript(input.packageManager, 'build'), 300)
  return suggestions
}

/**
 * Suggestions for projects that are not JavaScript, from the marker files in the project folder.
 * The detection used to know `package.json` only, so a Python, Go, Rust or Java project was offered
 * nothing to verify with. Same rules as above: suggestions only, nothing is run without approval, and
 * the runner starts a program with arguments, so each line is a plain command.
 */
export function detectOtherEcosystemSuggestions(names: ReadonlySet<string>): VerificationSuggestion[] {
  const suggestions: VerificationSuggestion[] = []
  const add = (kind: VerificationSuggestion['kind'], line: string, timeoutSeconds: number) => {
    suggestions.push({ id: `${kind}:${line}`, kind, line, timeoutSeconds })
  }
  const any = (...candidates: string[]): boolean => candidates.some((name) => names.has(name))
  const endsWith = (suffix: string): boolean => [...names].some((name) => name.endsWith(suffix))

  if (names.has('go.mod')) {
    add('typecheck', 'go build ./...', 300)
    add('lint', 'go vet ./...', 180)
    add('test', 'go test ./...', 300)
  }
  if (names.has('Cargo.toml')) {
    add('typecheck', 'cargo check', 300)
    add('test', 'cargo test', 300)
  }
  if (any('pyproject.toml', 'setup.py', 'setup.cfg', 'pytest.ini', 'tox.ini', 'requirements.txt')) {
    add('test', 'python3 -m pytest', 300)
  }
  if (names.has('pom.xml')) {
    const maven = names.has('mvnw') ? './mvnw' : 'mvn'
    add('test', `${maven} -q test`, 300)
    add('build', `${maven} -q -DskipTests package`, 300)
  }
  if (any('build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts')) {
    const gradle = names.has('gradlew') ? './gradlew' : 'gradle'
    add('test', `${gradle} test`, 300)
    add('build', `${gradle} build -x test`, 300)
  }
  if (endsWith('.sln') || endsWith('.csproj')) {
    add('typecheck', 'dotnet build', 300)
    add('test', 'dotnet test', 300)
  }
  if (names.has('Gemfile')) {
    add('test', names.has('.rspec') ? 'bundle exec rspec' : 'bundle exec rake test', 300)
  }
  return suggestions
}

export function suggestionsNotConfigured(
  suggestions: VerificationSuggestion[],
  configured: ExecCommand[],
): VerificationSuggestion[] {
  const lines = new Set(configured.map(formatCommandLine))
  return suggestions.filter((suggestion) => !lines.has(suggestion.line))
}

export interface CommandRow {
  key: number
  line: string
  seconds: number
}

/**
 * The commands the rows describe and, per row key, why a row cannot be one. A blank row is a
 * row the person has not filled in yet, not a mistake, so it is skipped.
 */
export function commandsFromRows(rows: CommandRow[]): {
  commands: ExecCommand[]
  problems: Record<number, CommandLineProblem>
} {
  const commands: ExecCommand[] = []
  const problems: Record<number, CommandLineProblem> = {}
  for (const row of rows) {
    if (row.line.trim() === '') continue
    const parsed = parseCommandLine(row.line, row.seconds)
    if (parsed.ok) commands.push(parsed.command)
    else problems[row.key] = parsed.problem
  }
  return { commands, problems }
}
