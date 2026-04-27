import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import * as Config from '#/lib/Config'
import { Highlights } from '#/lib/Highlights'
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
  const headings = useMemo(() => extractHeadings(html), [html])

  return (
    <div className="tip-layout">
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
      <TableOfContents headings={headings} />
      <Highlights targetSelector=".tip-body" />
    </div>
  )
}

type Heading = { id: string; text: string; level: number }

function extractHeadings(html: string): Heading[] {
  const re = /<h([23])\s+[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g
  const out: Heading[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const text = m[3]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) continue
    out.push({ id: m[2], text, level: Number(m[1]) })
  }
  return out
}

function TableOfContents({ headings }: { headings: Heading[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (headings.length === 0) return

    const update = () => {
      const offset = 120
      // If scrolled to the bottom, activate the last heading
      const scrollBottom = window.scrollY + window.innerHeight
      if (scrollBottom >= document.documentElement.scrollHeight - 4) {
        setActiveId(headings[headings.length - 1].id)
        return
      }
      // Otherwise pick the last heading whose top is above the offset
      let current: string | null = null
      for (const h of headings) {
        const el = document.getElementById(h.id)
        if (!el) continue
        if (el.getBoundingClientRect().top - offset <= 0) current = h.id
        else break
      }
      setActiveId(current ?? headings[0].id)
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [headings])

  if (headings.length < 2) return null

  // Compute LaTeX-style numbering (1, 1.1, 1.2, 2, 2.1 …)
  let h2Index = 0
  let h3Index = 0
  const numbered = headings.map((h) => {
    if (h.level === 2) {
      h2Index += 1
      h3Index = 0
      return { ...h, number: `${h2Index}` }
    }
    h3Index += 1
    return { ...h, number: `${h2Index}.${h3Index}` }
  })

  return (
    <aside className="tip-toc" aria-label="Table of contents">
      <div className="tip-toc-inner">
        <p className="tip-toc-title">Contents</p>
        <ol className="tip-toc-list">
          {numbered.map((h) => (
            <li
              key={h.id}
              className={`tip-toc-item tip-toc-l${h.level}${activeId === h.id ? ' is-active' : ''}`}
            >
              <a href={`#${h.id}`}>
                <span className="tip-toc-num">{h.number}</span>
                <span className="tip-toc-text">{h.text}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </aside>
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
