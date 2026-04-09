import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import * as Config from './lib/Config'

const handler = createStartHandler(defaultStreamHandler)

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    // /og/:number.png → dynamic OG image
    const ogMatch = url.pathname.match(/^\/og\/(.+)\.png$/)
    if (ogMatch) {
      const { renderOg } = await import('./lib/og-handler')
      return renderOg(env, ogMatch[1])
    }

    if (url.pathname === '/sitemap.xml' && request.method === 'GET') {
      const rows = await env.DB.prepare("SELECT number FROM tips WHERE pr_json = '' OR pr_json IS NULL").all<{
        number: string
      }>()
      const urls = rows.results
        .map((r) => `<url><loc>${Config.baseUrl}/${r.number}</loc></url>`)
        .join('')
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${Config.baseUrl}/</loc></url>
  ${urls}
</urlset>`
      return new Response(sitemap, {
        headers: {
          'Content-Type': 'application/xml',
          'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        },
      })
    }

    const response = await handler(request)
    if (request.method === 'GET' && response.status === 200) {
      const headers = new Headers(response.headers)
      headers.set('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400')
      return new Response(response.body, { status: response.status, headers })
    }
    return response
  },

  async scheduled(_controller: ScheduledController, _env: Env, ctx: ExecutionContext) {
    const { trySync } = await import('./lib/Sync')
    ctx.waitUntil(trySync())
  },
} satisfies ExportedHandler<Env>
