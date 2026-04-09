import { createFileRoute, Link } from '@tanstack/react-router'
import { fetchTipsList } from '#/lib/tips'

export const Route = createFileRoute('/')({
  loader: () => fetchTipsList(),
  head: () => ({
    meta: [{ title: 'Tempo Improvement Proposals' }],
  }),
  component: TipsIndex,
})

function StatusBadge({ status, isPr }: { status: string; isPr?: boolean }) {
  if (isPr) {
    return (
      <span className="tip-status-badge" data-status="proposed">
        Proposed
      </span>
    )
  }
  const normalized = status.toLowerCase().replace(/\s+/g, '-')
  return (
    <span className="tip-status-badge" data-status={normalized}>
      {status}
    </span>
  )
}

function TipsIndex() {
  const tips = Route.useLoaderData()

  return (
    <div className="tip-article">
      <div className="tip-frontmatter">
        <h1>Tempo Improvement Proposals</h1>
        <p>
          A collection of specifications defining protocol changes and
          enhancements to the Tempo blockchain.
        </p>
      </div>

      <div className="tip-body">
        <table>
          <thead>
            <tr>
              <th style={{ width: '5rem' }}>Number</th>
              <th>Title</th>
              <th style={{ width: '7rem', textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {tips.map((tip) => (
              <tr key={tip.filename}>
                <td>
                  <Link
                    to="/tip/$tipId"
                    params={{ tipId: tip.number }}
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    {tip.number}
                  </Link>
                </td>
                <td>
                  <Link
                    to="/tip/$tipId"
                    params={{ tipId: tip.number }}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    {tip.title}
                  </Link>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <StatusBadge status={tip.status} isPr={!!tip.pr} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
