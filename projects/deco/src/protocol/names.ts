/**
 * Client names, SSIDs and Wi-Fi passwords travel base64-encoded on the wire (README §3.9,
 * "Encoding"). `decodeName` is defensive: the router's own base64 fallback note ("decode with a
 * raw fallback") means some fields may already be plain text, so any failure — bad base64, or
 * base64 that isn't valid UTF-8 — must degrade gracefully rather than throw.
 */

export function decodeName(b64: string): string {
  let bytes: Uint8Array
  try {
    const bin = atob(b64)
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return b64
  }
  // fatal:false replaces invalid UTF-8 sequences with U+FFFD instead of throwing; strip those
  // rather than surface the replacement character.
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replaceAll("�", "")
}

export function encodeName(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
