// Thin wrapper over Electron's OS-keychain-backed safeStorage, for the optional "remember my
// router password" toggle (docs/desktop-electron-plan.md §6). Never log the plaintext or the
// encrypted buffer.
import { safeStorage } from "electron"

export function isAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function encrypt(plain: string): Buffer {
  return safeStorage.encryptString(plain)
}

export function decrypt(cipher: Buffer): string {
  return safeStorage.decryptString(cipher)
}
