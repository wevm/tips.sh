/** GitHub → D1 sync for TIPs. KV is only used for the sync lock. */

import { parseTitle, parseStatus, parseAbstract, parseAuthors } from './Tips'

async function getEnv() {
  const { env } = await import('cloudflare:workers')
  return env
}

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Tips',
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function raw(ref: string, path: string, token?: string): Promise<string> {
  const res = await fetch(`https://raw.githubusercontent.com/tempoxyz/tempo/${ref}/${path}`, {
    headers: ghHeaders(token),
  })
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.text()
}

type TipRow = {
  number: string
  title: string
  authors: string
  status: string
  abstract: string
  content: string
  filename: string
  protocolVersion: string
  prJson: string
}

/** Attempt sync with KV-based lock. Returns false if already syncing. */
export async function trySync(): Promise<boolean> {
  const env = await getEnv()
  const kv = env.TIPS_KV
  const lock = await kv.get('tips:syncing')
  if (lock) return false
  await kv.put('tips:syncing', '1', { expirationTtl: 120 })
  try {
    const token = (env as unknown as Record<string, unknown>).GITHUB_TOKEN as string | undefined
    await sync(env.DB, token)
  } finally {
    await kv.delete('tips:syncing')
  }
  return true
}

async function fetchPrTips(token?: string): Promise<TipRow[]> {
  try {
    // Paginate through all open PRs
    const allPrs: Array<{
      number: number
      title: string
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

    const tipPrs = allPrs.filter((pr) => /tip/i.test(pr.title) && /tip[-/]\d+/i.test(pr.head.ref))

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
      const { number, title } = parseTitle(content)
      const pvMatch = content.match(/\*\*Protocol Version\*\*[:\s]*(.+)/i)

      results.push({
        number,
        title,
        authors: parseAuthors(content),
        status: parseStatus(content),
        abstract: parseAbstract(content),
        content,
        filename: tipFile.filename.replace('tips/', ''),
        protocolVersion: pvMatch ? pvMatch[1].trim() : '',
        prJson: JSON.stringify({
          number: pr.number,
          url: pr.html_url,
          branch: pr.head.ref,
        }),
      })
    }

    return results
  } catch {
    return []
  }
}

async function sync(db: D1Database, token?: string) {
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
        const content = await raw('main', f.path, token)
        const { number, title } = parseTitle(content)
        const pvMatch = content.match(/\*\*Protocol Version\*\*[:\s]*(.+)/i)
        return {
          number,
          title,
          authors: parseAuthors(content),
          status: parseStatus(content),
          abstract: parseAbstract(content),
          content,
          filename: f.path.replace('tips/', ''),
          protocolVersion: pvMatch ? pvMatch[1].trim() : '',
          prJson: '',
        } satisfies TipRow
      }),
    ),
    fetchPrTips(token),
  ])

  // All PR tips get an incrementing super number per base TIP
  const prCountByBase = new Map<string, number>()
  const prTipsResolved = prTips.map((d) => {
    const count = (prCountByBase.get(d.number) ?? 0) + 1
    prCountByBase.set(d.number, count)
    return { ...d, number: `${d.number}#${count}` }
  })
  const allTips = [...mergedDetails, ...prTipsResolved]

  // Drop FTS triggers, clear tables, reinsert, recreate triggers
  await db.batch([
    db.prepare('DROP TRIGGER IF EXISTS tips_ai'),
    db.prepare('DROP TRIGGER IF EXISTS tips_ad'),
    db.prepare('DROP TRIGGER IF EXISTS tips_au'),
    db.prepare('DELETE FROM tips_fts'),
    db.prepare('DELETE FROM tips'),
  ])

  const stmt = db.prepare(
    'INSERT INTO tips (number, title, authors, status, abstract, content, filename, protocol_version, pr_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
