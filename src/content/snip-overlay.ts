// Content script: Viewport screen snipping crosshair overlay with Shadow DOM isolation
import overlayStyles from './snip-overlay.css?inline'
import type { CropRect } from '../models/types'

(() => {
  const HOST_ID = 'qr-vault-snip-host'

  // Clean up any existing overlay
  const existing = document.getElementById(HOST_ID)
  if (existing) {
    existing.remove()
  }

  const host = document.createElement('div')
  host.id = HOST_ID

  // Shadow DOM isolation prevents host page scripts and CSS from interfering
  const shadow = host.attachShadow({ mode: 'open' })

  const styleEl = document.createElement('style')
  styleEl.textContent = overlayStyles

  const backdrop = document.createElement('div')
  backdrop.className = 'qr-backdrop'

  const selectionBox = document.createElement('div')
  selectionBox.className = 'qr-selection-box'

  const badge = document.createElement('div')
  badge.className = 'qr-instruction-badge'
  badge.textContent = 'Drag to crop QR code. Press ESC to cancel.'

  backdrop.appendChild(selectionBox)
  shadow.appendChild(styleEl)
  shadow.appendChild(backdrop)
  shadow.appendChild(badge)

  document.body.appendChild(host)

  let isDragging = false
  let startX = 0
  let startY = 0

  function cleanup() {
    window.removeEventListener('keydown', handleKeyDown, true)
    backdrop.removeEventListener('mousedown', handleMouseDown)
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    host.remove()
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      cleanup()
      chrome.runtime.sendMessage({ type: 'CROP_CANCELLED' })
    }
  }

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return // Left mouse button only
    isDragging = true
    startX = e.clientX
    startY = e.clientY

    selectionBox.style.left = `${startX}px`
    selectionBox.style.top = `${startY}px`
    selectionBox.style.width = '0px'
    selectionBox.style.height = '0px'
    selectionBox.style.display = 'block'
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return

    const currentX = e.clientX
    const currentY = e.clientY

    const left = Math.min(startX, currentX)
    const top = Math.min(startY, currentY)
    const width = Math.abs(currentX - startX)
    const height = Math.abs(currentY - startY)

    selectionBox.style.left = `${left}px`
    selectionBox.style.top = `${top}px`
    selectionBox.style.width = `${width}px`
    selectionBox.style.height = `${height}px`
  }

  function handleMouseUp(e: MouseEvent) {
    if (!isDragging) return
    isDragging = false

    const endX = e.clientX
    const endY = e.clientY

    const left = Math.min(startX, endX)
    const top = Math.min(startY, endY)
    const width = Math.abs(endX - startX)
    const height = Math.abs(endY - startY)

    cleanup()

    // Minimum 10x10 px box to ignore accidental clicks
    if (width >= 10 && height >= 10) {
      const rect: CropRect = {
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
        devicePixelRatio: window.devicePixelRatio || 1,
      }

      chrome.runtime.sendMessage({
        type: 'CROP_SELECTED',
        rect,
      })
    } else {
      chrome.runtime.sendMessage({ type: 'CROP_CANCELLED' })
    }
  }

  window.addEventListener('keydown', handleKeyDown, true)
  backdrop.addEventListener('mousedown', handleMouseDown)
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
})()
