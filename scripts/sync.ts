/** Standalone sync script — run with: npx tsx scripts/sync.ts */

import { parseTitle, parseStatus, parseAbstract, parseAuthors } from '../src/lib/Tips'

const token = process.env.GITHUB_TOKEN
const ghHeaders: Record<string, string> = {
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'Tips',
}
if (token) ghHeaders.Authorization = `Bearer ${token}`

async function raw(ref: string, path: string): Promise<string> {
  const res = await fetch(`https://raw.githubusercontent.com/tempoxyz/tempo/${ref}/${path}`, {
    headers: ghHeaders,
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

async function fetchPrTips(): Promise<TipRow[]> {
  const res = await fetch(
    'https://api.github.com/repos/tempoxyz/tempo/pulls?state=open&per_page=50',
    { headers: ghHeaders },
  )
  if (!res.ok) {
    console.warn('PR API failed:', res.status)
    return []
  }

  const prs = (await res.json()) as Array<{
    number: number
    title: string
    html_url: string
    head: { ref: string }
  }>

  const tipPrs = prs.filter((pr) => /tip/i.test(pr.title) && /tip[-/]\d+/i.test(pr.head.ref))
  console.log(`Found ${tipPrs.length} TIP PRs`)

  const results: TipRow[] = []
  for (const pr of tipPrs) {
    const filesRes = await fetch(
      `https://api.github.com/repos/tempoxyz/tempo/pulls/${pr.number}/files`,
      { headers: ghHeaders },
    )
    if (!filesRes.ok) continue
    const files = (await filesRes.json()) as Array<{ filename: string; status: string }>
    const tipFile = files.find(
      (f) =>
        f.filename.startsWith('tips/tip-') &&
        f.filename.endsWith('.md') &&
        (f.status === 'added' || f.status === 'modified'),
    )
    if (!tipFile) continue

    const content = await raw(pr.head.ref, tipFile.filename)
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
      prJson: JSON.stringify({ number: pr.number, url: pr.html_url, branch: pr.head.ref }),
    })
    console.log(`  PR #${pr.number}: TIP-${number} "${title}"`)
  }
  return results
}

async function main() {
  console.log('Fetching tree...')
  const treeRes = await fetch(
    'https://api.github.com/repos/tempoxyz/tempo/git/trees/main?recursive=1',
    { headers: ghHeaders },
  )
  if (!treeRes.ok) throw new Error(`GitHub API error: ${treeRes.status}`)

  const tree = (await treeRes.json()) as { tree: Array<{ path: string; type: string }> }
  const tipPaths = tree.tree.filter((f) => f.type === 'blob' && /^tips\/tip-\d+\.md$/.test(f.path))
  console.log(`Found ${tipPaths.length} merged TIPs`)

  const [mergedDetails, prTips] = await Promise.all([
    Promise.all(
      tipPaths.map(async (f) => {
        const content = await raw('main', f.path)
        const { number, title } = parseTitle(content)
        const pvMatch = content.match(/\*\*Protocol Version\*\*[:\s]*(.+)/i)
        console.log(`  TIP-${number}: "${title}"`)
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
    fetchPrTips(),
  ])

  const prCountByBase = new Map<string, number>()
  const prTipsResolved = prTips.map((d) => {
    const count = (prCountByBase.get(d.number) ?? 0) + 1
    prCountByBase.set(d.number, count)
    return { ...d, number: `${d.number}#${count}` }
  })
  const allTips = [...mergedDetails, ...prTipsResolved]
  console.log(
    `\nTotal: ${allTips.length} TIPs (${mergedDetails.length} merged + ${prTipsResolved.length} PR)`,
  )

  // Write SQL for wrangler d1 execute
  const sqlStatements: string[] = [
    'DROP TRIGGER IF EXISTS tips_ai;',
    'DROP TRIGGER IF EXISTS tips_ad;',
    'DROP TRIGGER IF EXISTS tips_au;',
    'DELETE FROM tips_fts;',
    'DELETE FROM tips;',
  ]

  for (const d of allTips) {
    const esc = (s: string) => s.replace(/'/g, "''")
    sqlStatements.push(
      `INSERT INTO tips (number, title, authors, status, abstract, content, filename, protocol_version, pr_json) VALUES ('${esc(d.number)}', '${esc(d.title)}', '${esc(d.authors)}', '${esc(d.status)}', '${esc(d.abstract)}', '${esc(d.content)}', '${esc(d.filename)}', '${esc(d.protocolVersion)}', '${esc(d.prJson)}');`,
    )
  }

  sqlStatements.push(
    `INSERT INTO tips_fts(rowid, number, title, authors, abstract, content) SELECT rowid, number, title, authors, abstract, content FROM tips;`,
    `CREATE TRIGGER tips_ai AFTER INSERT ON tips BEGIN INSERT INTO tips_fts(rowid, number, title, authors, abstract, content) VALUES (new.rowid, new.number, new.title, new.authors, new.abstract, new.content); END;`,
    `CREATE TRIGGER tips_ad AFTER DELETE ON tips BEGIN INSERT INTO tips_fts(tips_fts, rowid, number, title, authors, abstract, content) VALUES ('delete', old.rowid, old.number, old.title, old.authors, old.abstract, old.content); END;`,
    `CREATE TRIGGER tips_au AFTER UPDATE ON tips BEGIN INSERT INTO tips_fts(tips_fts, rowid, number, title, authors, abstract, content) VALUES ('delete', old.rowid, old.number, old.title, old.authors, old.abstract, old.content); INSERT INTO tips_fts(rowid, number, title, authors, abstract, content) VALUES (new.rowid, new.number, new.title, new.authors, new.abstract, new.content); END;`,
  )

  // Write to temp file and execute via wrangler
  const { writeFileSync } = await import('fs')
  const sqlFile = '/tmp/tips-sync.sql'
  writeFileSync(sqlFile, sqlStatements.join('\n'))
  console.log(`\nWrote ${sqlStatements.length} SQL statements to ${sqlFile}`)

  // Execute locally
  const { execSync } = await import('child_process')
  console.log('Executing on local D1...')
  execSync(`npx wrangler d1 execute tips --local --file=${sqlFile}`, {
    cwd: process.cwd(),
    stdio: 'inherit',
  })

  console.log('\n✅ Sync complete!')
}

main().catch((e) => {
  console.error('❌ Sync failed:', e)
  process.exit(1)
})
