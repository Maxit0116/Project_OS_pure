import { describe, expect, it } from 'vitest'

import {
  clampTimeoutSeconds,
  commandsFromRows,
  detectPackageManager,
  detectOtherEcosystemSuggestions,
  detectVerificationSuggestions,
  formatCommandLine,
  parseCommandLine,
  suggestionsNotConfigured,
} from './verificationCommands'

describe('parseCommandLine', () => {
  it('turns one line into the program, its arguments and a timeout', () => {
    expect(parseCommandLine('npx tsc --noEmit', 180)).toEqual({
      ok: true,
      command: { command: 'npx', args: ['tsc', '--noEmit'], timeoutMs: 180_000 },
    })
  })

  it('keeps a quoted argument together', () => {
    const parsed = parseCommandLine('npm run "my script" --flag', 60)
    expect(parsed).toMatchObject({ ok: true, command: { command: 'npm', args: ['run', 'my script', '--flag'] } })
  })

  it('refuses what only a shell would understand, instead of passing it on as arguments', () => {
    // The runner starts a program without a shell: `npm run lint && npm test` would hand "&&" to npm.
    for (const line of ['npm run lint && npm test', 'cat a | grep b', 'echo x > out.txt', 'a; b', 'echo $(date)', 'a || b']) {
      expect(parseCommandLine(line, 60)).toEqual({ ok: false, problem: 'shell_operator' })
    }
  })

  it('accepts an operator inside quotes, where it is only text', () => {
    expect(parseCommandLine('node -e "a && b"', 60)).toMatchObject({ ok: true })
  })

  it('reports an empty line and an open quote', () => {
    expect(parseCommandLine('   ', 60)).toEqual({ ok: false, problem: 'empty' })
    expect(parseCommandLine('npm run "oops', 60)).toEqual({ ok: false, problem: 'unterminated_quote' })
  })

  it('keeps the timeout inside what the runner allows', () => {
    expect(clampTimeoutSeconds(0)).toBe(1)
    expect(clampTimeoutSeconds(9999)).toBe(300)
    expect(clampTimeoutSeconds(Number.NaN)).toBe(180)
    expect(parseCommandLine('npm test', 9999)).toMatchObject({ command: { timeoutMs: 300_000 } })
  })
})

describe('formatCommandLine', () => {
  it('round-trips a command, quoting an argument that has a space', () => {
    const command = { command: 'npm', args: ['run', 'my script'], timeoutMs: 60_000 }
    const line = formatCommandLine(command)
    expect(line).toBe('npm run "my script"')
    expect(parseCommandLine(line, 60)).toMatchObject({ ok: true, command })
  })
})

describe('detectVerificationSuggestions', () => {
  const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: 'x', scripts })

  it('offers the project\'s own scripts, with the package manager it uses', () => {
    const scripts = { typecheck: 'tsc --noEmit', lint: 'eslint .', test: 'vitest run', build: 'next build' }
    expect(detectVerificationSuggestions({ packageJson: pkg(scripts), hasTsconfig: true, packageManager: 'npm' }).map((s) => s.line))
      .toEqual(['npm run typecheck', 'npm run lint', 'npm test', 'npm run build'])
    expect(detectVerificationSuggestions({ packageJson: pkg(scripts), hasTsconfig: true, packageManager: 'pnpm' }).map((s) => s.line))
      .toEqual(['pnpm run typecheck', 'pnpm run lint', 'pnpm test', 'pnpm run build'])
    expect(detectVerificationSuggestions({ packageJson: pkg(scripts), hasTsconfig: true, packageManager: 'yarn' }).map((s) => s.line))
      .toEqual(['yarn typecheck', 'yarn lint', 'yarn test', 'yarn build'])
  })

  it('falls back to a plain type check when there is a tsconfig but no script for it', () => {
    expect(detectVerificationSuggestions({ packageJson: pkg({ dev: 'next dev' }), hasTsconfig: true, packageManager: 'npm' }))
      .toEqual([{ id: 'typecheck:npx tsc --noEmit', kind: 'typecheck', line: 'npx tsc --noEmit', timeoutSeconds: 180 }])
  })

  it('does not suggest the placeholder test script npm generates', () => {
    const placeholder = 'echo "Error: no test specified" && exit 1'
    expect(detectVerificationSuggestions({ packageJson: pkg({ test: placeholder }), hasTsconfig: false, packageManager: 'npm' })).toEqual([])
  })

  it('suggests nothing for a project it cannot read anything from', () => {
    expect(detectVerificationSuggestions({ packageJson: 'not json', hasTsconfig: false, packageManager: 'npm' })).toEqual([])
    expect(detectVerificationSuggestions({ hasTsconfig: false, packageManager: 'npm' })).toEqual([])
  })

  it('does not offer a command that is already configured', () => {
    const suggestions = detectVerificationSuggestions({ packageJson: pkg({ lint: 'eslint .' }), hasTsconfig: true, packageManager: 'npm' })
    const configured = [{ command: 'npx', args: ['tsc', '--noEmit'], timeoutMs: 180_000 }]
    expect(suggestionsNotConfigured(suggestions, configured).map((s) => s.line)).toEqual(['npm run lint'])
  })

  it('reads the package manager from the lockfile', () => {
    expect(detectPackageManager({ pnpm: true, yarn: false, bun: false })).toBe('pnpm')
    expect(detectPackageManager({ pnpm: false, yarn: true, bun: false })).toBe('yarn')
    expect(detectPackageManager({ pnpm: false, yarn: false, bun: false })).toBe('npm')
  })
})

describe('detectOtherEcosystemSuggestions', () => {
  // A Python, Go, Rust or Java project was offered nothing to verify with, because only package.json was read.
  const lines = (...names: string[]) => detectOtherEcosystemSuggestions(new Set(names)).map((suggestion) => suggestion.line)

  it('suggests the standard checks for each ecosystem from its marker file', () => {
    expect(lines('go.mod', 'main.go')).toEqual(['go build ./...', 'go vet ./...', 'go test ./...'])
    expect(lines('Cargo.toml')).toEqual(['cargo check', 'cargo test'])
    expect(lines('pyproject.toml')).toEqual(['python3 -m pytest'])
    expect(lines('Gemfile')).toEqual(['bundle exec rake test'])
    expect(lines('Gemfile', '.rspec')).toEqual(['bundle exec rspec'])
    expect(lines('App.sln')).toEqual(['dotnet build', 'dotnet test'])
  })

  it('uses a project wrapper for Maven and Gradle when there is one', () => {
    expect(lines('pom.xml', 'mvnw')).toEqual(['./mvnw -q test', './mvnw -q -DskipTests package'])
    expect(lines('pom.xml')).toEqual(['mvn -q test', 'mvn -q -DskipTests package'])
    expect(lines('build.gradle.kts', 'gradlew')).toEqual(['./gradlew test', './gradlew build -x test'])
    expect(lines('build.gradle')).toEqual(['gradle test', 'gradle build -x test'])
  })

  it('offers nothing for a project it does not recognise, and only plain commands the runner accepts', () => {
    expect(lines('README.md', 'notes.txt')).toEqual([])
    for (const marker of ['go.mod', 'Cargo.toml', 'pyproject.toml', 'pom.xml', 'build.gradle', 'App.csproj', 'Gemfile']) {
      for (const line of lines(marker)) expect(parseCommandLine(line, 60).ok).toBe(true)
    }
  })
})

describe('commandsFromRows', () => {
  it('skips blank rows and reports the rows that are not a command, by row', () => {
    const { commands, problems } = commandsFromRows([
      { key: 1, line: 'npx tsc --noEmit', seconds: 180 },
      { key: 2, line: '   ', seconds: 60 },
      { key: 3, line: 'npm run lint && npm test', seconds: 60 },
      { key: 4, line: 'npm run "open', seconds: 60 },
    ])
    expect(commands).toEqual([{ command: 'npx', args: ['tsc', '--noEmit'], timeoutMs: 180_000 }])
    expect(problems).toEqual({ 3: 'shell_operator', 4: 'unterminated_quote' })
  })
})
