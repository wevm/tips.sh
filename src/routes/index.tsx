import { useState, useRef, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQueryState, parseAsString } from 'nuqs'
import * as Tips from '#/lib/Tips.fns'
import * as Search from '#/lib/Search.fns'
import * as Config from '#/lib/Config'
import type * as SearchTypes from '#/lib/Search'

export const Route = createFileRoute('/')({
  loader: () => Tips.list(),
  head: () => ({
    meta: [
      { title: 'Tempo Improvement Proposals' },
      {
        name: 'description',
        content:
          'A collection of specifications defining protocol changes and enhancements to the Tempo blockchain.',
      },
      { name: 'robots', content: 'index,follow' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'Tempo Improvement Proposals' },
      {
        property: 'og:description',
        content:
          'A collection of specifications defining protocol changes and enhancements to the Tempo blockchain.',
      },
      { property: 'og:url', content: `${Config.baseUrl}/` },
      { property: 'og:image', content: `${Config.baseUrl}/og/index.png` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: `${Config.baseUrl}/og/index.png` },
      {
        name: 'twitter:title',
        content: 'Tempo Improvement Proposals',
      },
      {
        name: 'twitter:description',
        content:
          'A collection of specifications defining protocol changes and enhancements to the Tempo blockchain.',
      },
    ],
    links: [{ rel: 'canonical', href: `${Config.baseUrl}/` }],
  }),
  component: TipsIndex,
})

function TipNumber({ value, prUrl }: { value: string; prUrl?: string }) {
  const match = value.match(/^(.+)-(\d+)$/)
  if (!match || !/\d/.test(match[1])) return <>{value}</>
  const base = match[1]
  const sup = match[2]
  return (
    <>
      {base}
      {prUrl ? (
        <sup style={{ fontSize: '0.7em', color: 'var(--color-link)', textDecoration: 'none' }}>
          {sup}
        </sup>
      ) : (
        <sup
          style={{ fontSize: '0.7em', color: 'var(--color-text-muted)', textDecoration: 'none' }}
        >
          {sup}
        </sup>
      )}
    </>
  )
}

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

function SearchBox({
  value,
  onChange,
  onArrow,
  onCommit,
}: {
  value: string
  onChange: (v: string) => void
  onArrow?: (direction: 'up' | 'down') => void
  onCommit?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        onChange('')
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onChange])

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          onArrow?.('down')
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          onArrow?.('up')
        } else if (e.key === 'Enter') {
          e.preventDefault()
          onCommit?.()
        }
      }}
      placeholder="Search TIPs… (press /)"
      style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '0.92em',
        padding: '0.2em 0.7em',
        border: '1px solid var(--color-rule-light)',
        borderRadius: '3px',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        width: '16rem',
        outline: 'none',
      }}
    />
  )
}

function SearchResults({ results, activeIndex }: { results: SearchTypes.Result[]; activeIndex: number }) {
  if (results.length === 0)
    return <p style={{ color: 'var(--color-text-muted)', marginTop: '1.5em' }}>No results found.</p>

  return (
    <div style={{ marginTop: '1em' }} role="listbox">
      {results.map((r, i) => (
        <Link
          key={r.number}
          to="/$tipId"
          params={{ tipId: r.number }}
          role="option"
          aria-selected={i === activeIndex}
          ref={(el) => {
            if (i === activeIndex && el) el.scrollIntoView({ block: 'nearest' })
          }}
          style={{
            display: 'block',
            textDecoration: 'none',
            color: 'inherit',
            padding: '0.8em 0.4em',
            borderBottom: '0.5px solid var(--color-rule-light)',
            background: i === activeIndex ? 'var(--color-code-bg)' : 'transparent',
            borderRadius: i === activeIndex ? '3px' : undefined,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              gap: '0.4em 0.6em',
              marginBottom: '0.3em',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-text-muted)',
                fontSize: '0.85em',
                flexShrink: 0,
              }}
            >
              TIP-
              <TipNumber value={r.number} />
            </span>
            <span style={{ fontWeight: 700, minWidth: 0 }}>{r.title}</span>
            <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <StatusBadge status={r.status} />
            </span>
          </div>
          {r.snippet && (
            <p
              style={{
                fontSize: '0.88em',
                color: 'var(--color-text-muted)',
                margin: 0,
                lineHeight: 1.5,
                textAlign: 'left',
              }}
              dangerouslySetInnerHTML={{ __html: r.snippet }}
            />
          )}
        </Link>
      ))}
    </div>
  )
}

function TipsIndex() {
  const tips = Route.useLoaderData()
  const [query, setQuery] = useQueryState('q', parseAsString.withDefault(''))
  const [results, setResults] = useState<SearchTypes.Result[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const navigate = Route.useNavigate()

  const isSearching = query.length > 0

  useEffect(() => {
    if (!query.trim()) {
      setResults(null)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await Search.query({ data: query })
        setResults(r)
        setActiveIndex(-1)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 200)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  return (
    <main className="tip-article">
      <div className="tip-frontmatter">
        <h1>Tempo Improvement Proposals</h1>
        <p>
          A collection of specifications defining protocol changes and enhancements to the Tempo
          blockchain.
        </p>
      </div>

      <div className="tip-body">
        <SearchBox
          value={query}
          onChange={setQuery}
          onArrow={(dir) => {
            if (!results?.length) return
            setActiveIndex((prev) => {
              if (dir === 'down') return prev < results.length - 1 ? prev + 1 : 0
              return prev > 0 ? prev - 1 : results.length - 1
            })
          }}
          onCommit={() => {
            if (results && activeIndex >= 0 && activeIndex < results.length) {
              navigate({
                to: '/$tipId',
                params: { tipId: results[activeIndex].number },
              })
            }
          }}
        />

        {isSearching ? (
          searching && !results ? (
            <p
              style={{
                color: 'var(--color-text-muted)',
                marginTop: '1.5em',
              }}
            >
              Searching…
            </p>
          ) : (
            results && <SearchResults results={results} activeIndex={activeIndex} />
          )
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ marginTop: '0.5em' }}>
            <caption className="sr-only">List of Tempo Improvement Proposals</caption>
            <thead>
              <tr>
                <th style={{ width: '5rem' }}>Number</th>
                <th>Title</th>
                <th style={{ width: '7rem', textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {tips.map((tip) => (
                <tr key={tip.number}>
                  <td>
                    <Link
                      to="/$tipId"
                      params={{ tipId: tip.number }}
                      style={{ fontFamily: 'var(--font-serif)' }}
                    >
                      <TipNumber value={tip.number} prUrl={tip.pr?.url} />
                    </Link>
                  </td>
                  <td>
                    <Link
                      to="/$tipId"
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
        )}
      </div>
    </main>
  )
}
