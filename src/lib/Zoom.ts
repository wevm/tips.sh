type ZoomContent = { kind: 'svg'; svg: string }

export function openZoom(content: ZoomContent) {
  document.querySelector('.zoom-overlay')?.remove()

  const overlay = document.createElement('div')
  overlay.className = 'zoom-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.tabIndex = -1

  const stage = document.createElement('div')
  stage.className = 'zoom-stage'

  const inner = document.createElement('div')
  inner.className = 'zoom-inner'
  inner.innerHTML = content.svg

  const svgEl = inner.querySelector('svg')
  if (svgEl) {
    svgEl.removeAttribute('style')
    svgEl.removeAttribute('width')
    svgEl.removeAttribute('height')
    svgEl.style.width = '90vw'
    svgEl.style.height = '90vh'
    svgEl.style.maxWidth = '90vw'
    svgEl.style.maxHeight = '90vh'
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  }

  const close = document.createElement('button')
  close.className = 'zoom-close'
  close.setAttribute('aria-label', 'Close')
  close.textContent = 'x'

  stage.appendChild(inner)
  overlay.appendChild(stage)
  overlay.appendChild(close)
  document.body.appendChild(overlay)

  let scale = 1
  let tx = 0
  let ty = 0
  const apply = () => {
    inner.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
  }
  apply()

  const previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  const teardown = () => {
    document.body.style.overflow = previousOverflow
    document.removeEventListener('keydown', onKeyDown)
    overlay.remove()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') teardown()
    else if (e.key === '0') {
      scale = 1
      tx = 0
      ty = 0
      apply()
    } else if (e.key === '+' || e.key === '=') {
      scale = Math.min(8, scale * 1.2)
      apply()
    } else if (e.key === '-' || e.key === '_') {
      scale = Math.max(0.2, scale / 1.2)
      apply()
    }
  }
  document.addEventListener('keydown', onKeyDown)

  close.addEventListener('click', teardown)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) teardown()
  })

  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const rect = inner.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const next = Math.min(8, Math.max(0.2, scale * factor))
      const ratio = next / scale
      tx -= (cx - rect.width / 2) * (ratio - 1)
      ty -= (cy - rect.height / 2) * (ratio - 1)
      scale = next
      apply()
    },
    { passive: false },
  )

  let dragging = false
  let lastX = 0
  let lastY = 0
  inner.style.cursor = 'grab'
  stage.addEventListener('pointerdown', (e) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    inner.style.cursor = 'grabbing'
    stage.setPointerCapture(e.pointerId)
  })
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return
    tx += e.clientX - lastX
    ty += e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    apply()
  })
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    inner.style.cursor = 'grab'
    try {
      stage.releasePointerCapture(e.pointerId)
    } catch {}
  }
  stage.addEventListener('pointerup', endDrag)
  stage.addEventListener('pointercancel', endDrag)

  overlay.focus()
}
