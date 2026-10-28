// TOTP service: Base32 decoding, URI parsing, and RFC 6238 token generation via crypto.subtle
import type { OtpConfig } from '../models/types'

export class TotpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TotpError'
  }
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export class TotpService {
  /**
   * Decodes an RFC 4648 Base32 encoded string into a Uint8Array.
   */
  static base32Decode(encoded: string): Uint8Array {
    const cleaned = encoded.toUpperCase().replace(/[\s=-]/g, '')
    if (cleaned.length === 0) {
      throw new TotpError('Secret cannot be empty')
    }

    let bits = 0
    let value = 0
    const output: number[] = []

    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i]
      const index = BASE32_ALPHABET.indexOf(char)
      if (index === -1) {
        throw new TotpError(`Invalid Base32 character: "${char}"`)
      }

      value = (value << 5) | index
      bits += 5

      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 0xff)
        bits -= 8
      }
    }

    return new Uint8Array(output)
  }

  /**
   * Parses an otpauth://totp/... URI into an OtpConfig object.
   */
  static parseUri(uriString: string): OtpConfig {
    let url: URL
    try {
      url = new URL(uriString)
    } catch {
      throw new TotpError('Invalid OTP URI format')
    }

    if (url.protocol !== 'otpauth:' || url.host.toLowerCase() !== 'totp') {
      throw new TotpError('Only otpauth://totp/ URIs are supported')
    }

    const rawPath = decodeURIComponent(url.pathname.replace(/^\//, ''))
    let issuerFromPath = ''
    let label = rawPath

    if (rawPath.includes(':')) {
      const parts = rawPath.split(':')
      issuerFromPath = parts[0].trim()
      label = parts.slice(1).join(':').trim()
    }

    const params = url.searchParams
    const secret = params.get('secret')
    if (!secret) {
      throw new TotpError('OTP URI missing required "secret" parameter')
    }

    const issuer = params.get('issuer') || issuerFromPath || undefined
    const period = parseInt(params.get('period') || '30', 10)
    const digits = parseInt(params.get('digits') || '6', 10)

    const rawAlgo = (params.get('algorithm') || 'SHA1').toUpperCase()
    let algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512' = 'SHA-1'
    if (rawAlgo === 'SHA256' || rawAlgo === 'SHA-256') {
      algorithm = 'SHA-256'
    } else if (rawAlgo === 'SHA512' || rawAlgo === 'SHA-512') {
      algorithm = 'SHA-512'
    }

    return {
      secret: secret.trim(),
      issuer,
      label,
      period: isNaN(period) || period <= 0 ? 30 : period,
      digits: isNaN(digits) || digits <= 0 ? 6 : digits,
      algorithm,
    }
  }

  /**
   * Calculates the remaining seconds in the current TOTP cycle.
   */
  static getRemainingSeconds(period = 30, timestampMs = Date.now()): number {
    const epochSeconds = Math.floor(timestampMs / 1000)
    return period - (epochSeconds % period)
  }

  /**
   * Generates a dynamic TOTP token for a given Base32 secret adhering to RFC 6238 / RFC 4226.
   */
  static async generateToken(
    secret: string,
    options: {
      timestampMs?: number
      period?: number
      digits?: number
      algorithm?: 'SHA-1' | 'SHA-256' | 'SHA-512'
    } = {}
  ): Promise<string> {
    const period = options.period ?? 30
    const digits = options.digits ?? 6
    const algorithm = options.algorithm ?? 'SHA-1'
    const timestampMs = options.timestampMs ?? Date.now()

    const counter = Math.floor(Math.floor(timestampMs / 1000) / period)

    const counterBuffer = new ArrayBuffer(8)
    const view = new DataView(counterBuffer)
    view.setUint32(0, Math.floor(counter / 0x100000000), false)
    view.setUint32(4, counter & 0xffffffff, false)

    const secretBytes = this.base32Decode(secret)

    const subtle = typeof window !== 'undefined' && window.crypto?.subtle
      ? window.crypto.subtle
      : globalThis.crypto?.subtle

    if (!subtle) {
      throw new TotpError('Web Crypto API (crypto.subtle) is unavailable')
    }

    const key = await subtle.importKey(
      'raw',
      secretBytes as unknown as BufferSource,
      {
        name: 'HMAC',
        hash: { name: algorithm },
      },
      false,
      ['sign']
    )

    const signature = await subtle.sign('HMAC', key, counterBuffer)
    const hashBytes = new Uint8Array(signature)

    const offset = hashBytes[hashBytes.length - 1] & 0x0f
    const binary =
      ((hashBytes[offset] & 0x7f) << 24) |
      ((hashBytes[offset + 1] & 0xff) << 16) |
      ((hashBytes[offset + 2] & 0xff) << 8) |
      (hashBytes[offset + 3] & 0xff)

    const otp = binary % Math.pow(10, digits)
    return otp.toString().padStart(digits, '0')
  }
}
