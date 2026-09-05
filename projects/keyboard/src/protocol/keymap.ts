import type { Transport, MatrixEntry } from "./types"
import { frame, pages, readPages, vendorSleep } from "./frame"

const CMD_GET_KEYMATRIX = 0x8a
const CMD_SET_KEYMATRIX = 0x0a
const CMD_GET_FN = 0x90
const CMD_SET_FN = 0x10
const OS_CODE = { win: 0, mac: 1 } as const

/** Decoded meaning of a 4-byte matrix entry (mirrors configToMatrix/matrixToConfigs). */
export type KeyAction =
  | { type: "key"; usage: number }
  | { type: "disabled" }
  | { type: "macro"; index: number }
  // `skey` is byte 1: a HID usage held down alongside `usage`, NOT a modifier bitmask —
  // Ctrl_SHIFT_ESC = [0,224,225,41], Ctrl+Up = [0,224,82,0] (PROTOCOL.md § 4.2).
  | { type: "combo"; skey: number; usage: number }
  | { type: "consumer"; code: number }
  | { type: "fn" }
  | { type: "profile"; n: number }
  | { type: "light" }
  | { type: "unknown"; raw: MatrixEntry }

// ponytail: [0,0,1,0] and [0,0,3,0] are reserved sentinels the vendor's own decoder special-cases
// (ConfigUnknown / skipped) rather than treating as plain-key usages 1 and 3 — routed to "unknown"
// here too so their exact bytes survive a round trip instead of being misread as real keys.
export function decodeEntry(entry: MatrixEntry): KeyAction {
  const [b0, b1, b2, b3] = entry
  if (b0 === 0 && b1 === 0 && b2 === 0 && b3 === 0) return { type: "disabled" }
  if (b0 === 0 && b1 === 0 && b3 === 0 && (b2 === 1 || b2 === 3)) return { type: "unknown", raw: entry }
  if (b0 === 9) return { type: "macro", index: b2 }
  if (b0 === 3 && b1 === 0) return { type: "consumer", code: b2 | (b3 << 8) }
  if (b0 === 10 && b1 === 1 && b2 === 0 && b3 === 0) return { type: "fn" }
  // `profile_exchange`..`profile_exchange5` in the vendor's function table = [8,0,4,n]. Not [14,0,n,0]:
  // that byte0 has no entry in any vendor table and the stock Fn layer binds it to Fn+Q/W/E/R/T
  // (the tri-mode connection row), so [14,…] stays raw rather than being rewritten as a profile key.
  if (b0 === 8 && b1 === 0 && b2 === 4) return { type: "profile", n: b3 }
  if (b0 === 13 && b1 === 1 && b2 === 0 && b3 === 0) return { type: "light" }
  if (b0 === 0 && b1 === 0 && b3 === 0) return { type: "key", usage: b2 }
  if (b0 === 0 && b3 === 0) return { type: "combo", skey: b1, usage: b2 }
  return { type: "unknown", raw: entry }
}

export function encodeEntry(action: KeyAction): MatrixEntry {
  switch (action.type) {
    case "disabled":
      return [0, 0, 0, 0]
    case "key":
      return [0, 0, action.usage, 0]
    case "combo":
      return [0, action.skey, action.usage, 0]
    case "macro":
      return [9, 0, action.index, 0]
    case "consumer":
      return [3, 0, action.code & 0xff, (action.code >> 8) & 0xff]
    case "fn":
      return [10, 1, 0, 0]
    case "profile":
      return [8, 0, 4, action.n]
    case "light":
      return [13, 1, 0, 0]
    case "unknown":
      return action.raw
  }
}

function toEntries(bytes: number[]): MatrixEntry[] {
  const out: MatrixEntry[] = []
  for (let i = 0; i < bytes.length; i += 4) out.push([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]])
  return out
}

export async function readKeymap(t: Transport, profile: number, layer: number): Promise<MatrixEntry[]> {
  const bytes = await readPages(t, 8, (page) => frame([CMD_GET_KEYMATRIX, profile, 0xff, page, layer]))
  return toEntries(bytes)
}

export async function writeKeymap(
  t: Transport,
  profile: number,
  layer: number,
  entries: MatrixEntry[],
): Promise<void> {
  const data = entries.flat()
  const chunks = pages(data)
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1 ? 1 : 0
    const len = Math.min(56, data.length - i * 56)
    await t.send(frame([CMD_SET_KEYMATRIX, profile, 0xff, i, len, isLast, layer, 0, ...chunks[i]]))
  }
  await vendorSleep()
}

export async function writeKey(
  t: Transport,
  profile: number,
  layer: number,
  slot: number,
  entry: MatrixEntry,
): Promise<void> {
  await t.send(frame([CMD_SET_KEYMATRIX, profile, slot, 0, 0, 1, layer, 0, ...entry]))
  await vendorSleep()
}

export async function readFnLayer(t: Transport, profile: number, os: "win" | "mac"): Promise<MatrixEntry[]> {
  const bytes = await readPages(t, 8, (page) => frame([CMD_GET_FN, OS_CODE[os], profile, 0xff, page]))
  return toEntries(bytes)
}

export async function writeFnKey(
  t: Transport,
  profile: number,
  os: "win" | "mac",
  slot: number,
  entry: MatrixEntry,
): Promise<void> {
  await t.send(frame([CMD_SET_FN, OS_CODE[os], profile, slot, 0, 0, 0, 0, ...entry]))
  await vendorSleep()
}
