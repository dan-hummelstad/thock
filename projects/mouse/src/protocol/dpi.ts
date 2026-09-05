import { fieldChecksum } from "./frame"
import type { ReportRate, Rgb } from "./types"
import { REPORT_RATES } from "./types"

/** Target DPI -> {raw, dpiEx}, sensor "pulsar x1" (§3.6.3). Three ranges, `sensor.json`'s R0/R1/R2. */
export interface DpiRaw {
  raw: number
  dpiEx: number
}

export function encodeDpi(target: number): DpiRaw {
  if (target >= 30100) return { raw: Math.round((target / 2 - 10050) / 50), dpiEx: 51 }
  if (target >= 10050) return { raw: Math.round((target - 10050) / 50), dpiEx: 34 }
  return { raw: Math.round(target / 10 - 1), dpiEx: 0 }
}

/** {raw, dpiEx} -> DPI (`ai()`, §3.6.3). Only bits 0-1 of `dpiEx` are ever consulted here — see
 * `decodeDpiRecord` for why the packed byte only ever stores those two bits. */
export function decodeDpi(raw: number, dpiEx: number): number {
  let base = (raw + 1) * 10
  if (dpiEx & 0b10) base = base * 5 + 10000
  if (dpiEx & 0b01) base = base * 2
  return base
}

/**
 * Per-stage DPI value record, 4 bytes: `[xRawLow, yRawLow, packed, checksum]`. `packed` bit layout
 * (§2.7 offset 12, §3.6.3): bit0-1 X dpiEx, bit2-3 X raw bits 8-9, bit4-5 Y dpiEx, bit6-7 Y raw bits 8-9.
 * Only the low 2 bits of each `dpiEx` are stored — `decodeDpi` only ever tests those two bits, so nothing
 * is lost (confirmed against the worked 32000 example in PROTOCOL.md §3.6.3: dpiEx 51 = 0b110011, and its
 * low 2 bits, 0b11, decode identically to the full value).
 */
export function encodeDpiRecord(x: number, y: number): Uint8Array {
  const ex = encodeDpi(x)
  const ey = encodeDpi(y)
  const b0 = ex.raw & 0xff
  const b1 = ey.raw & 0xff
  const packed = (ex.dpiEx & 0b11) | (((ex.raw >> 8) & 0b11) << 2) | ((ey.dpiEx & 0b11) << 4) | (((ey.raw >> 8) & 0b11) << 6)
  return Uint8Array.of(b0, b1, packed, fieldChecksum([b0, b1, packed]))
}

export function decodeDpiRecord(bytes: ArrayLike<number>): { x: number; y: number } {
  const [b0, b1, packed] = [bytes[0], bytes[1], bytes[2]]
  const xRaw = b0 | (((packed >> 2) & 0b11) << 8)
  const yRaw = b1 | (((packed >> 6) & 0b11) << 8)
  return { x: decodeDpi(xRaw, packed & 0b11), y: decodeDpi(yRaw, (packed >> 4) & 0b11) }
}

/** Per-stage colour record, 4 bytes: `[R, G, B, 0x55-sum(R,G,B)]` (checksum never verified on read). */
export function encodeDpiColorRecord(rgb: Rgb): Uint8Array {
  return Uint8Array.of(rgb[0], rgb[1], rgb[2], fieldChecksum(rgb))
}
export function decodeDpiColorRecord(bytes: ArrayLike<number>): Rgb {
  return [bytes[0], bytes[1], bytes[2]]
}

/** Report rate raw<->Hz (§3.7). `ui()`'s formula, NOT the dead/inconsistent `ReportRate_To_FlashData`
 * helper the doc calls out (that one is wrong above 1000 Hz and unused by the real setter). */
export function reportRateToRaw(hz: ReportRate): number {
  return hz <= 1000 ? 1000 / hz : (hz / 2000) * 16
}
export function rawToReportRate(raw: number): ReportRate | undefined {
  const hz = raw >= 16 ? (raw / 16) * 2000 : 1000 / raw
  return (REPORT_RATES as number[]).includes(hz) ? (hz as ReportRate) : undefined
}

/** DPI-effect brightness: UI level 1-10 -> raw byte (§3.6.4). Levels 2,3,4,6,7,8 follow `30*(level-1)`;
 * 1,5,9,10 are irregular special cases, transcribed exactly as coded. */
export const DPI_EFFECT_BRIGHTNESS: Record<number, number> = {
  1: 16,
  2: 30,
  3: 60,
  4: 90,
  5: 128,
  6: 150,
  7: 180,
  8: 210,
  9: 230,
  10: 255,
}
export function brightnessToRaw(level: number): number {
  return DPI_EFFECT_BRIGHTNESS[level] ?? DPI_EFFECT_BRIGHTNESS[5]
}
export function rawToBrightness(raw: number): number {
  let best = 5
  let bestDiff = Infinity
  for (const [level, r] of Object.entries(DPI_EFFECT_BRIGHTNESS)) {
    const diff = Math.abs(r - raw)
    if (diff < bestDiff) {
      bestDiff = diff
      best = Number(level)
    }
  }
  return best
}
