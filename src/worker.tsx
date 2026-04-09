import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { ImageResponse } from 'takumi-js/response'
import { initSync, Renderer } from 'takumi-js/wasm'
// @ts-expect-error wasm module import
import wasmModule from '@takumi-rs/wasm/takumi_wasm_bg.wasm'
import * as Config from './lib/Config'
import { OgCard } from './lib/Og'
// @ts-expect-error bytes import
import cmunrmData from '../public/fonts/cmunrm-clean.ttf?bytes'
// @ts-expect-error bytes import
import cmunbxData from '../public/fonts/cmunbx-clean.ttf?bytes'
// @ts-expect-error bytes import
import cmunslData from '../public/fonts/cmunsl-clean.ttf?bytes'

let renderer: Renderer | null = null
function getRenderer() {
  if (!renderer) {
    initSync(wasmModule)
    renderer = new Renderer({
      fonts: [
        { name: 'CMU Serif', data: cmunrmData, weight: 400, style: 'normal' },
        { name: 'CMU Serif', data: cmunbxData, weight: 700, style: 'normal' },
        { name: 'CMU Serif', data: cmunslData, weight: 400, style: 'italic' },
      ],
    })
  }
  return renderer
}

const handler = createStartHandler(defaultStreamHandler)

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    // /og/:number.png → dynamic OG image
    const ogMatch = url.pathname.match(/^\/og\/(.+)\.png$/)
    if (ogMatch) {
      const tipNumber = ogMatch[1]
      const row = await env.DB.prepare('SELECT number, title, authors FROM tips WHERE number = ?')
        .bind(tipNumber)
        .first<{
          number: string
          title: string
          authors: string
        }>()
      if (!row) return new Response('Not found', { status: 404 })

      return new ImageResponse(
        <OgCard number={row.number} title={row.title} authors={row.authors} />,
        {
          width: 1200,
          height: 630,
          renderer: getRenderer(),
          headers: {
            'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          },
        },
      )
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
