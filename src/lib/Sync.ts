/** GitHub → D1 sync for TIPs. KV stores the sync lock and GitHub metadata caches. */

import * as Tips from './Tips'

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Tips',
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

type GithubFetch = (url: string) => Promise<Response>

function createGithubFetch(token?: string): GithubFetch {
  let activeToken = token
  return async (url) => {
    const requestToken = activeToken
    const response = await fetch(url, { headers: ghHeaders(requestToken) })
    if (response.status !== 401 || !requestToken) return response

    activeToken = undefined
    console.warn('[sync] GitHub token rejected; retrying public requests without authentication')
    return fetch(url, { headers: ghHeaders() })
  }
}

async function firstCommitDate(path: string, githubFetch: GithubFetch): Promise<string> {
  try {
    const res = await githubFetch(
      `https://api.github.com/repos/tempoxyz/tempo/commits?path=${encodeURIComponent(path)}&per_page=100&page=1`,
    )
    if (!res.ok) return new Date().toISOString().slice(0, 10)
    // GitHub returns newest first by default; get the Link header for last page
    const link = res.headers.get('link')
    if (link) {
      const lastMatch = link.match(/<([^>]+)>;\s*rel="last"/)
      if (lastMatch) {
        const lastRes = await githubFetch(lastMatch[1])
        if (lastRes.ok) {
          const commits = (await lastRes.json()) as Array<{
            commit: { committer: { date: string } }
          }>
          if (commits.length > 0)
            return commits[commits.length - 1].commit.committer.date.slice(0, 10)
        }
      }
    }
    // Single page — take the last (oldest) commit
    const commits = (await res.json()) as Array<{ commit: { committer: { date: string } } }>
    if (commits.length > 0) return commits[commits.length - 1].commit.committer.date.slice(0, 10)
  } catch {}
  return new Date().toISOString().slice(0, 10)
}

/** Cached creation date for a merged tip file. Once known, it doesn't change. */
async function cachedFirstCommitDate(
  path: string,
  githubFetch: GithubFetch,
  kv?: KVNamespace,
): Promise<string> {
  if (!kv) return firstCommitDate(path, githubFetch)
  const cacheKey = `tips:created_at:${path}`
  const cached = await kv.get(cacheKey)
  if (cached) return cached
  const date = await firstCommitDate(path, githubFetch)
  // Cache permanently; merged file creation dates don't change.
  await kv.put(cacheKey, date)
  return date
}

async function raw(repo: string, ref: string, path: string, githubFetch: GithubFetch) {
  const res = await githubFetch(`https://raw.githubusercontent.com/${repo}/${ref}/${path}`)
  if (!res.ok) throw new Error(`Failed to fetch ${path}@${repo}/${ref}: ${res.status}`)
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

type CachedPrTip = {
  updatedAt: string
  row: TipRow | null
}

type CachedMergedTip = {
  sha: string
  row: TipRow
}

type TipPath = {
  path: string
  sha: string
}

// A TIP can require raw content plus two commit-history pages. Keep enough
// headroom for the tree request and one unauthenticated retry.
const mergedCacheBatchSize = 15
const prCacheTtl = 7 * 24 * 60 * 60

function parseTipRow(content: string, filename: string, prJson: string, createdAt: string): TipRow {
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

async function fetchMergedTip(
  tipPath: TipPath,
  githubFetch: GithubFetch,
  kv?: KVNamespace,
): Promise<TipRow> {
  const [content, createdAt] = await Promise.all([
    raw('tempoxyz/tempo', 'main', tipPath.path, githubFetch),
    cachedFirstCommitDate(tipPath.path, githubFetch, kv),
  ])
  return parseTipRow(content, tipPath.path.replace('tips/', ''), '', createdAt)
}

async function fetchPrTips(githubFetch: GithubFetch, kv?: KVNamespace): Promise<TipRow[]> {
  // Paginate through all open PRs
  const allPrs: Array<{
    number: number
    title: string
    body: string | null
    html_url: string
    created_at: string
    updated_at: string
    head: { ref: string; repo: { full_name: string } | null }
  }> = []
  let page = 1
  while (true) {
    const res = await githubFetch(
      `https://api.github.com/repos/tempoxyz/tempo/pulls?state=open&per_page=100&page=${page}`,
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

  // Process each PR in isolation: a single failure must not discard the
  // entire list (e.g. fork PR with deleted branch, transient 5xx, etc.).
  for (const pr of tipPrs) {
    try {
      const cacheKey = `tips:pr:${pr.number}`
      const cached = await kv?.get<CachedPrTip>(cacheKey, 'json')
      if (cached?.updatedAt === pr.updated_at) {
        if (cached.row) results.push(cached.row)
        continue
      }

      const filesRes = await githubFetch(
        `https://api.github.com/repos/tempoxyz/tempo/pulls/${pr.number}/files`,
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
      if (!tipFile) {
        await kv?.put(cacheKey, JSON.stringify({ updatedAt: pr.updated_at, row: null }), {
          expirationTtl: prCacheTtl,
        })
        continue
      }

      // Fork PRs live on `<owner>/<repo>`, not `tempoxyz/tempo`.
      const headRepo = pr.head.repo?.full_name ?? 'tempoxyz/tempo'
      const content = await raw(headRepo, pr.head.ref, tipFile.filename, githubFetch)
      const row = parseTipRow(
        content,
        tipFile.filename.replace('tips/', ''),
        JSON.stringify({
          number: pr.number,
          url: pr.html_url,
          branch: pr.head.ref,
        }),
        pr.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      )
      results.push(row)
      await kv?.put(cacheKey, JSON.stringify({ updatedAt: pr.updated_at, row }), {
        expirationTtl: prCacheTtl,
      })
    } catch (e) {
      console.warn(`[sync] skipping PR #${pr.number}: ${(e as Error).message}`)
    }
  }

  return results
}

/** Fetch all TIPs (merged + open PRs) from GitHub. */
export async function fetchAllTips(token?: string): Promise<TipRow[]>
export async function fetchAllTips(
  token: string | undefined,
  kv: KVNamespace,
): Promise<TipRow[] | undefined>
export async function fetchAllTips(
  token?: string,
  kv?: KVNamespace,
): Promise<TipRow[] | undefined> {
  const githubFetch = createGithubFetch(token)
  const treeRes = await githubFetch(
    'https://api.github.com/repos/tempoxyz/tempo/git/trees/main?recursive=1',
  )
  if (!treeRes.ok) throw new Error(`GitHub API error: ${treeRes.status}`)

  const tree = (await treeRes.json()) as {
    tree: Array<{ path: string; type: string; sha: string }>
  }
  const tipPaths = tree.tree.filter((f) => f.type === 'blob' && /^tips\/tip-\d+\.md$/.test(f.path))

  let mergedDetails: TipRow[]
  if (kv) {
    const cachedTips = await Promise.all(
      tipPaths.map(async (tipPath) => ({
        tipPath,
        cached: await kv.get<CachedMergedTip>(`tips:merged:${tipPath.path}`, 'json'),
      })),
    )
    const uncachedTips = cachedTips.filter(({ tipPath, cached }) => cached?.sha !== tipPath.sha)
    if (uncachedTips.length > 0) {
      await Promise.all(
        uncachedTips.slice(0, mergedCacheBatchSize).map(async ({ tipPath }) => {
          const row = await fetchMergedTip(tipPath, githubFetch, kv)
          await kv.put(`tips:merged:${tipPath.path}`, JSON.stringify({ sha: tipPath.sha, row }))
        }),
      )
      return
    }
    mergedDetails = cachedTips.map(({ cached }) => cached!.row)
  } else {
    mergedDetails = await Promise.all(
      tipPaths.map((tipPath) => fetchMergedTip(tipPath, githubFetch)),
    )
  }

  const prTips = await fetchPrTips(githubFetch, kv)

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
    const allTips = await fetchAllTips(token, kv)
    if (allTips) await writeToD1(env.DB, allTips)
  } finally {
    await kv.delete('tips:syncing')
  }
  return true
}

async function writeToD1(db: D1Database, allTips: TipRow[]) {
  // Clear content table and reinsert all rows
  await db.batch([db.prepare('DELETE FROM tips')])

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

  // Rebuild FTS index from content table
  await db.batch([db.prepare(`INSERT INTO tips_fts(tips_fts) VALUES ('rebuild')`)])
}
