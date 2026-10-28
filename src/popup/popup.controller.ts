// Popup Controller: State coordination, view bindings, crypto integration, and lifecycle management
import type { VaultItem, EncryptedPayload, OtpConfig } from '../models/types'
import { CryptoService, DecryptionError } from '../services/crypto.service'
import { StorageService } from '../services/storage.service'
import { TotpService } from '../services/totp.service'
import { QrDecoderService } from '../services/qr-decoder.service'
import { QrEncoderService } from '../services/qr-encoder.service'

const VERIFICATION_STRING = 'QR_VAULT_VALID_SESSION_V1'

class PopupController {
  // Sensitive in-memory state (strictly destroyed on close/lock)
  private masterPassword = ''
  private vaultItems: VaultItem[] = []
  private isUnlocked = false
  private isFirstRun = false
  private failedAttempts = 0
  private totpTimerId: number | null = null
  private scannedOtpConfig: OtpConfig | null = null
  private debounceTimer: number | null = null

  // DOM Elements
  private authSection!: HTMLElement
  private appSection!: HTMLElement
  private authTitle!: HTMLElement
  private authDesc!: HTMLElement
  private authAlert!: HTMLElement
  private authForm!: HTMLFormElement
  private authPasswordInput!: HTMLInputElement
  private authPasswordConfirmInput!: HTMLInputElement
  private confirmPasswordGroup!: HTMLElement
  private authSubmitBtn!: HTMLButtonElement
  private statusDot!: HTMLElement
  private statusText!: HTMLElement
  private tabButtons!: NodeListOf<HTMLButtonElement>
  private viewSections!: NodeListOf<HTMLElement>

  // Vault DOM
  private vaultSearchInput!: HTMLInputElement
  private vaultItemsContainer!: HTMLElement
  private manualAddToggleBtn!: HTMLButtonElement
  private manualAddCard!: HTMLElement
  private manualLabelInput!: HTMLInputElement
  private manualIssuerInput!: HTMLInputElement
  private manualSecretInput!: HTMLInputElement
  private manualSaveBtn!: HTMLButtonElement
  private manualCancelBtn!: HTMLButtonElement

  // Scan DOM
  private snipBtn!: HTMLButtonElement
  private scanStatus!: HTMLElement
  private decodedCard!: HTMLElement
  private decodedRawText!: HTMLElement
  private copyDecodedBtn!: HTMLButtonElement
  private otpDetectedPanel!: HTMLElement
  private otpDetectedSummary!: HTMLElement
  private saveScannedOtpBtn!: HTMLButtonElement

  // Generate DOM
  private qrGenInput!: HTMLTextAreaElement
  private qrGenEcc!: HTMLSelectElement
  private qrGenCanvas!: HTMLCanvasElement
  private downloadQrBtn!: HTMLButtonElement

  // Settings DOM
  private autoLockSelect!: HTMLSelectElement
  private lockVaultBtn!: HTMLButtonElement
  private exportVaultBtn!: HTMLButtonElement
  private importVaultBtn!: HTMLButtonElement
  private importFileInput!: HTMLInputElement
  private wipeVaultBtn!: HTMLButtonElement

  async init(): Promise<void> {
    this.cacheDom()
    this.bindEvents()
    await this.checkInitialState()
    await this.checkForPendingSnipResult()
  }

  private cacheDom(): void {
    this.authSection = document.getElementById('auth-section')!
    this.appSection = document.getElementById('app-section')!
    this.authTitle = document.getElementById('auth-title')!
    this.authDesc = document.getElementById('auth-desc')!
    this.authAlert = document.getElementById('auth-alert')!
    this.authForm = document.getElementById('auth-form') as HTMLFormElement
    this.authPasswordInput = document.getElementById('auth-password') as HTMLInputElement
    this.authPasswordConfirmInput = document.getElementById('auth-password-confirm') as HTMLInputElement
    this.confirmPasswordGroup = document.getElementById('confirm-password-group')!
    this.authSubmitBtn = document.getElementById('auth-submit-btn') as HTMLButtonElement
    this.statusDot = document.getElementById('status-dot')!
    this.statusText = document.getElementById('status-text')!
    this.tabButtons = document.querySelectorAll('.tab-btn')
    this.viewSections = document.querySelectorAll('.view-section')

    this.vaultSearchInput = document.getElementById('vault-search-input') as HTMLInputElement
    this.vaultItemsContainer = document.getElementById('vault-items-container')!
    this.manualAddToggleBtn = document.getElementById('vault-add-manual-toggle') as HTMLButtonElement
    this.manualAddCard = document.getElementById('manual-add-card')!
    this.manualLabelInput = document.getElementById('manual-label') as HTMLInputElement
    this.manualIssuerInput = document.getElementById('manual-issuer') as HTMLInputElement
    this.manualSecretInput = document.getElementById('manual-secret') as HTMLInputElement
    this.manualSaveBtn = document.getElementById('manual-save-btn') as HTMLButtonElement
    this.manualCancelBtn = document.getElementById('manual-cancel-btn') as HTMLButtonElement

    this.snipBtn = document.getElementById('snip-active-tab-btn') as HTMLButtonElement
    this.scanStatus = document.getElementById('scan-status')!
    this.decodedCard = document.getElementById('decoded-card')!
    this.decodedRawText = document.getElementById('decoded-raw-text')!
    this.copyDecodedBtn = document.getElementById('copy-decoded-btn') as HTMLButtonElement
    this.otpDetectedPanel = document.getElementById('otp-detected-panel')!
    this.otpDetectedSummary = document.getElementById('otp-detected-summary')!
    this.saveScannedOtpBtn = document.getElementById('save-scanned-otp-btn') as HTMLButtonElement

    this.qrGenInput = document.getElementById('qr-gen-input') as HTMLTextAreaElement
    this.qrGenEcc = document.getElementById('qr-gen-ecc') as HTMLSelectElement
    this.qrGenCanvas = document.getElementById('qr-gen-canvas') as HTMLCanvasElement
    this.downloadQrBtn = document.getElementById('download-qr-btn') as HTMLButtonElement

    this.autoLockSelect = document.getElementById('auto-lock-select') as HTMLSelectElement
    this.lockVaultBtn = document.getElementById('lock-vault-btn') as HTMLButtonElement
    this.exportVaultBtn = document.getElementById('export-vault-btn') as HTMLButtonElement
    this.importVaultBtn = document.getElementById('import-vault-btn') as HTMLButtonElement
    this.importFileInput = document.getElementById('import-vault-file') as HTMLInputElement
    this.wipeVaultBtn = document.getElementById('wipe-vault-btn') as HTMLButtonElement
  }

  private bindEvents(): void {
    // Window lifecycle: zero out local memory on close
    window.addEventListener('beforeunload', () => this.handleUnload())

    // Master password form
    this.authForm.addEventListener('submit', (e) => {
      e.preventDefault()
      this.handleAuthSubmit()
    })

    // Tab navigation
    this.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab as string
        this.switchTab(tab)
      })
    })

    // Vault search
    this.vaultSearchInput.addEventListener('input', () => this.renderVaultItems())

    // Manual account form
    this.manualAddToggleBtn.addEventListener('click', () => {
      const isVisible = this.manualAddCard.style.display !== 'none'
      this.manualAddCard.style.display = isVisible ? 'none' : 'block'
      if (!isVisible) this.manualLabelInput.focus()
    })
    this.manualCancelBtn.addEventListener('click', () => {
      this.manualAddCard.style.display = 'none'
    })
    this.manualSaveBtn.addEventListener('click', () => this.handleSaveManualAccount())

    // Screen snipping
    this.snipBtn.addEventListener('click', () => this.triggerScreenSnip())
    this.copyDecodedBtn.addEventListener('click', () => {
      const text = this.decodedRawText.textContent || ''
      if (text) this.copyToClipboard(text, this.copyDecodedBtn)
    })
    this.saveScannedOtpBtn.addEventListener('click', () => this.saveScannedOtpToVault())

    // Runtime message listener for snipping results
    chrome.runtime?.onMessage?.addListener((msg) => {
      if (msg.type === 'SNIP_RESULT') {
        this.handleSnipCaptured(msg.dataUrl, msg.rect)
      } else if (msg.type === 'SNIP_ERROR') {
        this.showScanAlert(msg.error || 'Failed to capture screen', 'error')
      } else if (msg.type === 'SNIP_CANCELLED') {
        this.showScanAlert('Screen snipping cancelled', 'info')
      }
    })

    // QR Code Generator
    this.qrGenInput.addEventListener('input', () => this.debounceGenerateQr())
    this.qrGenEcc.addEventListener('change', () => this.renderGeneratedQr())
    this.downloadQrBtn.addEventListener('click', () => this.handleDownloadQr())

    // Settings actions
    this.autoLockSelect.addEventListener('change', async () => {
      const minutes = parseInt(this.autoLockSelect.value, 10)
      await StorageService.setAutoLockTimeout(minutes)
      if (this.masterPassword) {
        await StorageService.saveSessionAuth(this.masterPassword, minutes)
      }
    })
    this.lockVaultBtn.addEventListener('click', async () => {
      await StorageService.clearSessionAuth()
      this.lockVault()
    })
    this.exportVaultBtn.addEventListener('click', () => this.handleExportVault())
    this.importVaultBtn.addEventListener('click', () => this.importFileInput.click())
    this.importFileInput.addEventListener('change', (e) => this.handleImportVault(e))
    this.wipeVaultBtn.addEventListener('click', () => this.handleWipeVault())
  }

  private async checkInitialState(): Promise<void> {
    const timeout = await StorageService.getAutoLockTimeout()
    if (this.autoLockSelect) {
      this.autoLockSelect.value = timeout.toString()
    }

    const hasExistingVault = await StorageService.hasVault()
    const verificationToken = await StorageService.getVerificationToken()

    if (!hasExistingVault && !verificationToken) {
      this.isFirstRun = true
      this.authTitle.textContent = 'Create Master Password'
      this.authDesc.textContent = 'Set a master password or PIN to encrypt your local vault (min 4 chars).'
      this.confirmPasswordGroup.style.display = 'block'
      this.authSubmitBtn.textContent = 'Create Vault'
      this.authPasswordInput.focus()
      return
    }

    this.isFirstRun = false
    this.authTitle.textContent = 'Unlock Secure Vault'
    this.authDesc.textContent = 'Enter your master password or PIN to access your 2FA accounts.'
    this.confirmPasswordGroup.style.display = 'none'
    this.authSubmitBtn.textContent = 'Unlock'

    // Check for active in-memory session (chrome.storage.session)
    const sessionPassword = await StorageService.getSessionAuth()
    if (sessionPassword) {
      try {
        const payload = await StorageService.getEncryptedPayload()
        if (payload) {
          const decryptedJson = await CryptoService.decrypt(payload, sessionPassword)
          this.vaultItems = JSON.parse(decryptedJson)
        } else {
          this.vaultItems = []
        }
        this.masterPassword = sessionPassword
        await StorageService.saveSessionAuth(sessionPassword, timeout)
        this.unlockSuccess()
        return
      } catch {
        await StorageService.clearSessionAuth()
      }
    }

    this.authPasswordInput.focus()
  }

  private async handleAuthSubmit(): Promise<void> {
    const password = this.authPasswordInput.value.trim()
    if (!password || password.length < 4) {
      this.showAuthAlert('Password must be at least 4 characters.', 'error')
      return
    }

    // Anti-brute-force delay
    if (this.failedAttempts > 0) {
      this.authSubmitBtn.disabled = true
      const delayMs = Math.min(this.failedAttempts * 1000, 5000)
      this.showAuthAlert(`Rate limited: Please wait ${delayMs / 1000}s...`, 'info')
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      this.authSubmitBtn.disabled = false
    }

    if (this.isFirstRun) {
      const confirm = this.authPasswordConfirmInput.value.trim()
      if (password !== confirm) {
        this.showAuthAlert('Passwords do not match.', 'error')
        return
      }

      try {
        this.authSubmitBtn.disabled = true
        this.authSubmitBtn.textContent = 'Initializing vault...'

        // Save verification token
        const verificationPayload = await CryptoService.encrypt(VERIFICATION_STRING, password)
        await StorageService.saveVerificationToken(verificationPayload)

        // Initialize empty vault
        const emptyVaultPayload = await CryptoService.encrypt(JSON.stringify([]), password)
        await StorageService.saveEncryptedPayload(emptyVaultPayload)

        this.masterPassword = password
        this.vaultItems = []
        const timeout = await StorageService.getAutoLockTimeout()
        if (timeout !== 0) {
          await StorageService.saveSessionAuth(password, timeout)
        }
        this.unlockSuccess()
      } catch (err) {
        this.showAuthAlert('Failed to initialize vault: ' + (err instanceof Error ? err.message : ''), 'error')
      } finally {
        this.authSubmitBtn.disabled = false
        this.authSubmitBtn.textContent = 'Create Vault'
      }
    } else {
      try {
        this.authSubmitBtn.disabled = true
        this.authSubmitBtn.textContent = 'Decrypting...'

        // Verify password against verification token or vault payload
        const verificationToken = await StorageService.getVerificationToken()
        if (verificationToken) {
          const testString = await CryptoService.decrypt(verificationToken, password)
          if (testString !== VERIFICATION_STRING) {
            throw new DecryptionError()
          }
        }

        // Decrypt vault payload
        const payload = await StorageService.getEncryptedPayload()
        if (payload) {
          const decryptedJson = await CryptoService.decrypt(payload, password)
          this.vaultItems = JSON.parse(decryptedJson)
        } else {
          this.vaultItems = []
        }

        this.masterPassword = password
        this.failedAttempts = 0
        const timeout = await StorageService.getAutoLockTimeout()
        if (timeout !== 0) {
          await StorageService.saveSessionAuth(password, timeout)
        }
        this.unlockSuccess()
      } catch {
        this.failedAttempts++
        this.showAuthAlert('Incorrect password. Access denied.', 'error')
        this.authPasswordInput.value = ''
        this.authPasswordInput.focus()
      } finally {
        this.authSubmitBtn.disabled = false
        this.authSubmitBtn.textContent = 'Unlock'
      }
    }
  }

  private unlockSuccess(): void {
    this.isUnlocked = true
    this.authSection.style.display = 'none'
    this.appSection.style.display = 'block'
    this.statusDot.classList.add('unlocked')
    this.statusText.textContent = 'Unlocked'

    this.authPasswordInput.value = ''
    this.authPasswordConfirmInput.value = ''
    this.hideAuthAlert()

    this.startTotpTimer()
    this.renderVaultItems()
    this.switchTab('vault')
  }

  private async handleUnload(): Promise<void> {
    const timeout = await StorageService.getAutoLockTimeout()
    if (timeout === 0) {
      await StorageService.clearSessionAuth()
      this.lockVault()
    } else {
      this.masterPassword = ''
      this.vaultItems = []
      this.stopTotpTimer()
    }
  }

  private lockVault(): void {
    // Zero out memory
    this.masterPassword = ''
    this.vaultItems = []
    this.isUnlocked = false
    this.stopTotpTimer()

    this.statusDot.classList.remove('unlocked')
    this.statusText.textContent = 'Locked'
    this.appSection.style.display = 'none'
    this.authSection.style.display = 'block'
    this.authPasswordInput.value = ''
    this.checkInitialState()
  }

  private switchTab(tabName: string): void {
    this.tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName)
    })
    this.viewSections.forEach((section) => {
      section.classList.toggle('active', section.id === `tab-${tabName}`)
    })

    if (tabName === 'generate') {
      this.renderGeneratedQr()
    }
  }

  // --- TOTP Timer Loop ---
  private startTotpTimer(): void {
    this.stopTotpTimer()
    this.updateTotpDisplays()
    this.totpTimerId = window.setInterval(() => {
      this.updateTotpDisplays()
    }, 1000)
  }

  private stopTotpTimer(): void {
    if (this.totpTimerId !== null) {
      clearInterval(this.totpTimerId)
      this.totpTimerId = null
    }
  }

  private async updateTotpDisplays(): Promise<void> {
    if (!this.isUnlocked) return

    const remaining = TotpService.getRemainingSeconds(30)
    const progressPercent = (remaining / 30) * 100

    const progressBars = document.querySelectorAll<HTMLElement>('.progress-bar')
    progressBars.forEach((bar) => {
      bar.style.width = `${progressPercent}%`
      if (remaining <= 5) {
        bar.classList.add('expiring')
      } else {
        bar.classList.remove('expiring')
      }
    })

    // If remaining is 30 or 29 (new cycle) or elements empty, compute tokens
    const displays = document.querySelectorAll<HTMLElement>('.totp-code-display')
    for (const el of Array.from(displays)) {
      const secret = el.dataset.secret
      if (secret) {
        try {
          const rawCode = await TotpService.generateToken(secret, {
            period: parseInt(el.dataset.period || '30', 10),
            digits: parseInt(el.dataset.digits || '6', 10),
          })
          const formatted = rawCode.length === 6 ? `${rawCode.slice(0, 3)} ${rawCode.slice(3)}` : rawCode
          el.textContent = formatted
          el.dataset.rawCode = rawCode
        } catch {
          el.textContent = 'ERROR'
        }
      }
    }
  }

  // --- Vault UI & Actions ---
  private renderVaultItems(): void {
    const filter = this.vaultSearchInput.value.trim().toLowerCase()
    const filtered = this.vaultItems.filter(
      (item) =>
        item.label.toLowerCase().includes(filter) ||
        (item.issuer && item.issuer.toLowerCase().includes(filter))
    )

    if (filtered.length === 0) {
      this.vaultItemsContainer.innerHTML = `
        <div class="vault-empty-state">
          ${filter ? 'No matching accounts found.' : 'No accounts saved yet. Snip a QR code or click + to add one.'}
        </div>
      `
      return
    }

    this.vaultItemsContainer.innerHTML = ''
    filtered.forEach((item) => {
      const card = document.createElement('div')
      card.className = 'vault-item'
      card.innerHTML = `
        <div class="vault-item-header">
          <span class="vault-issuer">${this.escapeHtml(item.issuer || 'Account')}</span>
          <span class="vault-label" title="${this.escapeHtml(item.label)}">${this.escapeHtml(item.label)}</span>
        </div>
        <div class="vault-item-body">
          <div class="totp-code-display" data-secret="${item.secret}" data-period="${item.period}" data-digits="${item.digits}" title="Click to copy code">
            --- ---
          </div>
          <div class="totp-actions">
            <button class="icon-btn copy-code-btn" title="Copy OTP code">Copy</button>
            <button class="icon-btn delete-item-btn" title="Delete account" style="color: var(--danger);">✕</button>
          </div>
        </div>
        <div class="progress-track">
          <div class="progress-bar"></div>
        </div>
      `

      // Copy code click
      const codeDisplay = card.querySelector<HTMLElement>('.totp-code-display')!
      const copyBtn = card.querySelector<HTMLButtonElement>('.copy-code-btn')!
      const triggerCopy = () => {
        const rawCode = codeDisplay.dataset.rawCode
        if (rawCode) this.copyToClipboard(rawCode, copyBtn)
      }
      codeDisplay.addEventListener('click', triggerCopy)
      copyBtn.addEventListener('click', triggerCopy)

      // Delete account
      const deleteBtn = card.querySelector<HTMLButtonElement>('.delete-item-btn')!
      deleteBtn.addEventListener('click', () => this.handleDeleteAccount(item.id))

      this.vaultItemsContainer.appendChild(card)
    })

    this.updateTotpDisplays()
  }

  private async saveVaultToStorage(): Promise<void> {
    if (!this.masterPassword) return
    const json = JSON.stringify(this.vaultItems)
    const encrypted = await CryptoService.encrypt(json, this.masterPassword)
    await StorageService.saveEncryptedPayload(encrypted)
  }

  private async handleSaveManualAccount(): Promise<void> {
    const label = this.manualLabelInput.value.trim()
    const issuer = this.manualIssuerInput.value.trim()
    const secret = this.manualSecretInput.value.trim().replace(/\s+/g, '')

    if (!label) {
      alert('Please enter an account name.')
      return
    }
    if (!secret) {
      alert('Please enter a secret key.')
      return
    }

    try {
      TotpService.base32Decode(secret)
    } catch {
      alert('Invalid Base32 secret key. Please check your key.')
      return
    }

    const newItem: VaultItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      label,
      issuer: issuer || undefined,
      secret,
      period: 30,
      digits: 6,
      createdAt: Date.now(),
    }

    this.vaultItems.unshift(newItem)
    await this.saveVaultToStorage()

    this.manualLabelInput.value = ''
    this.manualIssuerInput.value = ''
    this.manualSecretInput.value = ''
    this.manualAddCard.style.display = 'none'

    this.renderVaultItems()
  }

  private async handleDeleteAccount(id: string): Promise<void> {
    const target = this.vaultItems.find((i) => i.id === id)
    if (!target) return

    if (confirm(`Are you sure you want to delete ${target.issuer || target.label}?`)) {
      this.vaultItems = this.vaultItems.filter((i) => i.id !== id)
      await this.saveVaultToStorage()
      this.renderVaultItems()
    }
  }

  // --- Snipping & Scanning ---
  private async triggerScreenSnip(): Promise<void> {
    this.showScanAlert('Crosshair active. Drag a box over the QR code on the webpage...', 'info')
    this.decodedCard.classList.remove('visible')

    try {
      const response = await chrome.runtime.sendMessage({ type: 'START_SNIP' })
      if (response && !response.success) {
        this.showScanAlert(response.error || 'Failed to start snipping', 'error')
      }
    } catch (err) {
      this.showScanAlert(err instanceof Error ? err.message : 'Error starting snip', 'error')
    }
  }

  private async checkForPendingSnipResult(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return
    const res = (await chrome.storage.local.get('temp_snip_result')) as {
      temp_snip_result?: { dataUrl: string; rect: any }
    }
    const pending = res.temp_snip_result
    if (pending?.dataUrl && pending?.rect) {
      await chrome.storage.local.remove('temp_snip_result')
      this.switchTab('scan')
      await this.handleSnipCaptured(pending.dataUrl, pending.rect)
    }
  }

  private async handleSnipCaptured(dataUrl: string, rect: any): Promise<void> {
    this.showScanAlert('Processing cropped image...', 'info')
    this.switchTab('scan')

    try {
      const decodedText = await QrDecoderService.decodeFromScreenshot(dataUrl, rect)
      this.displayDecodedResult(decodedText)
      this.hideScanAlert()
    } catch (err) {
      this.showScanAlert(err instanceof Error ? err.message : 'Failed to decode QR code', 'error')
      this.decodedCard.classList.remove('visible')
    }
  }

  private displayDecodedResult(text: string): void {
    this.decodedCard.classList.add('visible')
    this.decodedRawText.textContent = text

    // Check if OTP Auth URI
    if (text.startsWith('otpauth://totp/')) {
      try {
        const otp = TotpService.parseUri(text)
        this.scannedOtpConfig = otp
        this.otpDetectedPanel.style.display = 'block'
        this.otpDetectedSummary.textContent = `${otp.issuer ? otp.issuer + ' - ' : ''}${otp.label}`
      } catch {
        this.otpDetectedPanel.style.display = 'none'
        this.scannedOtpConfig = null
      }
    } else {
      this.otpDetectedPanel.style.display = 'none'
      this.scannedOtpConfig = null
    }
  }

  private async saveScannedOtpToVault(): Promise<void> {
    if (!this.scannedOtpConfig) return

    const newItem: VaultItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      label: this.scannedOtpConfig.label || 'Account',
      issuer: this.scannedOtpConfig.issuer,
      secret: this.scannedOtpConfig.secret,
      period: this.scannedOtpConfig.period,
      digits: this.scannedOtpConfig.digits,
      createdAt: Date.now(),
    }

    this.vaultItems.unshift(newItem)
    await this.saveVaultToStorage()

    this.scannedOtpConfig = null
    this.otpDetectedPanel.style.display = 'none'
    this.renderVaultItems()
    this.switchTab('vault')
  }

  // --- QR Generator ---
  private debounceGenerateQr(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer)
    this.debounceTimer = window.setTimeout(() => {
      this.renderGeneratedQr()
    }, 300)
  }

  private async renderGeneratedQr(): Promise<void> {
    const text = this.qrGenInput.value.trim() || 'https://github.com'
    const ecc = (this.qrGenEcc.value as 'M' | 'H') || 'M'

    try {
      await QrEncoderService.renderQrToCanvas(text, this.qrGenCanvas, {
        errorCorrectionLevel: ecc,
        width: 180,
        margin: 1,
      })
    } catch {
      // Ignored during typing
    }
  }

  private async handleDownloadQr(): Promise<void> {
    const text = this.qrGenInput.value.trim() || 'https://github.com'
    const ecc = (this.qrGenEcc.value as 'M' | 'H') || 'M'

    try {
      const dataUrl = await QrEncoderService.generateQrDataUrl(text, {
        errorCorrectionLevel: ecc,
        width: 512,
        margin: 2,
      })

      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `qr-${Date.now()}.png`
      a.click()
    } catch (err) {
      alert('Failed to generate PNG: ' + (err instanceof Error ? err.message : ''))
    }
  }

  // --- Settings Actions ---
  private async handleExportVault(): Promise<void> {
    const payload = await StorageService.getEncryptedPayload()
    if (!payload) {
      alert('Vault is empty. Nothing to export.')
      return
    }

    const exportData = {
      app: 'qr-vault-extension',
      version: 1,
      exportedAt: new Date().toISOString(),
      payload,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `qr-vault-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  private handleImportVault(e: Event): void {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const json = JSON.parse(reader.result as string)
        if (!json.payload?.ciphertext || !json.payload?.salt || !json.payload?.iv) {
          throw new Error('Invalid backup file format.')
        }

        if (confirm('Importing will replace your current encrypted vault data. Continue?')) {
          await StorageService.saveEncryptedPayload(json.payload as EncryptedPayload)
          alert('Vault imported successfully. Please unlock using the master password associated with the backup.')
          this.lockVault()
        }
      } catch (err) {
        alert('Failed to import backup: ' + (err instanceof Error ? err.message : ''))
      } finally {
        input.value = ''
      }
    }
    reader.readAsText(file)
  }

  private async handleWipeVault(): Promise<void> {
    if (confirm('CAUTION: This will permanently delete your encrypted vault and all 2FA keys. Are you absolutely sure?')) {
      if (confirm('Confirm a second time: This cannot be undone. Proceed?')) {
        await StorageService.clearVault()
        this.lockVault()
        alert('Vault wiped successfully.')
      }
    }
  }

  // --- Helpers ---
  private async copyToClipboard(text: string, btnElement?: HTMLElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      if (btnElement) {
        const originalText = btnElement.textContent
        btnElement.textContent = 'Copied!'
        btnElement.classList.add('copied')
        setTimeout(() => {
          btnElement.textContent = originalText
          btnElement.classList.remove('copied')
        }, 2000)
      }

      // Security Improvement: Auto-clear clipboard after 30 seconds
      setTimeout(async () => {
        try {
          const current = await navigator.clipboard.readText()
          if (current === text) {
            await navigator.clipboard.writeText('')
          }
        } catch {
          // Clipboard read permission might be restricted; ignore silently
        }
      }, 30_000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }

  private showAuthAlert(msg: string, type: 'error' | 'info'): void {
    this.authAlert.textContent = msg
    this.authAlert.className = `auth-alert ${type}`
  }

  private hideAuthAlert(): void {
    this.authAlert.className = 'auth-alert'
    this.authAlert.textContent = ''
  }

  private showScanAlert(msg: string, type: 'error' | 'info'): void {
    this.scanStatus.textContent = msg
    this.scanStatus.className = `auth-alert ${type}`
    this.scanStatus.style.display = 'block'
  }

  private hideScanAlert(): void {
    this.scanStatus.style.display = 'none'
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
}

// Controller entry point
document.addEventListener('DOMContentLoaded', () => {
  const controller = new PopupController()
  controller.init()
})
