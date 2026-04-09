/** PDF generation via Cloudflare Browser Rendering with KV caching. */

import * as fonts from './Pdf.fonts'

const katexCdn =
  'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css'

const printCss = `
  @page { size: A4; margin: 18mm 16mm 20mm; }
  pre, table { break-inside: avoid; }
  body { font-family: 'CMU Serif', Georgia, serif; font-size: 11pt; line-height: 1.6; color: #111; }
  h1 { font-size: 18pt; text-align: center; margin-bottom: 0.2em; }
  h2 { font-size: 14pt; margin-top: 1.5em; border-bottom: 0.5px solid #ccc; padding-bottom: 0.2em; }
  h3 { font-size: 12pt; }
  code { font-size: 0.85em; background: #f5f5f0; padding: 0.1em 0.3em; border-radius: 2px; }
  pre { background: #f5f5f0; border: 1px solid #e0ddd4; border-radius: 4px; padding: 0.8em 1em; font-size: 9pt; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  thead { border-top: 2px solid #333; border-bottom: 1px solid #333; }
  thead th { padding: 0.4em 0.6em; text-align: left; }
  tbody td { padding: 0.3em 0.6em; }
  tbody tr:last-child { border-bottom: 2px solid #333; }
  tbody tr + tr { border-top: 0.5px solid #ccc; }
  blockquote { border-left: 3px solid #999; margin: 1em 0; padding: 0.3em 0 0.3em 1em; color: #555; font-style: italic; }
  a { color: #1a0dab; }
`

declare namespace Pdf {
  type Options = {
    title: string
    authors?: string
    bodyHtml: string
  }
}

function buildFontFaces(): string {
  return [fonts.regular, fonts.italic, fonts.bold, fonts.boldItalic]
    .map(
      (f) =>
        `@font-face { font-family: 'CMU Serif'; src: url(data:font/truetype;base64,${f.data}) format('truetype'); font-style: ${f.style}; font-weight: ${f.weight}; }`,
    )
    .join('\n')
}

function buildDocument(options: Pdf.Options): string {
  const authorLine = options.authors
    ? `<p style="text-align:center;color:#555;font-style:italic;margin:0.2em 0;">${options.authors}</p>`
    : ''
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="${katexCdn}">
  <style>
    ${buildFontFaces()}
    ${printCss}
  </style>
</head>
<body>
  <h1>${options.title}</h1>
  ${authorLine}
  <hr style="border:none;border-top:0.5px solid #333;margin:1em 0 1.5em;">
  ${options.bodyHtml}
</body>
</html>`
}

/** Render HTML to PDF, with KV caching by content hash. */
export async function render(options: Pdf.Options): Promise<Uint8Array> {
  const { env } = await import('cloudflare:workers')
  const html = buildDocument(options)

  // Check KV cache
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(html),
  )
  const hashHex = [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const cacheKey = `pdf:${hashHex}`

  const cached = await env.TIPS_KV.get(cacheKey, 'arrayBuffer')
  if (cached) return new Uint8Array(cached)

  if (!env.BROWSER)
    throw new Error(
      'BROWSER binding not available (Browser Rendering requires deployed Cloudflare Workers)',
    )

  const puppeteer = (await import(
    /* @vite-ignore */ '@cloudflare/puppeteer'
  )).default
  const browser = await puppeteer.launch(env.BROWSER)
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle2' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    const result = new Uint8Array(pdf)

    // Cache for 7 days
    await env.TIPS_KV.put(cacheKey, result.buffer as ArrayBuffer, {
      expirationTtl: 7 * 24 * 60 * 60,
    })

    return result
  } finally {
    await browser.close()
  }
}
