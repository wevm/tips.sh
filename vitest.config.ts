// Unit tests exercise the content pipeline without booting a Cloudflare Worker.
import { defineConfig } from 'vite-plus'

export default defineConfig({ test: { environment: 'node' } })
