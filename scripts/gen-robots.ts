/** Generate public/robots.txt from VITE_BASE_URL. */

import { writeFileSync } from 'fs'

const baseUrl = process.env.VITE_BASE_URL
if (!baseUrl) throw new Error('VITE_BASE_URL is required')

writeFileSync(
  'public/robots.txt',
  `User-agent: *
Allow: /
Disallow: /api/
Sitemap: ${baseUrl}/sitemap.xml
`,
)

console.log(`Generated public/robots.txt (${baseUrl})`)
