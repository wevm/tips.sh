import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { baseUrl } from './lib/Config'

const handler = createStartHandler(defaultStreamHandler)

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

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
