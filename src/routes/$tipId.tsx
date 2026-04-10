import { createFileRoute, Link } from '@tanstack/react-router'
import * as Config from '#/lib/Config'
import * as Tips from '#/lib/Tips.fns'

export const Route = createFileRoute('/$tipId')({
  loader: async ({ params }) => {
    const tipId = params.tipId.replace(/\.md$/, '')
    const tip = await Tips.get({ data: tipId })
    return { tip, html: tip.html }
  },
  head: ({ loaderData }) => {
    const tip = loaderData?.tip
    const title = tip ? `TIP-${tip.number}: ${tip.title}` : 'Tempo TIP'
    const description = tip?.abstract?.slice(0, 160) || 'A Tempo Improvement Proposal'
    const url = tip ? `${Config.baseUrl}/${tip.number}` : Config.baseUrl

    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'article' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { property: 'og:image', content: tip ? `${Config.baseUrl}/og/${tip.number}.png` : undefined },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: tip ? `${Config.baseUrl}/og/${tip.number}.png` : undefined },
      ],
      links: [
        { rel: 'canonical', href: url },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap' },
        { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css' },
      ],
      scripts: tip
        ? [
            {
              type: 'application/ld+json',
              children: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'TechArticle',
                headline: title,
                description,
                url,
                author: tip.authors
                  ? tip.authors.split(',').map((a: string) => ({
                      '@type': 'Person',
                      name: a.trim(),
                    }))
                  : undefined,
              }),
            },
          ]
        : [],
    }
  },
  component: TipPage,
})

function TipPage() {
  const { tip, html } = Route.useLoaderData()

  return (
    <main className="tip-article">
      <nav aria-label="Breadcrumb" style={{ marginBottom: '2em' }}>
        <Link
          to="/"
          style={{
            fontSize: '0.9rem',
            color: 'var(--color-text-muted)',
          }}
        >
          ← All TIPs
        </Link>
      </nav>

      <article>
        <header className="tip-frontmatter">
          <h1>
            TIP-<TipNumber value={tip.number} prUrl={tip.pr?.url} />: {tip.title}
          </h1>
          {tip.authors && <p style={{ fontStyle: 'italic' }}>{tip.authors}</p>}
          {tip.createdAt && (
            <p style={{ fontSize: '0.85em', color: 'var(--color-text-muted)' }}>
              {new Date(tip.createdAt + 'T00:00:00').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
          {tip.protocolVersion && (
            <p>
              Protocol Version: <strong>{tip.protocolVersion}</strong>
            </p>
          )}
          <p style={{ fontSize: '0.85em' }}>
            {tip.pr ? (
              <>
                Proposed in{' '}
                <a href={tip.pr.url} target="_blank" rel="noopener noreferrer">
                  PR #{tip.pr.number}
                </a>
              </>
            ) : (
              <a
                href={`https://github.com/tempoxyz/tempo/blob/main/tips/tip-${tip.number}.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub
              </a>
            )}
          </p>
        </header>

        <div className="tip-body" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </main>
  )
}

function TipNumber({ value, prUrl }: { value: string; prUrl?: string }) {
  const match = value.match(/^(.+)-(\d+)$/)
  if (!match || !/\d/.test(match[1])) return <>{value}</>
  const base = match[1]
  const sup = match[2]
  return (
    <>
      {base}
      {prUrl ? (
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none' }}
        >
          <sup style={{ fontSize: '0.5em', color: 'var(--color-link)' }}>{sup}</sup>
        </a>
      ) : (
        <sup style={{ fontSize: '0.5em', color: 'var(--color-text-muted)' }}>{sup}</sup>
      )}
    </>
  )
}
