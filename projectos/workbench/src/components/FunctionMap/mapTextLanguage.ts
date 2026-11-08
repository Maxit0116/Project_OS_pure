/**
 * The language a map's text is written in, from its node names: Chinese when most of them contain
 * Chinese characters, English otherwise. `null` for a map with no nodes.
 */
export function mapTextLanguage(nodes: ReadonlyArray<{ name?: string | null }> | null | undefined): 'zh' | 'en' | null {
  const named = (nodes ?? []).filter((node) => typeof node.name === 'string' && node.name.trim().length > 0)
  if (named.length === 0) return null
  const chinese = named.filter((node) => /[㐀-鿿]/u.test(node.name!)).length
  return chinese / named.length >= 0.5 ? 'zh' : 'en'
}
