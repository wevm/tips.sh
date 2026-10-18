# tips.sh

## Markdown

Every TIP page has a `/<id>.md` endpoint, including proposal variants such as
`/1061-1.md` and title-based slugs. These URLs always return Markdown, regardless
of user agent. `GET /<id>` with `Accept: text/markdown` returns the same content;
normal browser requests and link-preview bots retain HTML. Negotiated URLs use
`Vary: Accept, User-Agent` and `Cache-Control: private, no-store` because the
Cloudflare default cache key does not distinguish those headers. Explicit `.md`
URLs can be cached independently. Unknown Markdown IDs return 404, and database
failures return 503 rather than falling back to HTML.

`/llms.txt` and `/index.md` list the complete website inventory with links to each
Markdown page and the originating PR for proposals. Exports preserve frontmatter,
code, tables, math, and Mermaid source. Relative TIP links resolve to the matching
proposal revision where available; other relative assets resolve against the
source repository or PR.

Run `pnpm test` for routing, negotiation, content preservation, and inventory
coverage checks. `pnpm sync` also writes `.artifacts/markdown-manifest.json`,
containing expected hashes from that sync. After deploying, verify the public
endpoints against that local file:

```sh
pnpm check:markdown --url https://tips.sh --manifest .artifacts/markdown-manifest.json
```

The deployment workflow runs this check after publishing. Generate the expected
manifest from the intended sync; do not substitute a manifest downloaded from
the deployed site. A concurrent content sync can require rerunning the sync and
verification together.
