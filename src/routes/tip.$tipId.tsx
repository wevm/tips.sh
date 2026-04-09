import { createFileRoute, Link } from '@tanstack/react-router'
import { fetchTip } from '#/lib/tips'
import { renderMarkdown } from '#/lib/markdown'
import { TipRenderer } from '#/components/TipRenderer'

export const Route = createFileRoute('/tip/$tipId')({
  loader: async ({ params }) => {
    const tip = await fetchTip({ data: params.tipId })

    // Strip the YAML frontmatter and/or title heading before rendering
    const bodyMarkdown = tip.content
      .replace(/^---\n[\s\S]*?\n---\n*/, '') // strip YAML frontmatter
      .replace(/^# .+\n+/, '') // strip title heading
      .replace(/^\*\*Protocol Version\*\*.*\n+/, '') // strip protocol version line
      .replace(/^---\n+/, '') // strip leading horizontal rule

    const html = await renderMarkdown(bodyMarkdown)
    return { tip, html }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `TIP-${loaderData.tip.number}: ${loaderData.tip.title}`
          : 'Tempo TIP',
      },
    ],
  }),
  component: TipPage,
})

function TipPage() {
  const { tip, html } = Route.useLoaderData()

  return (
    <div className="tip-article">
      <nav style={{ marginBottom: '2em' }}>
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

      <div className="tip-frontmatter">
        <h1>
          TIP-{tip.number}: {tip.title}
        </h1>
        {tip.authors && (
          <p style={{ fontStyle: 'italic' }}>{tip.authors}</p>
        )}
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
        <p>
          <a
            href={
              tip.pr
                ? `${tip.pr.url}/files`
                : `https://github.com/tempoxyz/tempo/blob/main/tips/tip-${tip.number}.md`
            }
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.85em' }}
          >
            View on GitHub
          </a>
        </p>
      </div>

      <TipRenderer html={html} />
    </div>
  )
}
