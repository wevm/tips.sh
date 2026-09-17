import { describe, expect, it } from 'vite-plus/test'
import { render } from './Markdown'

describe('render', () => {
  it('rewrites TIP file links to numeric routes and preserves fragments and queries', async () => {
    const html = await render(
      [
        '[Multisig](./tip-1114.md)',
        '[Commitments](tip-1108.md#account-leaf-storage)',
        '[Updates](/tip-1109.md?view=full#specification)',
        '<a href="./tip-1110.md">Recovery</a>',
      ].join('\n'),
    )
    expect(html).toContain('href="/1114"')
    expect(html).toContain('href="/1108#account-leaf-storage"')
    expect(html).toContain('href="/1109?view=full#specification"')
    expect(html).toContain('href="/1110"')
  })

  it('preserves external links, other files, and code examples', async () => {
    const html = await render(
      [
        '[External](https://example.com/tip-1114.md)',
        '[Other](./readme.md)',
        '[Archive](./tip-1114.md.backup)',
        '`[Example](./tip-1114.md)`',
      ].join('\n'),
    )
    expect(html).toContain('href="https://example.com/tip-1114.md"')
    expect(html).toContain('href="./readme.md"')
    expect(html).toContain('href="./tip-1114.md.backup"')
    expect(html).toContain('<code>[Example](./tip-1114.md)</code>')
  })

  it('renders exponents in inline math expressions without splitting digits', async () => {
    const html = await render('`2 × 10^10`')

    expect(html).toContain(
      '<annotation encoding="application/x-tex">2  \\times  10^{10}</annotation>',
    )
    expect(html).not.toContain('$10^{1}$0')
  })

  it('does not rewrite exponents inside non-math inline code', async () => {
    const html = await render('`1.2 × 10^10` and `10^-18`')

    expect(html).toContain('<code>1.2 × 10^10</code>')
    expect(html).toContain('<code>10^-18</code>')
  })

  it('renders bare exponents without partial matches', async () => {
    const html = await render('10^10 and 10^-18')

    expect(html).toContain('<annotation encoding="application/x-tex">10^{10}</annotation>')
    expect(html).toContain('<annotation encoding="application/x-tex">10^{-18}</annotation>')
  })
})
