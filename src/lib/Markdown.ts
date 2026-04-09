/** Unified pipeline: remark → rehype with Shiki (JS engine) and KaTeX. */

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'
import { createHighlighter, type Highlighter } from 'shiki'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import type { Element, Text } from 'hast'

let highlighterPromise: Promise<Highlighter> | null = null
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light'],
      langs: [
        'solidity',
        'typescript',
        'javascript',
        'rust',
        'json',
        'bash',
        'toml',
        'yaml',
        'python',
        'go',
      ],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return highlighterPromise
}

function rehypeShiki() {
  return async (tree: import('hast').Root) => {
    const highlighter = await getHighlighter()
    const { visit } = await import('unist-util-visit')

    visit(tree, 'element', (node: Element, index, parent) => {
      if (
        node.tagName !== 'pre' ||
        !node.children[0] ||
        (node.children[0] as Element).tagName !== 'code'
      )
        return

      const codeEl = node.children[0] as Element
      const className = ((codeEl.properties?.className as string[]) ?? []).find(
        (c) => c.startsWith('language-'),
      )
      const lang = className?.replace('language-', '') ?? 'text'
      const code = (codeEl.children[0] as Text)?.value ?? ''

      const loadedLangs = highlighter.getLoadedLanguages()
      const resolvedLang = loadedLangs.includes(lang) ? lang : 'text'

      const highlighted = highlighter.codeToHtml(code, {
        lang: resolvedLang,
        theme: 'github-light',
      })

      if (parent && typeof index === 'number') {
        ;(parent.children as unknown[])[index] = {
          type: 'raw',
          value: highlighted,
        }
      }
    })
  }
}

function rehypeHeadingIds() {
  return async (tree: import('hast').Root) => {
    const { visit } = await import('unist-util-visit')
    visit(tree, 'element', (node: Element) => {
      if (!/^h[1-6]$/.test(node.tagName)) return
      const text = getTextContent(node)
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
      node.properties = node.properties ?? {}
      node.properties.id = id
    })
  }
}

function getTextContent(node: Element): string {
  let text = ''
  for (const child of node.children) {
    if (child.type === 'text') text += (child as Text).value
    else if (child.type === 'element') text += getTextContent(child as Element)
  }
  return text
}

function isMathExpression(code: string): boolean {
  if (!code.includes('×')) return false
  if (/[{};]|==|!=|=>|->|&&|\|\||\./.test(code)) return false
  if (!/\d/.test(code)) return false
  return true
}

function codeToLatex(code: string): string {
  return code
    .replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (w) => {
      return `\\text{${w.replace(/_/g, '\\_')}}`
    })
    .replace(/×/g, ' \\times ')
    .replace(/(\d),(\d)/g, '$1{,}$2')
}

function preprocess(md: string): string {
  return md
    .replace(/(^|[^\\`])\$(\d)/gm, (_m, pre, digit) => `${pre}\\$${digit}`)
    .replace(/`([^`]+)`/g, (_m, code) => {
      if (isMathExpression(code)) return `$${codeToLatex(code)}$`
      return _m
    })
    .replace(/(?<![`$])(\d+)\^(-?\d+)(?![}`])/g, (_, base, exp) => {
      return `$${base}^{${exp}}$`
    })
}

/** Render markdown to HTML. */
export async function render(markdown: string): Promise<string> {
  const processed = preprocess(markdown)

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath, { singleDollarTextMath: true })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex)
    .use(rehypeShiki)
    .use(rehypeHeadingIds)
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(processed)

  return String(result)
}
