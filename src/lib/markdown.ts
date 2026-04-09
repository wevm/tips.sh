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
      const className = ((codeEl.properties?.className as string[]) ?? [])
        .find((c) => c.startsWith('language-'))
      const lang = className?.replace('language-', '') ?? 'text'
      const code = (codeEl.children[0] as Text)?.value ?? ''

      const loadedLangs = highlighter.getLoadedLanguages()
      const resolvedLang = loadedLangs.includes(lang) ? lang : 'text'

      const highlighted = highlighter.codeToHtml(code, {
        lang: resolvedLang,
        theme: 'github-light',
      })

      // Replace the <pre> node with raw HTML
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

/**
 * Pre-process markdown to wrap math-like patterns in LaTeX delimiters.
 * - `10^-6` → `$10^{-6}$`
 * - `10^12` → `$10^{12}$`
 * - Escape `$` used for currency so remark-math ignores it
 */
/**
 * Check if an inline code span is a math formula (not a code identifier).
 * Math formulas contain × or arithmetic on numbers/variables like:
 *   `(code_size × 1,000) + 500,000`
 *   `32,000 + (code_size × 200)`
 *   `code_size × 1,000`
 */
function isMathExpression(code: string): boolean {
  // Must contain × to be considered math
  if (!code.includes('×')) return false
  // Should not contain typical code patterns (parens are fine in math)
  if (/[{};]|==|!=|=>|->|&&|\|\||\./.test(code)) return false
  // Must have at least one number
  if (!/\d/.test(code)) return false
  return true
}

/**
 * Convert inline code math to LaTeX notation.
 * `code_size × 1,000` → `\text{code\_size} \times 1{,}000`
 */
function codeToLatex(code: string): string {
  return code
    // Wrap word identifiers in \text{} FIRST (before × replacement)
    .replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (w) => {
      return `\\text{${w.replace(/_/g, '\\_')}}`
    })
    // Replace × with \times (after identifiers are wrapped)
    .replace(/×/g, ' \\times ')
    // Format commas in numbers: 1,000 → 1{,}000
    .replace(/(\d),(\d)/g, '$1{,}$2')
}

function preprocessMath(md: string): string {
  return md
    // Escape currency $ (dollar followed by digit) — but not inside backticks
    .replace(/(^|[^\\`])\$(\d)/gm, (_m, pre, digit) => `${pre}\\$${digit}`)
    // Convert inline code math expressions: `expr × expr` → $expr \times expr$
    .replace(/`([^`]+)`/g, (_m, code) => {
      if (isMathExpression(code)) {
        return `$${codeToLatex(code)}$`
      }
      return _m
    })
    // Convert superscript patterns: 10^-6, 10^12, 10^{-18}
    .replace(/(?<![`$])(\d+)\^(-?\d+)(?![}`])/g, (_, base, exp) => {
      return `$${base}^{${exp}}$`
    })
}

export async function renderMarkdown(markdown: string): Promise<string> {
  const processed = preprocessMath(markdown)

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
