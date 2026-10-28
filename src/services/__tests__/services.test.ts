import { describe, it, expect, beforeEach } from 'vitest'
import { CryptoService, DecryptionError } from '../crypto.service'
import { TotpService, TotpError } from '../totp.service'
import { StorageService } from '../storage.service'
import type { EncryptedPayload } from '../../models/types'

describe('CryptoService', () => {
  const password = 'SuperSecurePassphrase123!'
  const plaintext = JSON.stringify({
    version: 1,
    items: [
      { id: '1', label: 'GitHub', secret: 'JBSWY3DPEHPK3PXP', period: 30, digits: 6, createdAt: Date.now() }
    ]
  })

  it('should encrypt and decrypt plaintext successfully with correct password', async () => {
    // Using 5,000 iterations for test speed, production uses default 300,000
    const payload = await CryptoService.encrypt(plaintext, password, 5_000)
    expect(payload.ciphertext).toBeInstanceOf(Array)
    expect(payload.salt.length).toBe(16)
    expect(payload.iv.length).toBe(12)
    expect(payload.ciphertext.length).toBeGreaterThan(0)

    const decrypted = await CryptoService.decrypt(payload, password)
    expect(decrypted).toBe(plaintext)
  })

  it('should reject cleanly with DecryptionError when password is wrong', async () => {
    const payload = await CryptoService.encrypt(plaintext, password, 5_000)
    await expect(CryptoService.decrypt(payload, 'WrongPassword123')).rejects.toThrow(DecryptionError)
  })

  it('should generate unique IV and salt for repeated encryptions', async () => {
    const p1 = await CryptoService.encrypt(plaintext, password, 2_000)
    const p2 = await CryptoService.encrypt(plaintext, password, 2_000)

    expect(p1.iv).not.toEqual(p2.iv)
    expect(p1.salt).not.toEqual(p2.salt)
    expect(p1.ciphertext).not.toEqual(p2.ciphertext)
  })
})

describe('TotpService', () => {
  // RFC 6238 Appendix B test secret: "12345678901234567890" in ASCII
  // Base32 encoded: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
  const rfcBase32Secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

  it('should decode Base32 strings correctly', () => {
    // "Hello!" in Base32 is "JBSWY3DPEE======"
    const decoded = TotpService.base32Decode('JBSWY3DPEE======')
    const text = new TextDecoder().decode(decoded)
    expect(text).toBe('Hello!')
  })

  it('should throw TotpError for invalid Base32 characters', () => {
    expect(() => TotpService.base32Decode('INVALID!@#89')).toThrow(TotpError)
  })

  it('should parse otpauth://totp/ URIs correctly', () => {
    const uri = 'otpauth://totp/Google:alice%40gmail.com?secret=JBSWY3DPEHPK3PXP&issuer=Google&period=30&digits=6&algorithm=SHA1'
    const config = TotpService.parseUri(uri)

    expect(config.issuer).toBe('Google')
    expect(config.label).toBe('alice@gmail.com')
    expect(config.secret).toBe('JBSWY3DPEHPK3PXP')
    expect(config.period).toBe(30)
    expect(config.digits).toBe(6)
    expect(config.algorithm).toBe('SHA-1')
  })

  it('should match RFC 6238 standard test vectors for HMAC-SHA1', async () => {
    // RFC 6238 Appendix B:
    // T = 59s -> 8 digits: 94287082 -> 6 digits: 287082
    const token1 = await TotpService.generateToken(rfcBase32Secret, {
      timestampMs: 59 * 1000,
      period: 30,
      digits: 8,
      algorithm: 'SHA-1'
    })
    expect(token1).toBe('94287082')

    // T = 1111111109s -> 8 digits: 07081804 -> 6 digits: 081804
    const token2 = await TotpService.generateToken(rfcBase32Secret, {
      timestampMs: 1111111109 * 1000,
      period: 30,
      digits: 6,
      algorithm: 'SHA-1'
    })
    expect(token2).toBe('081804')

    // T = 1234567890s -> 8 digits: 89005924 -> 6 digits: 005924
    const token3 = await TotpService.generateToken(rfcBase32Secret, {
      timestampMs: 1234567890 * 1000,
      period: 30,
      digits: 6,
      algorithm: 'SHA-1'
    })
    expect(token3).toBe('005924')
  })

  it('should accurately calculate remaining seconds in period', () => {
    // 65 seconds into epoch: 65 % 30 = 5, remaining = 30 - 5 = 25
    const remaining = TotpService.getRemainingSeconds(30, 65 * 1000)
    expect(remaining).toBe(25)
  })
})

describe('StorageService', () => {
  beforeEach(async () => {
    await StorageService.clearVault()
  })

  it('should store and retrieve encrypted payload', async () => {
    const mockPayload: EncryptedPayload = {
      ciphertext: [1, 2, 3],
      salt: [4, 5, 6],
      iv: [7, 8, 9],
      iterations: 300_000,
    }

    expect(await StorageService.getEncryptedPayload()).toBeNull()
    expect(await StorageService.hasVault()).toBe(false)

    await StorageService.saveEncryptedPayload(mockPayload)

    expect(await StorageService.hasVault()).toBe(true)
    const retrieved = await StorageService.getEncryptedPayload()
    expect(retrieved).toEqual(mockPayload)

    await StorageService.clearVault()
    expect(await StorageService.hasVault()).toBe(false)
    expect(await StorageService.getEncryptedPayload()).toBeNull()
  })

  it('should manage auto-lock timeout setting', async () => {
    expect(await StorageService.getAutoLockTimeout()).toBe(15) // default
    await StorageService.setAutoLockTimeout(60)
    expect(await StorageService.getAutoLockTimeout()).toBe(60)
    await StorageService.setAutoLockTimeout(15)
  })

  it('should store and expire in-memory session password', async () => {
    await StorageService.clearSessionAuth()
    expect(await StorageService.getSessionAuth()).toBeNull()

    // Save with 10 min timeout
    await StorageService.saveSessionAuth('MySessionPass123', 10)
    expect(await StorageService.getSessionAuth()).toBe('MySessionPass123')

    // Timeout 0 immediately clears
    await StorageService.saveSessionAuth('MySessionPass123', 0)
    expect(await StorageService.getSessionAuth()).toBeNull()
  })
})
