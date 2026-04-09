import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const config = defineConfig({
  plugins: [
    bytesImport(),
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config

/** Vite plugin that resolves `?bytes` imports to inline Uint8Array. */
function bytesImport(): Plugin {
  return {
    name: 'bytes-import',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!id.endsWith('?bytes')) return
      const filePath = id.slice(0, -6)
      const resolved = importer
        ? resolve(dirname(importer), filePath)
        : resolve(filePath)
      return '\0bytes:' + resolved
    },
    load(id) {
      if (!id.startsWith('\0bytes:')) return
      const file = id.slice(7)
      const buf = readFileSync(file)
      return `export default new Uint8Array([${buf.join(',')}]);`
    },
  }
}