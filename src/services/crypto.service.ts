// Crypto service: Zero-knowledge local encryption via Web Crypto API (crypto.subtle)
import type { EncryptedPayload } from '../models/types'

export class CryptoError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'CryptoError'
  }
}

export class DecryptionError extends CryptoError {
  constructor(message = 'Decryption failed: Incorrect password or corrupted payload', cause?: unknown) {
    super(message, cause)
    this.name = 'DecryptionError'
  }
}

export const DEFAULT_PBKDF2_ITERATIONS = 300_000

export class CryptoService {
  private static getWebCrypto(): SubtleCrypto {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      return window.crypto.subtle
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
      return globalThis.crypto.subtle
    }
    throw new CryptoError('Web Crypto API (crypto.subtle) is not supported in this environment')
  }

  private static getRandomValues(array: Uint8Array): Uint8Array {
    const cryptoObj = (typeof window !== 'undefined' && window.crypto)
      ? window.crypto
      : (typeof globalThis !== 'undefined' && globalThis.crypto)
        ? globalThis.crypto
        : null

    if (!cryptoObj?.getRandomValues) {
      throw new CryptoError('crypto.getRandomValues is not supported in this environment')
    }

    // Explicit any cast to bridge TypeScript DOM ArrayBuffer vs ArrayBufferLike incompatibility
    return (cryptoObj.getRandomValues as (arr: unknown) => unknown)(array) as Uint8Array
  }

  private static async deriveKey(
    password: string,
    salt: Uint8Array,
    iterations: number
  ): Promise<CryptoKey> {
    const subtle = this.getWebCrypto()
    const encoder = new TextEncoder()
    const passwordBuffer = encoder.encode(password)

    const keyMaterial = await subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    )

    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt']
    )
  }

  static async encrypt(
    plainText: string,
    password: string,
    iterations: number = DEFAULT_PBKDF2_ITERATIONS
  ): Promise<EncryptedPayload> {
    try {
      const subtle = this.getWebCrypto()
      const salt = this.getRandomValues(new Uint8Array(16))
      const iv = this.getRandomValues(new Uint8Array(12))

      const key = await this.deriveKey(password, salt, iterations)
      const encodedText = new TextEncoder().encode(plainText)

      const cipherBuffer = await subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv as BufferSource,
        },
        key,
        encodedText
      )

      return {
        ciphertext: Array.from(new Uint8Array(cipherBuffer)),
        salt: Array.from(salt),
        iv: Array.from(iv),
        iterations,
      }
    } catch (err) {
      if (err instanceof CryptoError) throw err
      throw new CryptoError('Encryption failed', err)
    }
  }

  static async decrypt(
    payload: EncryptedPayload,
    password: string
  ): Promise<string> {
    try {
      const subtle = this.getWebCrypto()
      const salt = new Uint8Array(payload.salt)
      const iv = new Uint8Array(payload.iv)
      const ciphertext = new Uint8Array(payload.ciphertext)
      const iterations = payload.iterations || 100_000

      const key = await this.deriveKey(password, salt, iterations)

      const decryptedBuffer = await subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv as BufferSource,
        },
        key,
        ciphertext
      )

      return new TextDecoder().decode(decryptedBuffer)
    } catch (err) {
      if (err instanceof DecryptionError) throw err
      throw new DecryptionError('Decryption failed: Incorrect password or corrupted payload', err)
    }
  }
}
