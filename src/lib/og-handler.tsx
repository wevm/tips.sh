import { ImageResponse } from 'takumi-js/response'
import { initSync, Renderer } from 'takumi-js/wasm'
import wasmModule from '@takumi-rs/wasm/takumi_wasm_bg.wasm'
import { OgCard } from './Og'
// @ts-expect-error bytes import
import cmunrmData from '../../public/fonts/cmunrm-clean.ttf?bytes'
// @ts-expect-error bytes import
import cmunbxData from '../../public/fonts/cmunbx-clean.ttf?bytes'
// @ts-expect-error bytes import
import cmunslData from '../../public/fonts/cmunsl-clean.ttf?bytes'

let renderer: Renderer
function getRenderer() {
  if (!renderer) {
    initSync({ module: wasmModule })
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

export async function renderOg(env: Env, tipNumber: string) {
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
