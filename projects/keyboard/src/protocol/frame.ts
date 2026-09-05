import type { Transport } from "./types"

export const REPORT_SIZE = 64
export const PAGE = 56

/** Build a 64-byte command frame. Checksum at byte 7 (bit7) or byte 8 (bit8). */
export function frame(bytes: ArrayLike<number>, checksum: "bit7" | "bit8" = "bit7"): Uint8Array {
  const out = new Uint8Array(REPORT_SIZE)
  out.set(bytes)
  const n = checksum === "bit7" ? 7 : 8
  let sum = 0
  for (let i = 0; i < n; i++) sum += out[i]
  out[n] = 0xff - (sum & 0xff)
  return out
}

export const u16le = (v: number): [number, number] => [v & 0xff, (v >> 8) & 0xff]
export const readU16le = (b: ArrayLike<number>, i: number) => b[i] | (b[i + 1] << 8)

/** Split a payload into 56-byte pages, zero-padded. */
export function pages(data: number[] | Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = []
  for (let i = 0; i < data.length; i += PAGE) {
    const p = new Uint8Array(PAGE)
    p.set(data.slice(i, i + PAGE))
    out.push(p)
  }
  return out
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
/** Delay the site uses after a write batch before the firmware is safe to read/write again. */
export const vendorSleep = (): Promise<void> => sleep(100)

/**
 * GET `count` pages via `buildFrame(page)`, concatenated into one flat byte array. Paged getters carry
 * no per-page header (PROTOCOL.md § Framing) — each 64-byte GetReport is pure data.
 */
export async function readPages(t: Transport, count: number, buildFrame: (page: number) => Uint8Array): Promise<number[]> {
  const bytes: number[] = []
  for (let page = 0; page < count; page++) bytes.push(...(await t.request(buildFrame(page))))
  return bytes
}
