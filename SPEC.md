Project Specification: Personal Secure QR Scanner & TOTP Vault Extension
1. System Overview
A client-side Chromium browser extension (Manifest V3) that provides:

Viewport screen snipping to crop and scan QR codes from the active tab.

Full RFC 6238 TOTP (Time-based One-Time Password) code generation.

Raw URI and text inspection with clipboard copying.

Client-side QR code generator.

Zero-knowledge local encrypted storage via crypto.subtle (PBKDF2 + AES-256-GCM) unlocked by a user PIN.

No external network calls, analytics, or remote tracking. 100% offline.

2. Tech Stack & Environment
Runtime: Chromium Extensions API (Manifest V3).

Language: TypeScript (strict mode enabled).

Build Tool / Bundler: Vite with @crxjs/vite-plugin (or plain esbuild / tsc).

Dependencies (Runtime):

qrcode (or qr-code-styling) — for generating QR code canvases.

Zero runtime crypto libraries — use native browser window.crypto.subtle.

Zero external QR decoders — target native Chromium BarcodeDetector API with fallback to jsqr if needed.

Dependencies (Development):

typescript (^5.0.0)

@types/chrome

vite


3. Directory Layout & Architecture (MVC)

qr-vault-extension/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── background/
│   │   └── service-worker.ts      # Captures active tab screenshots via chrome.tabs
│   ├── content/
│   │   ├── snip-overlay.ts        # Injected drag-to-crop crosshair UI
│   │   └── snip-overlay.css       # Fullscreen dimmed backdrop and highlight box
│   ├── popup/
│   │   ├── index.html             # Multi-tab layout (Vault, Scan, Generate, Settings)
│   │   ├── popup.css              # Minimalist dark theme UI
│   │   └── popup.controller.ts    # DOM binding, tab switching, and state coordinator
│   ├── models/
│   │   └── types.ts               # Core interfaces (VaultItem, EncryptedPayload, OtpConfig)
│   └── services/
│       ├── crypto.service.ts      # PBKDF2 key derivation and AES-GCM encrypt/decrypt
│       ├── qr-decoder.service.ts  # Cropping coordinate canvas pipeline and BarcodeDetector
│       ├── qr-encoder.service.ts  # String-to-canvas rendering
│       ├── totp.service.ts        # Base32 decoding, HMAC-SHA1 hashing, token generation
│       └── storage.service.ts     # Wrapper around chrome.storage.local


4. Functional Specifications
Feature A: Screen Snipping & Decoding
Trigger: User clicks "Snip Active Tab" in popup.html.

Action:

Close or minimize popup if needed, or maintain state.

Inject snip-overlay.ts into the active tab via chrome.scripting.executeScript.

User drags a rectangle over the target QR code.

snip-overlay.ts reads selection coordinates (x, y, width, height, devicePixelRatio) and dispatches a message to service-worker.ts.

service-worker.ts invokes chrome.tabs.captureVisibleTab(null, { format: 'png' }).

Processing:

Crop image using an offscreen canvas.

Feed cropped image into new BarcodeDetector({ formats: ['qr_code'] }).

Return detected raw text string.

Feature B: OTP URI Parsing & Vault Storage
When decoded string matches otpauth://totp/...:

Parse secret, issuer, label, period (default 30), digits (default 6).

Present options: "Copy Raw URI", "Copy Secret Key", and "Save to Secure Vault".

If non-OTP text/URL:

Display raw text in a read-only input with a "Copy to Clipboard" button.

Feature C: Zero-Knowledge Encrypted Vault
Authentication:

On first run, user sets a 4- to 8-digit PIN (or passphrase).

Derive a 256-bit AES key via PBKDF2 (100,000 iterations, random 16-byte salt, SHA-256).

Encrypt a verification token (e.g., standard check string "VAULT_KEY_VALID") to test correct PIN entry on subsequent unlocks.

Storage:

Secrets are serialized as JSON: Array<VaultItem>.

Encrypt using AES-GCM with a unique 12-byte IV per write operation.

Store { ciphertext: number[], salt: number[], iv: number[] } in chrome.storage.local.

Decrypted keys are held strictly in memory (popup.controller.ts) and cleared when popup closes.

Feature D: TOTP Token Computation
Refresh loop runs every 1 second in the UI when unlocked.

Calculate remaining seconds in current interval: remaining = period - (Math.floor(Date.now() / 1000) % period).

Generate rolling 6-digit code using native crypto.subtle.sign("HMAC", ...) per RFC 6238.

Provide 1-click click-to-copy for the active 6-digit code.

Feature E: QR Code Generator
Text input area in popup.html.

Debounced input (300ms) generates a live QR code onto an HTML <canvas>.

Provide a "Download PNG" button.

5. Security & Architectural Rules for the Agent

No Third-Party Analytics / Remote Assets: Do not load remote scripts, CDNs, Google Fonts, or external stylesheets. Everything must be locally bundled.

Strict Error Handling: Every async operation (crypto calls, storage reads, image processing, tabs permission) must have a try/catch block that surfaces clear error messages to the UI without crashing the extension.

Separation of Concerns:

No DOM access inside src/services/.

All DOM events, user feedback, and UI state remain in popup.controller.ts.

Cryptographic keys must never be logged using console.log.

6. Proposed Implementation Roadmap (Draft not Final can be changed. You (agent) can decide against it tell user if have better proposal)

Step 1: Initialize Vite project with Manifest V3 configuration and icons.

Step 2: Implement src/services/crypto.service.ts with unit tests checking PBKDF2 derivation and AES-GCM roundtrip encryption/decryption.

Step 3: Implement src/services/totp.service.ts and test against RFC 6238 test vectors (HMAC-SHA1).

Step 4: Implement content/snip-overlay.ts coordinate calculation and background tab screenshot pipeline.

Step 5: Build src/services/qr-decoder.service.ts canvas extraction logic.

Step 6: Build popup/ view, tabs, and wire all services via popup.controller.ts.