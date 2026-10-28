import { describe, it, expect, vi } from 'vitest'
import { QrEncoderService, QrEncoderError } from '../qr-encoder.service'
import QRCode from 'qrcode'

describe('QrEncoderService', () => {
  const sampleUrl = 'https://github.com/secure-qr-vault'

  it('should validate and reject empty or whitespace input', async () => {
    await expect(QrEncoderService.generateQrDataUrl('')).rejects.toThrow(QrEncoderError)
    await expect(QrEncoderService.generateQrDataUrl('   ')).rejects.toThrow('Input text cannot be empty')
  })

  it('should reject input exceeding the maximum character limit', async () => {
    const hugeText = 'A'.repeat(2500)
    await expect(QrEncoderService.generateQrDataUrl(hugeText)).rejects.toThrow('exceeds maximum allowed length')
  })

  it('should generate a valid PNG data URL for valid text', async () => {
    const dataUrl = await QrEncoderService.generateQrDataUrl(sampleUrl, {
      errorCorrectionLevel: 'H',
      width: 200,
    })

    expect(dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(dataUrl.length).toBeGreaterThan(100)
  })

  it('should render to canvas when provided an HTMLCanvasElement', async () => {
    const mockCanvas = {} as HTMLCanvasElement
    const toCanvasSpy = vi.spyOn(QRCode, 'toCanvas').mockResolvedValue(undefined)

    await QrEncoderService.renderQrToCanvas(sampleUrl, mockCanvas, {
      errorCorrectionLevel: 'M',
      width: 180,
    })

    expect(toCanvasSpy).toHaveBeenCalledWith(
      mockCanvas,
      sampleUrl,
      expect.objectContaining({
        errorCorrectionLevel: 'M',
        width: 180,
      })
    )
    toCanvasSpy.mockRestore()
  })
})
