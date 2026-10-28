// QR Decoder Service: Offscreen canvas cropping and native BarcodeDetector with jsQR fallback
import jsQR from 'jsqr'
import type { CropRect } from '../models/types'

export class QrDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QrDecodeError'
  }
}

interface DetectedBarcode {
  rawValue: string
  format: string
  boundingBox?: DOMRectReadOnly
}

declare global {
  class BarcodeDetector {
    constructor(options?: { formats: string[] })
    static getSupportedFormats(): Promise<string[]>
    detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>
  }
}

export class QrDecoderService {
  /**
   * Loads an image from a data URL.
   */
  private static loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new QrDecodeError('Failed to load captured screenshot image'))
      img.src = dataUrl
    })
  }

  /**
   * Crops a screenshot image according to crop coordinates and device pixel ratio onto an offscreen canvas.
   */
  static async cropImage(
    dataUrl: string,
    crop: CropRect
  ): Promise<HTMLCanvasElement> {
    const img = await this.loadImage(dataUrl)

    const dpr = crop.devicePixelRatio || 1
    const sx = Math.max(0, Math.round(crop.x * dpr))
    const sy = Math.max(0, Math.round(crop.y * dpr))
    const sWidth = Math.min(img.width - sx, Math.round(crop.width * dpr))
    const sHeight = Math.min(img.height - sy, Math.round(crop.height * dpr))

    if (sWidth <= 0 || sHeight <= 0) {
      throw new QrDecodeError('Invalid crop dimensions')
    }

    const canvas = document.createElement('canvas')
    canvas.width = sWidth
    canvas.height = sHeight

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      throw new QrDecodeError('Failed to obtain 2D canvas context')
    }

    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight)
    return canvas
  }

  /**
   * Decodes a QR code from a cropped canvas element.
   * Tries native BarcodeDetector first; falls back to jsQR if BarcodeDetector is absent or fails.
   */
  static async decodeCanvas(canvas: HTMLCanvasElement): Promise<string> {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      throw new QrDecodeError('Failed to obtain canvas context for decoding')
    }

    // 1. Try native BarcodeDetector API if available in Chromium
    if (typeof BarcodeDetector !== 'undefined') {
      try {
        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        const barcodes = await detector.detect(canvas)
        if (barcodes.length > 0 && barcodes[0].rawValue) {
          return barcodes[0].rawValue
        }
      } catch {
        // Fall back to jsQR on any detector error
      }
    }

    // 2. Fallback to jsQR decoder
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    })

    if (qrResult && qrResult.data) {
      return qrResult.data
    }

    throw new QrDecodeError('No QR code detected in the selected area.')
  }

  /**
   * Full pipeline: crops screenshot and decodes QR string.
   */
  static async decodeFromScreenshot(
    dataUrl: string,
    crop: CropRect
  ): Promise<string> {
    const canvas = await this.cropImage(dataUrl, crop)
    return this.decodeCanvas(canvas)
  }
}
