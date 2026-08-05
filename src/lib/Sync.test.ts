import { describe, expect, it } from 'vite-plus/test'
import { fetchAllTips } from './Sync'

const mergedTip = `# TIP-1000: Merged TIP

**Status** Draft

## Abstract
Merged abstract
`

const proposedTip = `# TIP-1001: Proposed TIP

**Status** Draft

## Abstract
Proposed abstract
`

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('fetchAllTips', () => {
  it('reuses cached PR inspections until a PR changes', async () => {
    const originalFetch = globalThis.fetch
    const cache = new Map<string, string>()
    const apiRequests: string[] = []
    let proposedTipUpdatedAt = '2026-08-01T00:00:00Z'

    const kv = {
      async get(key: string, type?: string) {
        const value = cache.get(key)
        if (!value) return null
        return type === 'json' ? JSON.parse(value) : value
      },
      async put(key: string, value: string) {
        cache.set(key, value)
      },
    } as unknown as KVNamespace

    globalThis.fetch = async (input) => {
      const url = input instanceof Request ? input.url : input.toString()
      if (url.startsWith('https://api.github.com/')) apiRequests.push(url)

      if (url.includes('/git/trees/main?recursive=1')) {
        return json({ tree: [{ path: 'tips/tip-1000.md', type: 'blob' }] })
      }
      if (url.includes('/commits?')) {
        return json([{ commit: { committer: { date: '2026-01-01T00:00:00Z' } } }])
      }
      if (url.includes('/pulls?')) {
        return json([
          {
            number: 1,
            title: 'feat(tip-1001): proposed TIP',
            body: null,
            html_url: 'https://github.com/tempoxyz/tempo/pull/1',
            created_at: '2026-08-01T00:00:00Z',
            updated_at: proposedTipUpdatedAt,
            head: { ref: 'tip-1001', repo: { full_name: 'tempoxyz/tempo' } },
          },
          {
            number: 2,
            title: 'refactor: preserve startup tip',
            body: null,
            html_url: 'https://github.com/tempoxyz/tempo/pull/2',
            created_at: '2026-08-01T00:00:00Z',
            updated_at: '2026-08-01T00:00:00Z',
            head: { ref: 'startup-tip', repo: { full_name: 'tempoxyz/tempo' } },
          },
        ])
      }
      if (url.endsWith('/pulls/1/files')) {
        return json([{ filename: 'tips/tip-1001.md', status: 'added' }])
      }
      if (url.endsWith('/pulls/2/files')) {
        return json([{ filename: 'crates/consensus/src/tip.rs', status: 'modified' }])
      }
      if (url.includes('/tempoxyz/tempo/main/tips/tip-1000.md')) {
        return new Response(mergedTip)
      }
      if (url.includes('/tempoxyz/tempo/tip-1001/tips/tip-1001.md')) {
        return new Response(proposedTip)
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    try {
      const first = await fetchAllTips(undefined, kv)
      expect(first.map((tip) => tip.number)).toEqual(['1000', '1001'])
      expect(apiRequests).toHaveLength(5)
      expect(apiRequests.some((url) => url.includes('per_page=100'))).toBe(true)

      apiRequests.length = 0
      const second = await fetchAllTips(undefined, kv)
      expect(second.map((tip) => tip.number)).toEqual(['1000', '1001'])
      expect(apiRequests).toHaveLength(2)
      expect(
        apiRequests.every((url) => url.includes('/git/trees/') || url.includes('/pulls?')),
      ).toBe(true)

      apiRequests.length = 0
      proposedTipUpdatedAt = '2026-08-02T00:00:00Z'
      const third = await fetchAllTips(undefined, kv)
      expect(third.map((tip) => tip.number)).toEqual(['1000', '1001'])
      expect(apiRequests).toHaveLength(3)
      expect(apiRequests.some((url) => url.endsWith('/pulls/1/files'))).toBe(true)
      expect(apiRequests.some((url) => url.endsWith('/pulls/2/files'))).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
