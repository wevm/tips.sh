/** HTTP representation selection, shared inventory, and explicit Markdown routes. */
import * as Export from './MarkdownExport'
import * as TipStore from './TipStore'

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

export function shouldServeMarkdown(request: Request): boolean {
  const ua = request.headers.get('user-agent') ?? ''
  const accept = (request.headers.get('accept') ?? '')
    .toLowerCase()
    .split(',')
    .map((entry) => {
      const [type, ...params] = entry.trim().split(';')
      const raw = params.map((param) => param.trim()).find((param) => param.startsWith('q='))
      const q = raw ? Number(raw.slice(2)) : 1
      return { type: type.trim(), q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0 }
    })
  const markdown = accept.find((entry) => entry.type === 'text/markdown')
  const html =
    accept.find((entry) => entry.type === 'text/html') ??
    accept.find((entry) => entry.type === 'text/*') ??
    accept.find((entry) => entry.type === '*/*')
  if (markdown) return markdown.q > 0 && markdown.q >= (html?.q ?? 0)
  if ([...ogBotUserAgents, ...searchEngineUserAgents].some((agent) => ua.includes(agent)))
    return false
  if (
    accept.some((entry) => entry.type === 'text/*' && entry.q === 0) ||
    (!accept.some((entry) => entry.type === 'text/*') &&
      accept.some((entry) => entry.type === '*/*' && entry.q === 0))
  )
    return false
  if (accept.some((entry) => entry.type === 'text/html' && entry.q > 0)) return false
  return [...aiUserAgents, ...terminalUserAgents].some((agent) => ua.includes(agent))
}

export function vary(response: Response) {
  const headers = new Headers(response.headers)
  const values = (headers.get('Vary') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (!values.includes('*')) {
    for (const name of ['Accept', 'User-Agent']) {
      if (!values.some((value) => value.toLowerCase() === name.toLowerCase())) values.push(name)
    }
    headers.set('Vary', values.join(', '))
  }
  // Cloudflare's default cache key ignores Vary for these headers. Never let
  // a negotiated response poison an HTML URL, even when it carries Vary.
  headers.set('Cache-Control', 'private, no-store')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function handle(
  request: Request,
  database: () => Promise<D1Database>,
): Promise<Response | undefined> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return
  const pathname = new URL(request.url).pathname
  const explicitIndex = pathname === '/index.md' || pathname === '/llms.txt'
  const explicitTip = pathname.match(/^\/([^/]+)\.md$/)
  const negotiated = shouldServeMarkdown(request)
  if (!explicitIndex && !explicitTip && !negotiated) return
  const tipMatch = pathname.match(/^\/([^/]+)\/?$/)
  if (!explicitIndex && !explicitTip && pathname !== '/' && !tipMatch) return
  const response = (body: string, status = 200) =>
    new Response(request.method === 'HEAD' ? null : body, {
      status,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control':
          explicitIndex || explicitTip ? 'public, max-age=0, s-maxage=300' : 'private, no-store',
        Vary: 'Accept, User-Agent',
      },
    })
  try {
    const db = await database()
    if (explicitIndex || pathname === '/') return response(Export.index(await TipStore.list(db)))
    const id = decodeURIComponent((explicitTip ?? tipMatch)![1])
    const tip = await TipStore.get(db, id)
    if (!tip) {
      if (!explicitTip && id.includes('.')) return
      return response('TIP not found\n', 404)
    }
    return response(Export.render(tip, await TipStore.list(db)))
  } catch (error) {
    console.error('[md-router]', error)
    const failed = response('Markdown unavailable\n', 503)
    failed.headers.set('Cache-Control', 'no-store')
    return failed
  }
}
