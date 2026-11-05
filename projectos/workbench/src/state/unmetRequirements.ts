/** A requirement the independent review says a held change does not meet, and the file it is about. */
export interface UnmetRequirement {
  path: string
  problems: string[]
}

const MAX_ITEMS = 8
const MAX_PROBLEMS = 4
const MAX_TEXT = 500

/**
 * The unmet requirements carried by a held run's `diff_ready` event. The payload comes from the
 * server, but this is the edge of the screen, so anything that is not the expected shape is dropped
 * rather than shown.
 */
export function parseUnmetRequirements(value: unknown): UnmetRequirement[] {
  if (!Array.isArray(value)) return []
  const parsed: UnmetRequirement[] = []
  for (const item of value.slice(0, MAX_ITEMS)) {
    if (typeof item !== 'object' || item === null) continue
    const { path, problems } = item as { path?: unknown; problems?: unknown }
    if (typeof path !== 'string' || !Array.isArray(problems)) continue
    const texts = problems
      .filter((problem): problem is string => typeof problem === 'string' && problem.trim().length > 0)
      .slice(0, MAX_PROBLEMS)
      .map((problem) => problem.trim().slice(0, MAX_TEXT))
    if (texts.length > 0) parsed.push({ path: path.slice(0, 300), problems: texts })
  }
  return parsed
}

/**
 * When the ordinary Apply is refused for unmet requirements, only the message survives the trip from
 * the main process ("…does not meet: <file>: <requirement>"). Recover what is shown from it.
 */
export function unmetRequirementsFromMessage(message: string): UnmetRequirement[] {
  const match = /does not meet: ([^:]+): ([\s\S]+)/u.exec(message)
  if (!match) return []
  const [, path, problem] = match
  return [{ path: path!.trim(), problems: [problem!.trim().slice(0, MAX_TEXT)] }]
}
