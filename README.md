# Personal Secure QR Scanner & TOTP Vault

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Donate with PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?style=flat&logo=paypal&logoColor=white)](https://paypal.me/MadBabushka)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A lightweight, zero-knowledge, 100% offline Chromium browser extension (Manifest V3) for viewport QR code snipping, RFC 6238 TOTP token generation, and encrypted local credential storage.

---

## Installation & Availability

### Chrome Web Store (Coming Soon)
*Currently under review.* Once approved, you can search for **Personal Secure QR Scanner & TOTP Vault** (or **QR Vault**) directly on the [Chrome Web Store](https://chromewebstore.google.com/).

### Manual Installation (Use Right Now)
You can load the extension directly into any Chromium browser (Chrome, Brave, Edge, Opera, Vivaldi) in under 30 seconds:

1. Clone or download this repository.
2. Run `npm install && npm run build` (or download the pre-built `dist/` folder from [Releases](../../releases)).
3. Open your browser and navigate to `chrome://extensions`.
4. Toggle on **Developer mode** in the top-right corner.
5. Click **Load unpacked** (top-left button) and select the `dist/` directory.
6. Pin **QR Vault** to your browser toolbar.

---

## Architectural Comparison & Core Distinctions

| Feature / Property | Standard Mobile Authenticators | Cloud Browser Extensions | QR Vault (This Project) |
| :--- | :--- | :--- | :--- |
| **QR Code Capture** | Requires pointing a phone camera at screen | Manual secret paste or file upload | **Direct drag-to-crop crosshair snip on active tab** |
| **Network & Telemetry** | Syncs to cloud accounts; analytics enabled | Proprietary sync servers; tracking cookies | **100% Offline; zero network requests; no telemetry** |
| **Encryption Standard** | Vendor-managed or device keychain | Server-side or opaque closed-source crypto | **Native Web Crypto (PBKDF2 300k iterations + AES-256-GCM)** |
| **Permissions Scope** | Camera, network, biometric permissions | Broad `<all_urls>` host permissions | **Scoped strictly to `activeTab`, `scripting`, and `storage`** |
| **Session Security** | Permanent OS pin unlock | Persistent local storage exposure | **In-memory RAM session (`chrome.storage.session`) auto-lock** |

---

## Key Features

- **Viewport Screen Snipping**: Drag to crop and decode QR codes directly from any active browser tab without an external device or camera.
- **Zero-Knowledge Encrypted Storage**: All 2FA secrets are encrypted locally using AES-256-GCM with PBKDF2 key derivation (300,000 iterations, SHA-256).
- **RFC 6238 TOTP Engine**: Rolling 6-digit codes with live countdown progress bars and 1-click clipboard copy.
- **In-Memory Auto-Lock Session**: Configurable session lock (RAM-only via `chrome.storage.session`, destroyed on browser exit) eliminates repeated password prompts while preserving security.
- **Offline QR Code Generator**: Generate custom QR codes locally onto an HTML canvas with downloadable PNG exports.
- **Encrypted Backup & Restore**: Export and import encrypted JSON vault backups.
- **100% Offline & Private**: Zero external analytics, tracking, or network calls.

---

## Security Model

1. **Client-Side Cryptography**: Uses the browser's native Web Crypto API (`window.crypto.subtle`). No external runtime crypto libraries.
2. **Key Derivation & Encryption**:
   - Master Key: Derived via PBKDF2 with 300,000 iterations and a cryptographically secure 16-byte random salt.
   - Cipher: AES-256-GCM with a unique 12-byte initialization vector (IV) generated for each write operation.
3. **Memory Safety**:
   - Master passwords and decrypted secrets are held strictly in RAM and purged on vault lock or session expiration.
   - Background service worker never handles unencrypted vault keys.
4. **Content Script Isolation**: The snipping overlay uses a closed Shadow DOM root to prevent host-page scripts or styles from tampering with crop events.
5. **Anti-Brute-Force Lockout**: Rate-limiting delays prevent automated password guessing.
6. **Clipboard Protection**: Copied tokens are automatically cleared from the system clipboard after 30 seconds.

---

## Minimal Scoped Permissions

- `activeTab`: Grants access to capture only the current tab when the user explicitly clicks "Snip Active Tab".
- `scripting`: Dynamically injects the temporary drag-to-crop crosshair overlay.
- `storage`: Persists the local encrypted ciphertext and settings via `chrome.storage.local` and in-memory session via `chrome.storage.session`.

---

## Development & Building

```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Build production bundle
npm run build
```

---

## Support & Donation

If you find this project useful, you can support its continued maintenance:

[![Donate with PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/MadBabushka)

---

## License

MIT License. See [LICENSE](LICENSE) for details.
