import { useEffect } from 'react'
import { openZoom } from './Zoom'

let mermaidIdCounter = 0

export function Mermaid({ targetSelector }: { targetSelector: string }) {
  useEffect(() => {
    const root = document.querySelector(targetSelector)
    if (!root) return

    let cancelled = false

    const render = async () => {
      const blocks = root.querySelectorAll<HTMLElement>('pre.mermaid:not([data-rendered])')
      if (blocks.length === 0) return

      const { default: mermaid } = await import('mermaid')
      if (cancelled) return

      mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        fontFamily: 'var(--font-serif)',
        securityLevel: 'strict',
      })

      for (const el of blocks) {
        const source = el.textContent ?? ''
        if (!source.trim()) continue
        const id = `mermaid-${++mermaidIdCounter}`

        try {
          const { svg } = await mermaid.render(id, source)
          if (cancelled) return

          const wrapper = document.createElement('div')
          wrapper.className = 'mermaid-rendered'
          wrapper.innerHTML = svg
          wrapper.dataset.rendered = 'true'
          wrapper.title = 'Click to expand'
          wrapper.addEventListener('click', () => openZoom({ kind: 'svg', svg }))
          el.replaceWith(wrapper)
        } catch (err) {
          console.warn('[mermaid] render failed:', err)
          el.dataset.rendered = 'error'
          el.classList.add('mermaid-error')
        }
      }
    }

    void render()
    const obs = new MutationObserver(() => void render())
    obs.observe(root, { childList: true, subtree: true })

    return () => {
      cancelled = true
      obs.disconnect()
    }
  }, [targetSelector])

  return null
}
