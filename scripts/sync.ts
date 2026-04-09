/** Standalone sync script — run with: npx tsx scripts/sync.ts */

import * as Sync from '../src/lib/Sync'

async function main() {
  const token = process.env.GITHUB_TOKEN
  console.log('Fetching TIPs...')
  const allTips = await Sync.fetchAllTips(token)

  const merged = allTips.filter((t) => !t.prJson)
  const prs = allTips.filter((t) => t.prJson)
  for (const t of merged) console.log(`  TIP-${t.number}: "${t.title}"`)
  for (const t of prs) console.log(`  PR TIP-${t.number}: "${t.title}"`)
  console.log(`\nTotal: ${allTips.length} TIPs (${merged.length} merged + ${prs.length} PR)`)

  // Write SQL for wrangler d1 execute
  const esc = (s: string) => s.replace(/'/g, "''")
  const sqlStatements: string[] = [
    'DROP TRIGGER IF EXISTS tips_ai;',
    'DROP TRIGGER IF EXISTS tips_ad;',
    'DROP TRIGGER IF EXISTS tips_au;',
    'DELETE FROM tips_fts;',
    'DELETE FROM tips;',
  ]

  for (const d of allTips) {
    sqlStatements.push(
      `INSERT INTO tips (number, title, authors, status, abstract, content, filename, protocol_version, pr_json, created_at) VALUES ('${esc(d.number)}', '${esc(d.title)}', '${esc(d.authors)}', '${esc(d.status)}', '${esc(d.abstract)}', '${esc(d.content)}', '${esc(d.filename)}', '${esc(d.protocolVersion)}', '${esc(d.prJson)}', '${esc(d.createdAt)}');`,
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

  const { execSync } = await import('child_process')
  const remote = process.argv.includes('--remote')
  console.log(`Executing on ${remote ? 'remote' : 'local'} D1...`)
  execSync(`npx wrangler d1 execute tips ${remote ? '--remote' : '--local'} --file=${sqlFile}`, {
    cwd: process.cwd(),
    stdio: 'inherit',
  })

  console.log('\n✅ Sync complete!')
}

main().catch((e) => {
  console.error('❌ Sync failed:', e)
  process.exit(1)
})
