import { describe, expect, it } from 'vite-plus/test'
import { handle, shouldServeMarkdown, vary } from './MarkdownHttp'
import * as Export from './MarkdownExport'
import type { Row } from './TipStore'

const rows: Row[] = ['0000', '1034', '1034-1', 'configurable-accounts', 'v2.0-accounts'].map(
  (number) => ({
    number,
    title: `Proposal ${number}`,
    filename: `tip-${number.split('-')[0]}.md`,
    content: `---\nid: TIP-${number}\ntitle: Proposal ${number}\n---\n\n# TIP-${number}\n\nComplete specification.\n`,
    status: 'Draft',
    authors: 'Author',
    abstract: '',
    protocol_version: '',
    created_at: '2026-01-01',
    pr_json: number.includes('-')
      ? JSON.stringify({ number: 42, url: 'https://github.com/tempoxyz/tempo/pull/42' })
      : '',
  }),
)

function database(inventory = rows) {
  return {
    prepare() {
      return {
        bind(id: string) {
          return {
            async first() {
              return inventory.find((tip) => tip.number === id) ?? null
            },
          }
        },
        async all() {
          return { results: inventory }
        },
      }
    },
  } as unknown as D1Database
}

function request(path: string, headers: HeadersInit = {}, method = 'GET') {
  return new Request(`https://tips.sh${path}`, { method, headers })
}

describe('Markdown HTTP', () => {
  it('serves every inventory entry explicitly and by negotiation with identical content', async () => {
    const manifest = await Export.manifest(rows)
    for (const entry of manifest) {
      for (const req of [
        request(entry.path, { Accept: 'text/html', 'User-Agent': 'Slackbot' }),
        request(`/${entry.id}`, { Accept: 'text/markdown', 'User-Agent': 'Mozilla/5.0' }),
        request(`/${entry.id}/`, { 'User-Agent': 'curl/8' }),
      ]) {
        const response = (await handle(req, async () => database()))!
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
        expect(await Export.hash(await response.text())).toBe(entry.sha256)
      }
    }
  })

  it('discovers every variant in explicit indexes and the negotiated root', async () => {
    for (const path of ['/llms.txt', '/index.md', '/']) {
      const response = (await handle(request(path, { Accept: 'text/markdown' }), async () =>
        database(),
      ))!
      const body = await response.text()
      for (const row of rows)
        expect(body).toContain(`https://tips.sh${Export.pagePath(row.number)})`)
      expect(body).toContain('[Proposed in PR #42](https://github.com/tempoxyz/tempo/pull/42)')
    }
  })

  it('keeps HTML, preview bots, framework POSTs, and assets out of the database', async () => {
    const fail = async (): Promise<D1Database> => {
      throw new Error('unexpected database read')
    }
    for (const req of [
      request('/1034', { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' }),
      request('/1034', { Accept: '*/*', 'User-Agent': 'Slackbot' }),
      request('/1034', { 'User-Agent': 'Googlebot' }),
      request('/1034', { Accept: 'text/markdown' }, 'POST'),
      request('/1034.md', {}, 'POST'),
      request('/og/1034.png', { Accept: 'text/markdown' }),
    ])
      expect(await handle(req, fail)).toBeUndefined()
  })

  it('returns explicit missing and database failure responses instead of HTML', async () => {
    for (const path of ['/missing.md', '/missing']) {
      const response = (await handle(request(path, { Accept: 'text/markdown' }), async () =>
        database(),
      ))!
      expect(response.status).toBe(404)
      expect(await response.text()).toBe('TIP not found\n')
    }
    const response = (await handle(request('/1034.md'), async () => {
      throw new Error('database offline')
    }))!
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('Markdown unavailable\n')
  })

  it('returns matching HEAD headers without a body', async () => {
    const get = (await handle(request('/1034-1.md'), async () => database()))!
    const head = (await handle(request('/1034-1.md', {}, 'HEAD'), async () => database()))!
    expect([...head.headers]).toEqual([...get.headers])
    expect(head.status).toBe(get.status)
    expect(await head.text()).toBe('')
  })

  it('varies both representations and prevents shared caching of negotiated URLs', async () => {
    const html = vary(
      new Response('<html></html>', {
        headers: { Vary: 'Accept-Encoding', 'Cache-Control': 'public' },
      }),
    )
    expect(html.headers.get('vary')).toBe('Accept-Encoding, Accept, User-Agent')
    expect(html.headers.get('cache-control')).toBe('private, no-store')
    const markdown = (await handle(request('/1034', { Accept: 'text/markdown' }), async () =>
      database(),
    ))!
    expect(markdown.headers.get('vary')).toBe('Accept, User-Agent')
    expect(markdown.headers.get('cache-control')).toBe('private, no-store')
    const explicit = (await handle(request('/1034.md'), async () => database()))!
    expect(explicit.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=300')
  })
})

describe('content negotiation', () => {
  it.each([
    ['text/markdown', 'Mozilla/5.0', true],
    ['TEXT/MARKDOWN; charset=utf-8', 'Mozilla/5.0', true],
    ['text/html;q=0.5, text/markdown;q=0.9', 'Mozilla/5.0', true],
    ['text/html, text/markdown;q=0.5', 'curl/8', false],
    ['text/markdown;q=0, */*;q=1', 'curl/8', false],
    ['text/markdown;q=invalid', 'ClaudeBot', false],
    ['text/html', 'ClaudeBot', false],
    ['*/*', 'curl/8', true],
    ['', 'ClaudeBot', true],
    ['*/*;q=0', 'curl/8', false],
    ['text/markdown', 'Twitterbot', true],
    ['text/markdown', 'Googlebot', true],
    ['*/*', 'Twitterbot', false],
    ['*/*', 'Mozilla/5.0', false],
  ])('Accept %s, UA %s → Markdown %s', (accept, ua, expected) => {
    expect(shouldServeMarkdown(request('/1034', { Accept: accept, 'User-Agent': ua }))).toBe(
      expected,
    )
  })
})
