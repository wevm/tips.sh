/** Server functions for reading TIPs from D1. */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { Summary, Detail } from './Tips'
import * as Markdown from './Markdown'

async function db() {
  const { env } = await import('cloudflare:workers')
  return env.DB
}

async function kv() {
  const { env } = await import('cloudflare:workers')
  return env.TIPS_KV
}

async function sha256(content: string): Promise<string> {
  const data = new TextEncoder().encode(content)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** List all TIPs ordered by number. */
export const list = createServerFn().handler(async () => {
  const rows = await (
    await db()
  )
    .prepare(
      `SELECT number, title, status, filename, pr_json FROM tips ORDER BY CASE WHEN number GLOB '[0-9]*' THEN 0 ELSE 1 END, CAST(number AS INTEGER)`,
    )
    .all<{
      number: string
      title: string
      status: string
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
        pr: r.pr_json ? JSON.parse(r.pr_json) : undefined,
      }) satisfies Summary,
  )
})

/** Get a single TIP by number. */
export const get = createServerFn({ method: 'POST' })
  .inputValidator(z.string())
  .handler(async ({ data: tipId }) => {
    const row = await (
      await db()
    )
      .prepare(
        'SELECT number, title, authors, status, abstract, content, filename, protocol_version, pr_json, created_at FROM tips WHERE number = ?',
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
        created_at: string
      }>()
    if (!row) throw new Error(`TIP ${tipId} not found`)

    const contentHash = await sha256(row.content)
    const cacheKey = `tip:html:${row.number}:${contentHash}`
    const kvStore = await kv()

    let html = await kvStore.get(cacheKey)
    if (!html) {
      const bodyMarkdown = row.content
        .replace(/^---\n[\s\S]*?\n---\n*/, '')
        .replace(/^# .+\n+/, '')
        .replace(/^\*\*Protocol Version\*\*.*\n+/, '')
        .replace(/^---\n+/, '')
      html = await Markdown.render(bodyMarkdown)
      await kvStore.put(cacheKey, html, { expirationTtl: 7 * 24 * 60 * 60 })
    }

    return {
      filename: row.filename,
      content: row.content,
      html,
      number: row.number,
      title: row.title,
      authors: row.authors,
      abstract: row.abstract,
      status: row.status,
      protocolVersion: row.protocol_version,
      createdAt: row.created_at,
      pr: row.pr_json ? JSON.parse(row.pr_json) : undefined,
    } satisfies Detail
  })
