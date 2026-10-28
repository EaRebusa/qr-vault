// Storage service: Type-safe wrapper around chrome.storage.local and chrome.storage.session
import type { EncryptedPayload } from '../models/types'

export class StorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'StorageError'
  }
}

const STORAGE_KEYS = {
  VAULT_PAYLOAD: 'vault_encrypted_payload',
  VERIFICATION_TOKEN: 'vault_verification_token',
  AUTO_LOCK_TIMEOUT: 'vault_auto_lock_timeout',
} as const

const SESSION_KEYS = {
  SESSION_PASSWORD: 'vault_session_password',
  SESSION_EXPIRES_AT: 'vault_session_expires_at',
} as const

// In-memory fallback for headless tests or environments where chrome.storage is unavailable
const localFallback = new Map<string, unknown>()
const sessionFallback = new Map<string, unknown>()

export class StorageService {
  private static isChromeStorageAvailable(): boolean {
    return (
      typeof chrome !== 'undefined' &&
      !!chrome.storage &&
      !!chrome.storage.local
    )
  }

  private static isSessionStorageAvailable(): boolean {
    return (
      typeof chrome !== 'undefined' &&
      !!chrome.storage &&
      !!chrome.storage.session
    )
  }

  /**
   * Saves an encrypted payload into local extension storage.
   */
  static async saveEncryptedPayload(payload: EncryptedPayload): Promise<void> {
    try {
      if (this.isChromeStorageAvailable()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.VAULT_PAYLOAD]: payload })
      } else {
        localFallback.set(STORAGE_KEYS.VAULT_PAYLOAD, JSON.parse(JSON.stringify(payload)))
      }
    } catch (err) {
      throw new StorageError('Failed to save vault payload to storage', err)
    }
  }

  /**
   * Retrieves the encrypted vault payload from local extension storage.
   */
  static async getEncryptedPayload(): Promise<EncryptedPayload | null> {
    try {
      if (this.isChromeStorageAvailable()) {
        const result = await chrome.storage.local.get(STORAGE_KEYS.VAULT_PAYLOAD)
        const payload = result[STORAGE_KEYS.VAULT_PAYLOAD] as EncryptedPayload | undefined
        return payload || null
      } else {
        const payload = localFallback.get(STORAGE_KEYS.VAULT_PAYLOAD) as EncryptedPayload | undefined
        return payload ? JSON.parse(JSON.stringify(payload)) : null
      }
    } catch (err) {
      throw new StorageError('Failed to retrieve vault payload from storage', err)
    }
  }

  /**
   * Saves a verification token payload.
   */
  static async saveVerificationToken(payload: EncryptedPayload): Promise<void> {
    try {
      if (this.isChromeStorageAvailable()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.VERIFICATION_TOKEN]: payload })
      } else {
        localFallback.set(STORAGE_KEYS.VERIFICATION_TOKEN, JSON.parse(JSON.stringify(payload)))
      }
    } catch (err) {
      throw new StorageError('Failed to save verification token', err)
    }
  }

  /**
   * Retrieves the verification token payload.
   */
  static async getVerificationToken(): Promise<EncryptedPayload | null> {
    try {
      if (this.isChromeStorageAvailable()) {
        const result = await chrome.storage.local.get(STORAGE_KEYS.VERIFICATION_TOKEN)
        return (result[STORAGE_KEYS.VERIFICATION_TOKEN] as EncryptedPayload) || null
      } else {
        const payload = localFallback.get(STORAGE_KEYS.VERIFICATION_TOKEN) as EncryptedPayload | undefined
        return payload ? JSON.parse(JSON.stringify(payload)) : null
      }
    } catch (err) {
      throw new StorageError('Failed to retrieve verification token', err)
    }
  }

  /**
   * Clears the encrypted vault, verification token, and in-memory session.
   */
  static async clearVault(): Promise<void> {
    try {
      await this.clearSessionAuth()
      if (this.isChromeStorageAvailable()) {
        await chrome.storage.local.remove([
          STORAGE_KEYS.VAULT_PAYLOAD,
          STORAGE_KEYS.VERIFICATION_TOKEN,
        ])
      } else {
        localFallback.delete(STORAGE_KEYS.VAULT_PAYLOAD)
        localFallback.delete(STORAGE_KEYS.VERIFICATION_TOKEN)
      }
    } catch (err) {
      throw new StorageError('Failed to clear vault storage', err)
    }
  }

  /**
   * Checks if a vault has been initialized and exists in storage.
   */
  static async hasVault(): Promise<boolean> {
    const payload = await this.getEncryptedPayload()
    return payload !== null
  }

  /**
   * Retrieves the auto-lock timeout setting in minutes (defaults to 15).
   * 0 = Immediately on close; -1 = On browser close; >0 = Minutes of inactivity.
   */
  static async getAutoLockTimeout(): Promise<number> {
    try {
      if (this.isChromeStorageAvailable()) {
        const result = await chrome.storage.local.get(STORAGE_KEYS.AUTO_LOCK_TIMEOUT)
        const val = result[STORAGE_KEYS.AUTO_LOCK_TIMEOUT]
        return typeof val === 'number' ? val : 15
      } else {
        const val = localFallback.get(STORAGE_KEYS.AUTO_LOCK_TIMEOUT)
        return typeof val === 'number' ? val : 15
      }
    } catch {
      return 15
    }
  }

  /**
   * Sets the auto-lock timeout in minutes.
   */
  static async setAutoLockTimeout(minutes: number): Promise<void> {
    try {
      if (this.isChromeStorageAvailable()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.AUTO_LOCK_TIMEOUT]: minutes })
      } else {
        localFallback.set(STORAGE_KEYS.AUTO_LOCK_TIMEOUT, minutes)
      }
    } catch (err) {
      throw new StorageError('Failed to update auto-lock timeout setting', err)
    }
  }

  /**
   * Saves in-memory session credentials in chrome.storage.session (RAM only, destroyed on browser exit).
   */
  static async saveSessionAuth(password: string, timeoutMinutes: number): Promise<void> {
    if (timeoutMinutes === 0) {
      await this.clearSessionAuth()
      return
    }

    const expiresAt = timeoutMinutes > 0 ? Date.now() + timeoutMinutes * 60 * 1000 : null
    const data = {
      [SESSION_KEYS.SESSION_PASSWORD]: password,
      [SESSION_KEYS.SESSION_EXPIRES_AT]: expiresAt,
    }

    try {
      if (this.isSessionStorageAvailable()) {
        await chrome.storage.session.set(data)
      } else {
        sessionFallback.set(SESSION_KEYS.SESSION_PASSWORD, password)
        sessionFallback.set(SESSION_KEYS.SESSION_EXPIRES_AT, expiresAt)
      }
    } catch {
      // In-memory session may fail in non-supported environments; ignore silently
    }
  }

  /**
   * Retrieves in-memory session password if active and not expired.
   */
  static async getSessionAuth(): Promise<string | null> {
    try {
      let password: string | undefined
      let expiresAt: number | null | undefined

      if (this.isSessionStorageAvailable()) {
        const result = await chrome.storage.session.get([
          SESSION_KEYS.SESSION_PASSWORD,
          SESSION_KEYS.SESSION_EXPIRES_AT,
        ])
        password = result[SESSION_KEYS.SESSION_PASSWORD] as string | undefined
        expiresAt = result[SESSION_KEYS.SESSION_EXPIRES_AT] as number | null | undefined
      } else {
        password = sessionFallback.get(SESSION_KEYS.SESSION_PASSWORD) as string | undefined
        expiresAt = sessionFallback.get(SESSION_KEYS.SESSION_EXPIRES_AT) as number | null | undefined
      }

      if (!password) return null

      // Check expiry if not set to -1 (browser close)
      if (typeof expiresAt === 'number' && Date.now() > expiresAt) {
        await this.clearSessionAuth()
        return null
      }

      return password
    } catch {
      return null
    }
  }

  /**
   * Clears in-memory session storage.
   */
  static async clearSessionAuth(): Promise<void> {
    try {
      if (this.isSessionStorageAvailable()) {
        await chrome.storage.session.remove([
          SESSION_KEYS.SESSION_PASSWORD,
          SESSION_KEYS.SESSION_EXPIRES_AT,
        ])
      } else {
        sessionFallback.delete(SESSION_KEYS.SESSION_PASSWORD)
        sessionFallback.delete(SESSION_KEYS.SESSION_EXPIRES_AT)
      }
    } catch {
      // Ignore
    }
  }
}
