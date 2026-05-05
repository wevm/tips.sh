import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildFtsSearchQuery, buildTitleFtsSearchQuery } from './SearchQuery'

describe('buildFtsSearchQuery', () => {
  test('keeps unquoted terms as prefix searches', () => {
    assert.equal(buildFtsSearchQuery('bal'), '"bal"*')
  })

  test('treats quoted terms as exact phrase searches', () => {
    assert.equal(buildFtsSearchQuery('"bal"'), '"bal"')
  })

  test('mixes prefix terms and exact phrases', () => {
    assert.equal(buildFtsSearchQuery('bal "asset layer"'), '"bal"* "asset layer"')
  })

  test('treats an unfinished quote as an exact phrase', () => {
    assert.equal(buildFtsSearchQuery('"bal'), '"bal"')
  })

  test('quotes punctuation so direct search text cannot break FTS syntax', () => {
    assert.equal(buildFtsSearchQuery('foo/bar'), '"foo/bar"*')
  })

  test('ignores empty quoted phrases', () => {
    assert.equal(buildFtsSearchQuery('""'), '')
  })
})

describe('buildTitleFtsSearchQuery', () => {
  test('scopes the whole search expression to the title column', () => {
    assert.equal(buildTitleFtsSearchQuery('"foo"* "bar"*'), 'title : ("foo"* "bar"*)')
  })
})
