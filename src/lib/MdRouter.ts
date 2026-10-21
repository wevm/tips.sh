/** Request middleware for markdown (AI bots/curl) and PDF (.pdf extension) serving. */

import { createMiddleware } from '@tanstack/react-start'
import * as Markdown from '#/lib/Markdown'
import * as MarkdownHttp from '#/lib/MarkdownHttp'

export const middleware = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    const url = new URL(request.url)
    const pathname = url.pathname

    const tipFile = pathname.match(/^\/tip-(\d+)\.md$/)
    if (tipFile) {
      url.pathname = `/${tipFile[1]}.md`
      throw Response.redirect(url.toString(), 308)
    }

    // /:id.pdf → PDF response
    const pdfMatch = pathname.match(/^\/(\d+)\.pdf$/)
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

    const markdown = await MarkdownHttp.handle(request, async () => {
      const { env } = await import('cloudflare:workers')
      return env.DB
    })
    if (markdown) throw markdown
    return next()
  },
)
