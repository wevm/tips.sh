import { createServerFn } from '@tanstack/react-start'

export type TipSummary = {
  number: string
  title: string
  filename: string
  status: string
  abstract: string
  authors: string
  pr?: { number: number; url: string; branch: string }
}

export type TipDetail = {
  filename: string
  content: string
  number: string
  title: string
  authors: string
  protocolVersion: string
  pr?: { number: number; url: string; branch: string }
}

// Cache for 30 minutes to avoid GitHub rate limits (60 req/hr unauthenticated)
let tipsCache: { data: TipSummary[]; timestamp: number } | null = null
const CACHE_TTL = 30 * 60 * 1000

const githubHeaders = {
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'TIP-Explorer',
}

// Per-file content cache to avoid re-fetching
const contentCache = new Map<string, { content: string; timestamp: number }>()

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const fm: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return fm
}

function parseTitle(content: string): { number: string; title: string } {
  // Try YAML frontmatter first
  const fm = parseFrontmatter(content)
  if (fm.id && fm.title) {
    const num = fm.id.match(/TIP-(\d+)/)?.[1] ?? '0'
    return { number: num, title: fm.title }
  }
  // Fallback to markdown heading
  const match = content.match(/^# TIP-(\d+):\s*(.+)$/m)
  if (match) return { number: match[1], title: match[2].trim() }
  return { number: '0', title: 'Unknown' }
}

function parseStatus(content: string): string {
  const fm = parseFrontmatter(content)
  if (fm.status) return fm.status
  const match = content.match(/\*\*Status\*\*[:\s]*(.+)/i)
  if (match) return match[1].trim()
  return 'Draft'
}

function parseAbstract(content: string): string {
  const match = content.match(/## Abstract\s*\n([\s\S]*?)(?=\n## )/i)
  if (match) return match[1].trim()
  return ''
}

function parseAuthors(content: string): string {
  const fm = parseFrontmatter(content)
  if (fm.authors) return fm.authors
  return ''
}

async function fetchPrTips(): Promise<TipSummary[]> {
  try {
    const res = await fetch(
      'https://api.github.com/repos/tempoxyz/tempo/pulls?state=open&per_page=50',
      { headers: githubHeaders },
    )
    if (!res.ok) return []

    const prs = (await res.json()) as Array<{
      number: number
      title: string
      html_url: string
      head: { ref: string }
    }>

    const tipPrs = prs.filter(
      (pr) => /tip/i.test(pr.title) && /tip[-/]\d+/i.test(pr.head.ref),
    )

    const tips: TipSummary[] = []
    for (const pr of tipPrs) {
      // Get files changed in PR to find TIP markdown
      const filesRes = await fetch(
        `https://api.github.com/repos/tempoxyz/tempo/pulls/${pr.number}/files`,
        { headers: githubHeaders },
      )
      if (!filesRes.ok) continue

      const files = (await filesRes.json()) as Array<{
        filename: string
        status: string
      }>
      const tipFile = files.find(
        (f) =>
          f.filename.startsWith('tips/tip-') &&
          f.filename.endsWith('.md') &&
          (f.status === 'added' || f.status === 'modified'),
      )
      if (!tipFile) continue

      const raw = await fetch(
        `https://raw.githubusercontent.com/tempoxyz/tempo/${pr.head.ref}/${tipFile.filename}`,
        { headers: { 'User-Agent': 'TIP-Explorer' } },
      )
      if (!raw.ok) continue

      const content = await raw.text()
      const { number, title } = parseTitle(content)
      const filename = tipFile.filename.replace('tips/', '')

      tips.push({
        number,
        title,
        filename,
        status: parseStatus(content),
        abstract: parseAbstract(content),
        authors: parseAuthors(content),
        pr: { number: pr.number, url: pr.html_url, branch: pr.head.ref },
      })
    }

    return tips
  } catch {
    return []
  }
}

async function fetchRawContent(ref: string, path: string): Promise<string> {
  const key = `${ref}:${path}`
  const cached = contentCache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.content
  }
  const raw = await fetch(
    `https://raw.githubusercontent.com/tempoxyz/tempo/${ref}/${path}`,
    { headers: { 'User-Agent': 'TIP-Explorer' } },
  )
  if (!raw.ok) throw new Error(`Failed to fetch ${path}: ${raw.status}`)
  const content = await raw.text()
  contentCache.set(key, { content, timestamp: Date.now() })
  return content
}

export const fetchTipsList = createServerFn().handler(async () => {
  if (tipsCache && Date.now() - tipsCache.timestamp < CACHE_TTL) {
    return tipsCache.data
  }

  // Use Git Trees API — single request to list all files in tips/
  const treeRes = await fetch(
    'https://api.github.com/repos/tempoxyz/tempo/git/trees/main?recursive=1',
    { headers: githubHeaders },
  )
  if (!treeRes.ok) throw new Error(`GitHub API error: ${treeRes.status}`)

  const tree = (await treeRes.json()) as {
    tree: Array<{ path: string; type: string }>
  }
  const tipPaths = tree.tree.filter(
    (f) =>
      f.type === 'blob' &&
      /^tips\/tip-\d+\.md$/.test(f.path),
  )

  const [mergedTips, prTips] = await Promise.all([
    Promise.all(
      tipPaths.map(async (f) => {
        const content = await fetchRawContent('main', f.path)
        const { number, title } = parseTitle(content)
        const filename = f.path.replace('tips/', '')
        return {
          number,
          title,
          filename,
          status: parseStatus(content),
          abstract: parseAbstract(content),
          authors: parseAuthors(content),
          pr: undefined,
        } satisfies TipSummary
      }),
    ),
    fetchPrTips(),
  ])

  // Merge, deduplicating by number (merged wins over PR)
  const mergedNumbers = new Set(mergedTips.map((t) => t.number))
  const uniquePrTips = prTips.filter((t) => !mergedNumbers.has(t.number))
  const tips = [...mergedTips, ...uniquePrTips]

  tips.sort((a, b) => Number(a.number) - Number(b.number))

  tipsCache = { data: tips, timestamp: Date.now() }
  return tips
})

export const fetchTip = createServerFn({ method: 'POST' })
  .inputValidator((d: string) => d)
  .handler(async ({ data: tipId }) => {
    // Look up PR info from the tips list
    const allTips = await fetchTipsList()
    const summary = allTips.find((t) => t.number === tipId)

    const filename = `tip-${tipId}.md`
    const ref = summary?.pr?.branch ?? 'main'
    const content = await fetchRawContent(ref, `tips/${filename}`)
    const { number, title } = parseTitle(content)
    const authors = parseAuthors(content)
    const pvMatch = content.match(/\*\*Protocol Version\*\*[:\s]*(.+)/i)
    const protocolVersion = pvMatch ? pvMatch[1].trim() : ''
    const pr = summary?.pr

    return { filename, content, number, title, authors, protocolVersion, pr } satisfies TipDetail
  })
