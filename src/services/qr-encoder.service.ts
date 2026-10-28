// QR Encoder Service: Client-side QR generation via qrcode (100% offline, zero network)
import QRCode from 'qrcode'

export class QrEncoderError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'QrEncoderError'
  }
}

export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

export interface QrRenderOptions {
  errorCorrectionLevel?: QrErrorCorrectionLevel
  width?: number
  margin?: number
  darkColor?: string
  lightColor?: string
}

// Practical maximum character limit for reliable decoding
const MAX_QR_TEXT_LENGTH = 2048

export class QrEncoderService {
  /**
   * Validates input text before QR rendering.
   */
  private static validateInput(text: string): void {
    if (!text || text.trim().length === 0) {
      throw new QrEncoderError('Input text cannot be empty')
    }
    if (text.length > MAX_QR_TEXT_LENGTH) {
      throw new QrEncoderError(
        `Input text exceeds maximum allowed length of ${MAX_QR_TEXT_LENGTH} characters.`
      )
    }
  }

  /**
   * Builds normalized options for QRCode renderer.
   */
  private static getNormalizedOptions(options?: QrRenderOptions): QRCode.QRCodeToDataURLOptions {
    return {
      errorCorrectionLevel: options?.errorCorrectionLevel || 'M',
      width: options?.width || 256,
      margin: options?.margin !== undefined ? options.margin : 2,
      color: {
        dark: options?.darkColor || '#000000',
        light: options?.lightColor || '#ffffff',
      },
    }
  }

  /**
   * Renders a QR code onto an existing HTMLCanvasElement.
   */
  static async renderQrToCanvas(
    text: string,
    canvas: HTMLCanvasElement,
    options?: QrRenderOptions
  ): Promise<void> {
    this.validateInput(text)
    try {
      const qrOptions = this.getNormalizedOptions(options)
      await QRCode.toCanvas(canvas, text, qrOptions)
    } catch (err) {
      if (err instanceof QrEncoderError) throw err
      throw new QrEncoderError('Failed to render QR code to canvas', err)
    }
  }

  /**
   * Generates a base64 PNG data URL of the QR code (suitable for downloading or previewing).
   */
  static async generateQrDataUrl(
    text: string,
    options?: QrRenderOptions
  ): Promise<string> {
    this.validateInput(text)
    try {
      const qrOptions = this.getNormalizedOptions(options)
      return await QRCode.toDataURL(text, qrOptions)
    } catch (err) {
      if (err instanceof QrEncoderError) throw err
      throw new QrEncoderError('Failed to generate QR data URL', err)
    }
  }
}
