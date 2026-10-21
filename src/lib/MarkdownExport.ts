/** Export the authored content, resolving links without going through HTML. */
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkFrontmatter from 'remark-frontmatter'
import remarkStringify from 'remark-stringify'
import { visit } from 'unist-util-visit'
import type { Summary } from './TipStore'

export type Tip = Summary & { content: string }

export function pagePath(id: string) {
  return `/${encodeURIComponent(id)}.md`
}

export function render(tip: Tip, inventory: Summary[]): string {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkFrontmatter)
    .use(remarkStringify)
  const tree = processor.parse(tip.content)
  const pr = tip.pr_json ? (JSON.parse(tip.pr_json) as { number: number; url: string }) : undefined
  // Resolve source-relative assets to the correct proposal, including fork PRs.
  const source = pr
    ? `https://github.com/tempoxyz/tempo/raw/refs/pull/${pr.number}/head/tips/${tip.filename}`
    : `https://github.com/tempoxyz/tempo/raw/refs/heads/main/tips/${tip.filename}`

  const resolve = (url: string) => {
    if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return url
    const file = url.match(/^(?:\.\/|\/)?(tip-[^/?#]+\.md)([?#].*)?$/)
    if (file) {
      const candidates = inventory.filter((entry) => entry.filename === file[1])
      // Prefer the matching PR's revision, then the canonical merged proposal.
      const target =
        candidates.find(
          (entry) => pr && entry.pr_json && JSON.parse(entry.pr_json).number === pr.number,
        ) ??
        candidates.find((entry) => !entry.pr_json) ??
        candidates[0]
      if (target) return `https://tips.sh${pagePath(target.number)}${file[2] ?? ''}`
    }
    if (url.startsWith('/') && !file) return new URL(url, 'https://tips.sh').href
    return new URL(url, source).href
  }

  visit(tree, (node) => {
    if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
      node.url = resolve(node.url)
    }
    if (node.type === 'html') {
      node.value = node.value.replace(
        /\b(href|src)=(['"])(.*?)\2/gi,
        (_match, attr, quote, url) => `${attr}=${quote}${resolve(url)}${quote}`,
      )
    }
  })
  return processor.stringify(tree)
}

export function index(tips: Summary[]) {
  return [
    '# Tempo Improvement Proposals',
    '',
    '> Each link serves the complete TIP as Markdown. Proposal variants are separate entries.',
    '',
    ...tips.map((tip) => {
      const label = `TIP-${tip.number}: ${tip.title}`.replace(/[\\[\]]/g, '\\$&')
      const pr = tip.pr_json
        ? (JSON.parse(tip.pr_json) as { number: number; url: string })
        : undefined
      return `- [${label}](https://tips.sh${pagePath(tip.number)}) (${tip.status})${pr ? ` — [Proposed in PR #${pr.number}](${pr.url})` : ''}`
    }),
    '',
  ].join('\n')
}

export async function hash(content: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function manifest(tips: Tip[]) {
  return Promise.all(
    tips.map(async (tip) => ({
      id: tip.number,
      path: pagePath(tip.number),
      sha256: await hash(render(tip, tips)),
    })),
  )
}
