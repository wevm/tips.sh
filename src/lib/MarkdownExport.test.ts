import { describe, expect, it } from 'vite-plus/test'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkFrontmatter from 'remark-frontmatter'
import { render, type Tip } from './MarkdownExport'

const tip: Tip = {
  number: '1034',
  title: 'Channels',
  filename: 'tip-1034.md',
  status: 'Draft',
  pr_json: '',
  content: '',
}

describe('Markdown exports', () => {
  it('preserves frontmatter, tables, code, math, and Mermaid semantically', () => {
    const content = [
      '---',
      'id: TIP-1034',
      'title: Channels',
      'authors: Alice',
      '---',
      '',
      '# Channels',
      '',
      '**Protocol Version**: T3',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| channel | `balance` |',
      '',
      '```solidity',
      '// [Example](./tip-1034.md)',
      'uint256 amount = 1;',
      '```',
      '',
      '$$\\sum_{i=1}^{n} i$$',
      '',
      '```mermaid',
      'graph LR',
      '  A --> B',
      '```',
      '',
    ].join('\n')
    const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFrontmatter)
    const withoutPositions = (value: unknown) =>
      JSON.parse(JSON.stringify(value, (key, item) => (key === 'position' ? undefined : item)))
    expect(withoutPositions(parser.parse(render({ ...tip, content }, [tip])))).toEqual(
      withoutPositions(parser.parse(content)),
    )
  })

  it('resolves links, reference definitions, images and HTML while leaving code alone', () => {
    const content = [
      '[Other](./tip-1000.md?view=full#specification)',
      '[Ref][other]',
      '',
      '[other]: tip-1000.md#abstract',
      '',
      '![Diagram](./assets/diagram.svg)',
      '<a href="./tip-1000.md">Other</a>',
      '<img src="./assets/diagram.svg" />',
      '',
      '`[Example](./tip-1000.md)`',
      '',
      '[External](https://example.com/tip-1000.md)',
      '[Local](#abstract)',
      '',
    ].join('\n')
    const output = render({ ...tip, content }, [
      tip,
      { ...tip, number: '1000', filename: 'tip-1000.md' },
    ])
    expect(output).toContain('(https://tips.sh/1000.md?view=full#specification)')
    expect(output).toContain('[other]: https://tips.sh/1000.md#abstract')
    expect(output).toContain(
      '(https://github.com/tempoxyz/tempo/raw/refs/heads/main/tips/assets/diagram.svg)',
    )
    expect(output).toContain('href="https://tips.sh/1000.md"')
    expect(output).toContain(
      'src="https://github.com/tempoxyz/tempo/raw/refs/heads/main/tips/assets/diagram.svg"',
    )
    expect(output).toContain('`[Example](./tip-1000.md)`')
    expect(output).toContain('(https://example.com/tip-1000.md)')
    expect(output).toContain('(#abstract)')
  })

  it('prefers matching PR variants and uses PR source assets, including for forks', () => {
    const proposal = {
      ...tip,
      number: '1034-1',
      pr_json: JSON.stringify({ number: 42 }),
      content: '[Other](./tip-1000.md)\n\n![Diagram](./diagram.svg)\n',
    }
    const inventory = [
      tip,
      proposal,
      { ...tip, number: '1000', filename: 'tip-1000.md' },
      { ...proposal, number: '1000-1', filename: 'tip-1000.md' },
    ]
    const output = render(proposal, inventory)
    expect(output).toContain('(https://tips.sh/1000-1.md)')
    expect(output).toContain(
      '(https://github.com/tempoxyz/tempo/raw/refs/pull/42/head/tips/diagram.svg)',
    )
  })
})
