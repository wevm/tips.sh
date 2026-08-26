/** Search result from FTS5 query. */
import type { PrInfo } from './Tips'

export type Result = {
  number: string
  title: string
  authors: string
  status: string
  snippet: string
  rank: number
  pr?: PrInfo | undefined
}
