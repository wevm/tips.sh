/** Server functions for reading TIPs from D1. */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { Summary, Detail } from './Tips'

async function db() {
  const { env } = await import('cloudflare:workers')
  return env.DB
}

/** List all TIPs ordered by number. */
export const list = createServerFn().handler(async () => {
  const rows = await (await db())
    .prepare(
      'SELECT number, title, authors, status, abstract, filename, pr_json FROM tips ORDER BY CAST(number AS INTEGER)',
    )
    .all<{
      number: string
      title: string
      authors: string
      status: string
      abstract: string
      filename: string
      pr_json: string
    }>()
  return rows.results.map(
    (r) =>
      ({
        number: r.number,
        title: r.title,
        filename: r.filename,
        status: r.status,
        abstract: r.abstract,
        authors: r.authors,
        pr: r.pr_json ? JSON.parse(r.pr_json) : undefined,
      }) satisfies Summary,
  )
})

/** Get a single TIP by number. */
export const get = createServerFn({ method: 'POST' })
  .inputValidator(z.string())
  .handler(async ({ data: tipId }) => {
    const row = await (await db())
      .prepare(
        'SELECT number, title, authors, status, abstract, content, filename, protocol_version, pr_json FROM tips WHERE number = ?',
      )
      .bind(tipId)
      .first<{
        number: string
        title: string
        authors: string
        status: string
        abstract: string
        content: string
        filename: string
        protocol_version: string
        pr_json: string
      }>()
    if (!row) throw new Error(`TIP ${tipId} not found`)
    return {
      filename: row.filename,
      content: row.content,
      number: row.number,
      title: row.title,
      authors: row.authors,
      abstract: row.abstract,
      status: row.status,
      protocolVersion: row.protocol_version,
      pr: row.pr_json ? JSON.parse(row.pr_json) : undefined,
    } satisfies Detail
  })
