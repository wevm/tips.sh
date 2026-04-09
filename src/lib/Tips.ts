/** Types and parsing helpers for Tempo Improvement Proposals. */

/** Summary of a TIP for list views. */
export type Summary = {
  number: string
  title: string
  filename: string
  status: string
  abstract: string
  authors: string
  pr?: PrInfo | undefined
}

/** Full detail of a TIP including content. */
export type Detail = {
  filename: string
  content: string
  number: string
  title: string
  authors: string
  abstract: string
  status: string
  protocolVersion: string
  pr?: PrInfo | undefined
}

/** Pull request metadata for proposed TIPs. */
export type PrInfo = {
  number: number
  url: string
  branch: string
}

/** Parse YAML frontmatter into key-value pairs. */
export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const fm: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return fm
}

/** Extract TIP number and title from content. */
export function parseTitle(content: string): { number: string; title: string } {
  const fm = parseFrontmatter(content)
  if (fm.id && fm.title) {
    const num = fm.id.match(/TIP-(\d+)/)?.[1] ?? '0'
    return { number: num, title: fm.title }
  }
  const match = content.match(/^# TIP-(\d+):\s*(.+)$/m)
  if (match) return { number: match[1], title: match[2].trim() }
  return { number: '0', title: 'Unknown' }
}

/** Extract status from frontmatter or body. */
export function parseStatus(content: string): string {
  const fm = parseFrontmatter(content)
  if (fm.status) return fm.status
  const match = content.match(/\*\*Status\*\*[:\s]*(.+)/i)
  return match ? match[1].trim() : 'Draft'
}

/** Extract the abstract section. */
export function parseAbstract(content: string): string {
  const match = content.match(/## Abstract\s*\n([\s\S]*?)(?=\n## )/i)
  return match ? match[1].trim() : ''
}

/** Extract authors from frontmatter. */
export function parseAuthors(content: string): string {
  const fm = parseFrontmatter(content)
  return fm.authors ?? ''
}
