/**
 * MD5 (RFC 1321). WebCrypto has no MD5 and the Deco login signature (`h=md5("admin"+password)`,
 * README §3.3) needs it, so it's implemented directly. ponytail: single-shot UTF-8 string in,
 * lowercase hex out — no streaming/incremental API, no Uint8Array overload. Ceiling: if some
 * other codec ever needs to MD5 raw bytes, split the block-processing loop out to take one.
 */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
]

// K[i] = floor(abs(sin(i+1)) * 2^32), precomputed once at module load.
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32))

function rotl(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c))
}

export function md5Hex(input: string): string {
  const msg = new TextEncoder().encode(input)
  const bitLen = msg.length * 8

  // Pad: 0x80, then zeros until length % 64 == 56, then the 64-bit little-endian bit length.
  const padLen = ((msg.length + 8) >> 6 << 6) + 64
  const buf = new Uint8Array(padLen)
  buf.set(msg)
  buf[msg.length] = 0x80
  const view = new DataView(buf.buffer)
  view.setUint32(padLen - 8, bitLen >>> 0, true)
  view.setUint32(padLen - 4, Math.floor(bitLen / 2 ** 32), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let chunk = 0; chunk < padLen; chunk += 64) {
    const m = new Array<number>(16)
    for (let j = 0; j < 16; j++) m[j] = view.getUint32(chunk + j * 4, true)

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      f = (f + a + K[i] + m[g]) | 0
      a = d
      d = c
      c = b
      b = (b + rotl(f, S[i])) | 0
    }

    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  const out = new Uint8Array(16)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, a0 >>> 0, true)
  outView.setUint32(4, b0 >>> 0, true)
  outView.setUint32(8, c0 >>> 0, true)
  outView.setUint32(12, d0 >>> 0, true)

  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
