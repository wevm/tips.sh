/** Request middleware for markdown (AI bots/curl) and PDF (.pdf extension) serving. */

import { createMiddleware } from '@tanstack/react-start'
import * as Markdown from '#/lib/Markdown'

const aiUserAgents = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ChatGPT-User/2.0',
  'anthropic-ai',
  'ClaudeBot',
  'claude-web',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'FacebookBot',
  'meta-externalagent',
  'Bytespider',
  'cohere-ai',
  'AI2Bot',
  'CCBot',
  'Diffbot',
  'omgili',
  'Timpibot',
  'MistralAI-User',
  'GoogleAgent-Mariner',
]
const searchEngineUserAgents = [
  'Googlebot',
  'Bingbot',
  'Amazonbot',
  'Applebot',
  'Applebot-Extended',
  'DuckAssistBot',
  'YouBot',
]
const terminalUserAgents = ['curl/', 'Wget/', 'HTTPie/', 'httpie-go/', 'xh/']
const ogBotUserAgents = [
  'Discordbot',
  'Embedly',
  'Facebot',
  'Iframely',
  'LinkedInBot',
  'Pinterestbot',
  'Slackbot',
  'Slurp',
  'TelegramBot',
  'Twitterbot',
  'WhatsApp',
  'facebookexternalhit',
]

function shouldServeMarkdown(request: Request): boolean {
  const ua = request.headers.get('user-agent') ?? ''
  const accept = request.headers.get('accept') ?? ''
  if (ogBotUserAgents.some((a) => ua.includes(a))) return false
  if (searchEngineUserAgents.some((a) => ua.includes(a))) return false
  if (aiUserAgents.some((a) => ua.includes(a))) return true
  if (terminalUserAgents.some((a) => ua.includes(a))) return true
  if (accept.includes('text/markdown')) return true
  return false
}

export const middleware = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    const url = new URL(request.url)
    const pathname = url.pathname

    // /tip/:id.pdf → PDF response
    const pdfMatch = pathname.match(/^\/tip\/(\d+)\.pdf$/)
    if (pdfMatch) {
      try {
        const { env } = await import('cloudflare:workers')
        const tip = await env.DB.prepare(
          'SELECT number, title, authors, content FROM tips WHERE number = ?',
        )
          .bind(pdfMatch[1])
          .first<{
            number: string
            title: string
            authors: string
            content: string
          }>()
        if (!tip) return next()

        const title = `TIP-${tip.number}: ${tip.title}`
        const bodyMarkdown = tip.content
          .replace(/^---\n[\s\S]*?\n---\n*/, '')
          .replace(/^# .+\n+/, '')
          .replace(/^\*\*Protocol Version\*\*.*\n+/, '')
          .replace(/^---\n+/, '')

        const bodyHtml = await Markdown.render(bodyMarkdown)
        const Pdf = await import('#/lib/Pdf')
        const pdf = await Pdf.render({
          title,
          authors: tip.authors,
          bodyHtml,
        })

        throw new Response(pdf.buffer as ArrayBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${title}.pdf"`,
            'Cache-Control': 'public, max-age=3600',
            'X-Robots-Tag': 'noindex',
          },
        })
      } catch (e) {
        if (e instanceof Response) throw e
        const message = e instanceof Error ? e.message : String(e)
        console.error('[pdf-router]', message)
        throw new Response(`PDF generation failed: ${message}`, {
          status: 500,
        })
      }
    }

    if (!shouldServeMarkdown(request)) return next()

    try {
      const { env } = await import('cloudflare:workers')
      const db = env.DB

      const tipMatch = pathname.match(/^\/tip\/(\d+)$/)
      if (tipMatch) {
        const tip = await db
          .prepare('SELECT content FROM tips WHERE number = ?')
          .bind(tipMatch[1])
          .first<{ content: string }>()
        if (tip)
          throw new Response(tip.content, {
            headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          })
      }

      if (pathname === '/') {
        const rows = await db
          .prepare(
            'SELECT number, title, status FROM tips ORDER BY CAST(number AS INTEGER)',
          )
          .all<{ number: string; title: string; status: string }>()
        if (rows.results.length > 0) {
          const lines = [
            '# Tempo Improvement Proposals\n',
            ...rows.results.map(
              (t) => `- **TIP-${t.number}**: ${t.title} (${t.status})`,
            ),
          ]
          throw new Response(lines.join('\n'), {
            headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          })
        }
      }
    } catch (e) {
      if (e instanceof Response) throw e
      console.error('[md-router]', e)
    }

    return next()
  },
)
