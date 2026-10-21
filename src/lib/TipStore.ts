/** The content inventory shared by HTML pages and Markdown exports. */
export type Row = {
  number: string
  title: string
  authors: string
  status: string
  abstract: string
  content: string
  filename: string
  protocol_version: string
  pr_json: string
  created_at: string
}

export type Summary = Pick<Row, 'number' | 'title' | 'status' | 'filename' | 'pr_json'>

export function get(db: D1Database, id: string) {
  return db.prepare('SELECT * FROM tips WHERE number = ?').bind(id).first<Row>()
}

export async function list(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT number, title, status, filename, pr_json FROM tips ORDER BY CASE WHEN number GLOB '[0-9]*' THEN 0 ELSE 1 END, CAST(number AS INTEGER), number`,
    )
    .all<Summary>()
  return rows.results
}
