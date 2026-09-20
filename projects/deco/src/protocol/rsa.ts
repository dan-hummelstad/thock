/**
 * RSA PKCS#1 v1.5 type-2 encryption, TP-Link style (README §3.4, mirrors deco_client.py's
 * `rsa_enc`): k = byte length of n; plaintext is split into (k-11)-byte chunks; each block is
 * `00 02 <random non-zero pad> 00 <chunk>` padded to k bytes, modpow'd, and hex zero-padded to
 * exactly 2k chars. Blocks are concatenated with no separator.
 * ponytail: BigInt modpow, no CRT/Montgomery speedup — logins are a handful of RSA ops, not a
 * hot loop. Ceiling: if this ever needs to encrypt large payloads at speed, swap in a proper
 * bignum library.
 */

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n
  base %= mod
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod
    exp >>= 1n
    base = (base * base) % mod
  }
  return result
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  return n
}

export function rsaEncryptHex(nHex: string, eHex: string, plaintext: Uint8Array): string {
  const n = BigInt(`0x${nHex}`)
  const e = BigInt(`0x${eHex}`)
  const k = Math.ceil(n.toString(2).length / 8) // byte length of n, from its actual bit length (mirrors Python's n.bit_length())

  let out = ""
  for (let i = 0; i < plaintext.length; i += k - 11) {
    const chunk = plaintext.subarray(i, i + (k - 11))
    const padLen = k - chunk.length - 3
    const pad = new Uint8Array(padLen)
    const rand = new Uint8Array(padLen)
    let filled = 0
    while (filled < padLen) {
      crypto.getRandomValues(rand)
      for (const b of rand) {
        if (filled >= padLen) break
        if (b !== 0) pad[filled++] = b
      }
    }

    const block = new Uint8Array(k)
    block[0] = 0x00
    block[1] = 0x02
    block.set(pad, 2)
    block[2 + padLen] = 0x00
    block.set(chunk, 3 + padLen)

    const cipher = modPow(bytesToBigInt(block), e, n)
    out += cipher.toString(16).padStart(k * 2, "0")
  }
  return out
}

/** 16 decimal digits, first non-zero — what TP-Link's own JS uses for the AES key/iv strings. */
export function randomDigits16(): string {
  const rand = new Uint8Array(16)
  crypto.getRandomValues(rand)
  let s = String(1 + (rand[0] % 9)) // first digit 1-9
  for (let i = 1; i < 16; i++) s += String(rand[i] % 10)
  return s
}
