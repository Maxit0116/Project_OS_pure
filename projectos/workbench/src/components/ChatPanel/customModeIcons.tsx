import type { LucideIcon } from 'lucide-react'
import {
  CheckSquare,
  ClipboardList,
  FileSearch,
  ListChecks,
  Sparkles,
  Wrench,
} from 'lucide-react'

const ICON_BY_NAME: Record<string, LucideIcon> = {
  checklist: ListChecks,
  'list-checks': ListChecks,
  clipboard: ClipboardList,
  'clipboard-list': ClipboardList,
  search: FileSearch,
  'file-search': FileSearch,
  sparkles: Sparkles,
  wrench: Wrench,
  check: CheckSquare,
}

/**
 * Skill frontmatter `icon` may be a Lucide name (e.g. checklist) or a short glyph.
 */
export function CustomModeIcon({
  icon,
  className,
  color,
}: {
  icon?: string
  className?: string
  color?: string
}) {
  if (!icon) return null
  const key = icon.trim().toLowerCase()
  const Lucide = ICON_BY_NAME[key]
  if (Lucide) {
    return (
      <Lucide
        className={className}
        size={14}
        aria-hidden
        style={color ? { color } : undefined}
      />
    )
  }
  // Fallback: treat as literal glyph / emoji
  return (
    <span className={className} aria-hidden style={color ? { color } : undefined}>
      {icon}
    </span>
  )
}
