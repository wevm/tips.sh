/** GitHub → D1 sync for TIPs. KV is only used for the sync lock. */

import * as Tips from './Tips'

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Tips',
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function firstCommitDate(path: string, token?: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/tempoxyz/tempo/commits?path=${encodeURIComponent(path)}&per_page=1&page=1`,
      { headers: ghHeaders(token) },
    )
    if (!res.ok) return ''
    // GitHub returns newest first by default; get the Link header for last page
    const link = res.headers.get('link')
    if (link) {
      const lastMatch = link.match(/<([^>]+)>;\s*rel="last"/)
      if (lastMatch) {
        const lastRes = await fetch(lastMatch[1], { headers: ghHeaders(token) })
        if (lastRes.ok) {
          const commits = (await lastRes.json()) as Array<{ commit: { committer: { date: string } } }>
          if (commits.length > 0) return commits[commits.length - 1].commit.committer.date.slice(0, 10)
        }
      }
    }
    // Single page — take the last (oldest) commit
    const commits = (await res.json()) as Array<{ commit: { committer: { date: string } } }>
    if (commits.length > 0) return commits[commits.length - 1].commit.committer.date.slice(0, 10)
  } catch {}
  return ''
}

async function raw(ref: string, path: string, token?: string): Promise<string> {
  const res = await fetch(`https://raw.githubusercontent.com/tempoxyz/tempo/${ref}/${path}`, {
    headers: ghHeaders(token),
  })
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.text()
}

export type TipRow = {
  number: string
  title: string
  authors: string
  status: string
  abstract: string
  content: string
  filename: string
  protocolVersion: string
  prJson: string
  createdAt: string
}

function parseTipRow(
  content: string,
  filename: string,
  prJson: string,
  createdAt: string,
): TipRow {
  const { number, title } = Tips.parseTitle(content)
  const pvMatch = content.match(/\*\*Protocol Version\*\*[:\s]*(.+)/i)
  return {
    number,
    title,
    authors: Tips.parseAuthors(content),
    status: Tips.parseStatus(content),
    abstract: Tips.parseAbstract(content),
    content,
    filename,
    protocolVersion: pvMatch ? pvMatch[1].trim() : '',
    prJson,
    createdAt,
  }
}

async function fetchPrTips(token?: string): Promise<TipRow[]> {
  try {
    // Paginate through all open PRs
    const allPrs: Array<{
      number: number
      title: string
      body: string | null
      html_url: string
      head: { ref: string }
    }> = []
    let page = 1
    while (true) {
      const res = await fetch(
        `https://api.github.com/repos/tempoxyz/tempo/pulls?state=open&per_page=100&page=${page}`,
        { headers: ghHeaders(token) },
      )
      if (!res.ok) break
      const prs = (await res.json()) as typeof allPrs
      if (prs.length === 0) break
      allPrs.push(...prs)
      if (prs.length < 100) break
      page++
    }

    const tipPrs = allPrs.filter((pr) => /tip/i.test(pr.title) || /tip/i.test(pr.body ?? ''))

    const results: TipRow[] = []

    for (const pr of tipPrs) {
      const filesRes = await fetch(
        `https://api.github.com/repos/tempoxyz/tempo/pulls/${pr.number}/files`,
        { headers: ghHeaders(token) },
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

      const content = await raw(pr.head.ref, tipFile.filename, token)
      results.push(
        parseTipRow(
          content,
          tipFile.filename.replace('tips/', ''),
          JSON.stringify({
            number: pr.number,
            url: pr.html_url,
            branch: pr.head.ref,
          }),
          '',
        ),
      )
    }

    return results
  } catch {
    return []
  }
}

/** Fetch all TIPs (merged + open PRs) from GitHub. */
export async function fetchAllTips(token?: string): Promise<TipRow[]> {
  const treeRes = await fetch(
    'https://api.github.com/repos/tempoxyz/tempo/git/trees/main?recursive=1',
    { headers: ghHeaders(token) },
  )
  if (!treeRes.ok) throw new Error(`GitHub API error: ${treeRes.status}`)

  const tree = (await treeRes.json()) as {
    tree: Array<{ path: string; type: string }>
  }
  const tipPaths = tree.tree.filter((f) => f.type === 'blob' && /^tips\/tip-\d+\.md$/.test(f.path))

  const [mergedDetails, prTips] = await Promise.all([
    Promise.all(
      tipPaths.map(async (f) => {
        const [content, createdAt] = await Promise.all([
          raw('main', f.path, token),
          firstCommitDate(f.path, token),
        ])
        return parseTipRow(content, f.path.replace('tips/', ''), '', createdAt)
      }),
    ),
    fetchPrTips(token),
  ])

  // Count how many times each number appears across merged + PR TIPs
  const countByNumber = new Map<string, number>()
  for (const d of mergedDetails) countByNumber.set(d.number, (countByNumber.get(d.number) ?? 0) + 1)
  for (const d of prTips) countByNumber.set(d.number, (countByNumber.get(d.number) ?? 0) + 1)

  // Append #N suffix only when a number has duplicates
  const seenByBase = new Map<string, number>()
  const prTipsResolved = prTips.map((d) => {
    const total = countByNumber.get(d.number) ?? 1
    if (total <= 1) return d
    const idx = (seenByBase.get(d.number) ?? 0) + 1
    seenByBase.set(d.number, idx)
    return { ...d, number: `${d.number}-${idx}` }
  })

  return [...mergedDetails, ...prTipsResolved]
}

/** Attempt sync with KV-based lock. Returns false if already syncing. */
export async function trySync(): Promise<boolean> {
  const { env } = await import('cloudflare:workers')
  const kv = env.TIPS_KV
  const lock = await kv.get('tips:syncing')
  if (lock) return false
  await kv.put('tips:syncing', '1', { expirationTtl: 120 })
  try {
    const token = (env as unknown as Record<string, unknown>).GITHUB_TOKEN as string | undefined
    const allTips = await fetchAllTips(token)
    await writeToD1(env.DB, allTips)
  } finally {
    await kv.delete('tips:syncing')
  }
  return true
}

async function writeToD1(db: D1Database, allTips: TipRow[]) {
  // Drop FTS triggers, clear tables, reinsert, recreate triggers
  await db.batch([
    db.prepare('DROP TRIGGER IF EXISTS tips_ai'),
    db.prepare('DROP TRIGGER IF EXISTS tips_ad'),
    db.prepare('DROP TRIGGER IF EXISTS tips_au'),
    db.prepare('DELETE FROM tips_fts'),
    db.prepare('DELETE FROM tips'),
  ])

  const stmt = db.prepare(
    'INSERT INTO tips (number, title, authors, status, abstract, content, filename, protocol_version, pr_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  await db.batch(
    allTips.map((d) =>
      stmt.bind(
        d.number,
        d.title,
        d.authors,
        d.status,
        d.abstract,
        d.content,
        d.filename,
        d.protocolVersion,
        d.prJson,
        d.createdAt,
      ),
    ),
  )

  // Rebuild FTS index and triggers
  await db.batch([
    db.prepare(
      `INSERT INTO tips_fts(rowid, number, title, authors, abstract, content)
       SELECT rowid, number, title, authors, abstract, content FROM tips`,
    ),
    db.prepare(
      `CREATE TRIGGER tips_ai AFTER INSERT ON tips BEGIN
         INSERT INTO tips_fts(rowid, number, title, authors, abstract, content)
         VALUES (new.rowid, new.number, new.title, new.authors, new.abstract, new.content);
       END`,
    ),
    db.prepare(
      `CREATE TRIGGER tips_ad AFTER DELETE ON tips BEGIN
         INSERT INTO tips_fts(tips_fts, rowid, number, title, authors, abstract, content)
         VALUES ('delete', old.rowid, old.number, old.title, old.authors, old.abstract, old.content);
       END`,
    ),
    db.prepare(
      `CREATE TRIGGER tips_au AFTER UPDATE ON tips BEGIN
         INSERT INTO tips_fts(tips_fts, rowid, number, title, authors, abstract, content)
         VALUES ('delete', old.rowid, old.number, old.title, old.authors, old.abstract, old.content);
         INSERT INTO tips_fts(rowid, number, title, authors, abstract, content)
         VALUES (new.rowid, new.number, new.title, new.authors, new.abstract, new.content);
       END`,
    ),
  ])
}
