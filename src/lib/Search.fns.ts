/** Server function for full-text search over TIPs using D1 FTS5. */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { Result } from './Search'

/** Search TIPs with FTS5, supporting exact number shortcuts and prefix matching. */
export const query = createServerFn({ method: 'POST' })
  .inputValidator(z.string())
  .handler(async ({ data: q }) => {
    const trimmed = q.trim()
    if (!trimmed) return [] as Result[]

    const { env } = await import('cloudflare:workers')
    const db = env.DB

    // Exact TIP number shortcut (e.g. "tip-123", "123")
    const numMatch = trimmed.match(/^(?:tip-?)?(\d+)$/i)
    if (numMatch) {
      const row = await db
        .prepare('SELECT number, title, authors, status FROM tips WHERE number = ?')
        .bind(numMatch[1])
        .first<{ number: string; title: string; authors: string; status: string }>()
      if (row)
        return [
          { number: row.number, title: row.title, authors: row.authors, status: row.status, snippet: '', rank: 0 },
        ] as Result[]
    }

    // FTS5 query with prefix matching
    const ftsQuery = trimmed
      .split(/\s+/)
      .map((term) => `"${term}"*`)
      .join(' ')

    const rows = await db
      .prepare(
        `SELECT t.number, t.title, t.authors, t.status,
                snippet(tips_fts, 4, '<mark>', '</mark>', '…', 32) as snippet,
                bm25(tips_fts, 10, 6, 3, 2, 1) as rank
         FROM tips_fts
         JOIN tips t ON t.rowid = tips_fts.rowid
         WHERE tips_fts MATCH ?
         ORDER BY rank
         LIMIT 20`,
      )
      .bind(ftsQuery)
      .all<Result>()

    return rows.results
  })
