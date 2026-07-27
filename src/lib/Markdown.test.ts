import { describe, expect, it } from 'vite-plus/test'
import { render } from './Markdown'

describe('render', () => {
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
