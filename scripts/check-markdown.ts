/** Verify a deployment against a locally generated, trusted inventory. */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { hash, type manifest } from '../src/lib/MarkdownExport'

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    manifest: { type: 'string' },
  },
})
if (!values.url || !values.manifest)
  throw new Error('Usage: pnpm check:markdown --url <origin> --manifest <local manifest>')
const origin = new URL(values.url)
const expected = JSON.parse(readFileSync(values.manifest, 'utf8')) as Awaited<
  ReturnType<typeof manifest>
>
if (!Array.isArray(expected) || !expected.length)
  throw new Error('Expected a nonempty local TIP manifest')

async function read(path: string, headers: HeadersInit = {}) {
  const response = await fetch(new URL(path, origin), {
    headers,
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`)
  if (!response.headers.get('content-type')?.includes('text/markdown'))
    throw new Error(`${path}: expected text/markdown`)
  const content = await response.text()
  if (/^\s*(?:<!doctype html|<html[\s>])/i.test(content)) throw new Error(`${path}: HTML response`)
  return content
}

const indexes = await Promise.all(['/llms.txt', '/index.md'].map((path) => read(path)))
// Bound requests rather than starting one connection per TIP.
for (let offset = 0; offset < expected.length; offset += 5) {
  await Promise.all(
    expected.slice(offset, offset + 5).map(async (entry) => {
      for (const index of indexes) {
        if (!index.includes(`https://tips.sh${entry.path})`))
          throw new Error(`${entry.id}: missing from index`)
      }
      const explicit = await read(entry.path, { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' })
      const negotiated = await read(`/${encodeURIComponent(entry.id)}`, {
        Accept: 'text/markdown',
        'User-Agent': 'Mozilla/5.0',
      })
      if ((await hash(explicit)) !== entry.sha256 || (await hash(negotiated)) !== entry.sha256) {
        throw new Error(`${entry.id}: deployed content differs from the expected sync`)
      }
    }),
  )
}
console.log(
  `Verified ${expected.length} TIPs: explicit and negotiated Markdown, hashes, and discovery`,
)
