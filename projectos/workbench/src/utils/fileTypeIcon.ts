import type { LucideIcon } from 'lucide-react'
import {
  Braces,
  File,
  FileCode,
  FileImage,
  FileText,
  FileType,
  Settings,
} from 'lucide-react'

const EXTENSION_ICON: Record<string, LucideIcon> = {
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  json: Braces,
  css: FileType,
  scss: FileType,
  less: FileType,
  md: FileText,
  mdx: FileText,
  txt: FileText,
  yaml: Settings,
  yml: Settings,
  toml: Settings,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  webp: FileImage,
  svg: FileImage,
}

export function resolveFileTypeIcon(path: string): LucideIcon {
  const normalized = path.replace(/\\/g, '/')
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1)
  const dot = basename.lastIndexOf('.')
  if (dot <= 0 || dot === basename.length - 1) {
    return File
  }
  const ext = basename.slice(dot + 1).toLowerCase()
  return EXTENSION_ICON[ext] ?? File
}
