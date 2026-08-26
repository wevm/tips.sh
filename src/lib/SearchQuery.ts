type SearchTerm = {
  text: string
  exact: boolean
}

/** Build an FTS5 MATCH query from direct search-box input. */
export function buildFtsSearchQuery(input: string): string {
  return parseSearchTerms(input)
    .map((term) => {
      const phrase = quoteFtsPhrase(term.text)
      return term.exact ? phrase : `${phrase}*`
    })
    .join(' ')
}

export function buildTitleFtsSearchQuery(ftsQuery: string): string {
  return `title : (${ftsQuery})`
}

function parseSearchTerms(input: string): SearchTerm[] {
  const terms: SearchTerm[] = []
  let text = ''
  let inQuote = false

  function push(exact: boolean) {
    const trimmed = text.trim()
    if (trimmed) terms.push({ text: trimmed, exact })
    text = ''
  }

  for (const char of input.trim()) {
    if (inQuote) {
      if (char === '"') {
        push(true)
        inQuote = false
      } else {
        text += char
      }
      continue
    }

    if (char === '"') {
      push(false)
      inQuote = true
    } else if (/\s/.test(char)) {
      push(false)
    } else {
      text += char
    }
  }

  push(inQuote)
  return terms
}

function quoteFtsPhrase(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}
