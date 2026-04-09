import { createFileRoute, Link } from '@tanstack/react-router'
import { baseUrl } from '#/lib/Config'
import * as Tips from '#/lib/Tips.fns'
import * as Markdown from '#/lib/Markdown'

export const Route = createFileRoute('/$tipId')({
  loader: async ({ params }) => {
    const tipId = params.tipId.replace(/\.md$/, '')
    const tip = await Tips.get({ data: tipId })

    const bodyMarkdown = tip.content
      .replace(/^---\n[\s\S]*?\n---\n*/, '')
      .replace(/^# .+\n+/, '')
      .replace(/^\*\*Protocol Version\*\*.*\n+/, '')
      .replace(/^---\n+/, '')

    const html = await Markdown.render(bodyMarkdown)
    return { tip, html }
  },
  head: ({ loaderData }) => {
    const tip = loaderData?.tip
    const title = tip ? `TIP-${tip.number}: ${tip.title}` : 'Tempo TIP'
    const description = tip?.abstract?.slice(0, 160) || 'A Tempo Improvement Proposal'
    const url = tip ? `${baseUrl}/${tip.number}` : baseUrl

    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'article' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { property: 'og:image', content: tip ? `${baseUrl}/og/${tip.number}.png` : undefined },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: tip ? `${baseUrl}/og/${tip.number}.png` : undefined },
      ],
      links: [{ rel: 'canonical', href: url }],
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
            TIP-{tip.number}: {tip.title}
          </h1>
          {tip.authors && <p style={{ fontStyle: 'italic' }}>{tip.authors}</p>}
          {tip.protocolVersion && (
            <p>
              Protocol Version: <strong>{tip.protocolVersion}</strong>
            </p>
          )}
          {tip.pr && (
            <p style={{ fontSize: '0.85em' }}>
              Proposed in{' '}
              <a href={tip.pr.url} target="_blank" rel="noopener noreferrer">
                PR #{tip.pr.number}
              </a>
            </p>
          )}
          <p style={{ fontSize: '0.85em' }}>
            <a href={`/${tip.number}.pdf`} style={{ marginRight: '1em' }}>
              Download PDF
            </a>
            <a
              href={
                tip.pr
                  ? `${tip.pr.url}/files`
                  : `https://github.com/tempoxyz/tempo/blob/main/tips/tip-${tip.number}.md`
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </p>
        </header>

        <div className="tip-body" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </main>
  )
}
