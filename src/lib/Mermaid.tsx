import { useEffect } from 'react'
import { openZoom } from './Zoom'

export function Mermaid({ targetSelector }: { targetSelector: string }) {
  useEffect(() => {
    const root = document.querySelector(targetSelector)
    if (!root) return

    const onClick = (event: Event) => {
      const diagram = (event.target as Element).closest('.mermaid-rendered')
      const svg = diagram?.querySelector('svg')
      if (svg) openZoom({ kind: 'svg', svg: svg.outerHTML })
    }

    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [targetSelector])

  return null
}
