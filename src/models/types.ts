// Core Domain Models & Interfaces

export interface VaultItem {
  id: string;
  label: string;
  issuer?: string;
  secret: string;
  period: number;
  digits: number;
  createdAt: number;
}

export interface EncryptedPayload {
  ciphertext: number[];
  salt: number[];
  iv: number[];
  iterations?: number;
}

export interface OtpConfig {
  secret: string;
  issuer?: string;
  label?: string;
  period: number;
  digits: number;
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface VaultData {
  version: number;
  items: VaultItem[];
}
