// Background service worker: Captures tab screenshots and manages snip overlay injection
import type { CropRect } from '../models/types'

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_SNIP') {
    handleStartSnip().then(sendResponse)
    return true
  }

  if (message.type === 'CROP_SELECTED') {
    handleCropSelected(message.rect as CropRect).then(sendResponse)
    return true
  }

  if (message.type === 'CROP_CANCELLED') {
    chrome.runtime.sendMessage({ type: 'SNIP_CANCELLED' })
    return false
  }
})

async function handleStartSnip(): Promise<{ success: boolean; error?: string }> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!activeTab?.id) {
      return { success: false, error: 'No active tab found' }
    }

    if (
      activeTab.url?.startsWith('chrome://') ||
      activeTab.url?.startsWith('chrome-extension://') ||
      activeTab.url?.startsWith('edge://') ||
      activeTab.url?.startsWith('about:')
    ) {
      return {
        success: false,
        error: 'Screen snipping is not permitted on browser system pages.',
      }
    }

    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['content/snip-overlay.js'],
    })

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to inject snip overlay'
    return { success: false, error: message }
  }
}

async function handleCropSelected(rect: CropRect): Promise<{ success: boolean; error?: string }> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null as unknown as number, { format: 'png' })

    const result = {
      type: 'SNIP_RESULT',
      dataUrl,
      rect,
      timestamp: Date.now(),
    }

    // Broadcast result to active popup if open
    chrome.runtime.sendMessage(result).catch(() => {
      // Popup might be closed while snipping; save to storage so popup can retrieve upon opening
    })

    // Store in storage so popup can read upon reopening
    await chrome.storage.local.set({ temp_snip_result: result })

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to capture screen'
    chrome.runtime.sendMessage({ type: 'SNIP_ERROR', error: message }).catch(() => {})
    return { success: false, error: message }
  }
}
