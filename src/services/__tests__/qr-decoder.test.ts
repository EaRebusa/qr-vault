import { describe, it, expect, vi } from 'vitest'
import { QrDecoderService, QrDecodeError } from '../qr-decoder.service'

describe('QrDecoderService', () => {
  it('should throw QrDecodeError when no QR code is present in the image data', async () => {
    // Blank canvas context
    const mockContext = {
      getImageData: vi.fn().mockReturnValue({
        data: new Uint8ClampedArray(100 * 100 * 4),
        width: 100,
        height: 100,
      }),
    }

    const mockCanvas = {
      width: 100,
      height: 100,
      getContext: vi.fn().mockReturnValue(mockContext),
    } as unknown as HTMLCanvasElement

    await expect(QrDecoderService.decodeCanvas(mockCanvas)).rejects.toThrow(QrDecodeError)
    await expect(QrDecoderService.decodeCanvas(mockCanvas)).rejects.toThrow('No QR code detected in the selected area.')
  })

  it('should throw QrDecodeError when context cannot be obtained', async () => {
    const mockCanvas = {
      width: 100,
      height: 100,
      getContext: vi.fn().mockReturnValue(null),
    } as unknown as HTMLCanvasElement

    await expect(QrDecoderService.decodeCanvas(mockCanvas)).rejects.toThrow('Failed to obtain canvas context for decoding')
  })
})
