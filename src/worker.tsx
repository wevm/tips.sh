import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { ImageResponse } from 'takumi-js/response'
import { baseUrl } from './lib/Config'
import { OgCard } from './lib/Og'

const handler = createStartHandler(defaultStreamHandler)

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    // /og/:number.png → dynamic OG image
    const ogMatch = url.pathname.match(/^\/og\/(.+)\.png$/)
    if (ogMatch) {
      const tipNumber = ogMatch[1]
      const row = await env.DB.prepare(
        'SELECT number, title, authors FROM tips WHERE number = ?',
      )
        .bind(tipNumber)
        .first<{
          number: string
          title: string
          authors: string
        }>()
      if (!row)
        return new Response('Not found', { status: 404 })

      return new ImageResponse(
        <OgCard
          number={row.number}
          title={row.title}
          authors={row.authors}
        />,
        {
          width: 1200,
          height: 630,
          fonts: [
            {
              name: 'CMU Serif',
              data: () =>
                fetch(new URL('/fonts/cmunrm.ttf', url.origin)).then(
                  (r) => r.arrayBuffer(),
                ),
              weight: 400,
              style: 'normal',
            },
            {
              name: 'CMU Serif',
              data: () =>
                fetch(new URL('/fonts/cmunbx.ttf', url.origin)).then(
                  (r) => r.arrayBuffer(),
                ),
              weight: 700,
              style: 'normal',
            },
            {
              name: 'CMU Serif',
              data: () =>
                fetch(new URL('/fonts/cmunsl.ttf', url.origin)).then(
                  (r) => r.arrayBuffer(),
                ),
              weight: 400,
              style: 'italic',
            },
          ],
          headers: {
            'Cache-Control': 'public, max-age=3600',
          },
        },
      )
    }

    if (url.pathname === '/sitemap.xml' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT number FROM tips').all<{
        number: string
      }>()
      const urls = rows.results
        .filter((r) => !r.number.includes('#'))
        .map((r) => `<url><loc>${baseUrl}/tip/${r.number}</loc></url>`)
        .join('')
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc></url>
  ${urls}
</urlset>`
      return new Response(sitemap, {
        headers: {
          'Content-Type': 'application/xml',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }

    return handler(request)
  },

  async scheduled(
    _controller: ScheduledController,
    _env: Env,
    ctx: ExecutionContext,
  ) {
    const { trySync } = await import('./lib/Sync')
    ctx.waitUntil(trySync())
  },
} satisfies ExportedHandler<Env>
