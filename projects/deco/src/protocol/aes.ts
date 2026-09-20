/**
 * AES-128-CBC/PKCS#7 envelope for the login handshake (README §3.4). `key`/`iv` are the 16-ASCII-
 * character strings the handshake generates (see rsa.ts `randomDigits16`); their UTF-8 bytes are
 * the raw key/iv, matching deco_client.py's `.encode()`. WebCrypto pads/unpads PKCS#7 itself.
 */

function toBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

async function importKey(key: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("raw", toBytes(key) as BufferSource, "AES-CBC", false, ["encrypt", "decrypt"])
}

function toBase64(bytes: ArrayBuffer): string {
  let bin = ""
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function aesCbcEncryptB64(key: string, iv: string, plaintext: string): Promise<string> {
  const cryptoKey = await importKey(key)
  const cipher = await globalThis.crypto.subtle.encrypt(
    { name: "AES-CBC", iv: toBytes(iv) as BufferSource },
    cryptoKey,
    toBytes(plaintext) as BufferSource,
  )
  return toBase64(cipher)
}

export async function aesCbcDecryptB64(key: string, iv: string, b64: string): Promise<string> {
  const cryptoKey = await importKey(key)
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: "AES-CBC", iv: toBytes(iv) as BufferSource },
    cryptoKey,
    fromBase64(b64) as BufferSource,
  )
  return new TextDecoder().decode(plain)
}
