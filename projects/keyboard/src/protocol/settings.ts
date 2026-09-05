import { frame, readU16le, u16le, vendorSleep } from "./frame"
import type { KbOptions, SleepTimers, Transport } from "./types"

export const REPORT_RATES = [8000, 4000, 2000, 1000, 500, 250, 125] as const
export type ReportRate = (typeof REPORT_RATES)[number]

export async function readReportRate(t: Transport): Promise<ReportRate | undefined> {
  const r = await t.request(frame([0x83]))
  // the vendor's getReportRate returns undefined for any enum outside 0..6 — mirrored, and it keeps
  // the indexed read from claiming a ReportRate the array doesn't have
  return r[0] === 0x83 && r[2] < REPORT_RATES.length ? REPORT_RATES[r[2]] : undefined
}
export async function writeReportRate(t: Transport, hz: ReportRate) {
  await t.send(frame([0x03, 0, REPORT_RATES.indexOf(hz)]))
  await vendorSleep()
}

export async function readDebounce(t: Transport): Promise<number | undefined> {
  const r = await t.request(frame([0x86]))
  return r[0] === 0x86 ? r[1] : undefined
}
export async function writeDebounce(t: Transport, v: number) {
  await t.send(frame([0x06, v]))
  await vendorSleep()
}

const OS = ["win", "mac", "ios", "android"] as const

export async function readKbOptions(t: Transport): Promise<KbOptions | undefined> {
  const r = await t.request(frame([0x89]))
  if (r[0] !== 0x89) return
  return {
    os: OS[r[1]] ?? "win",
    fnIndex: r[2],
    antiMistouch: r[3] === 1,
    rtStabiliserMs: r[4] > 5 ? 0 : r[4] * 25,
    wasdSwap: r[5] === 1,
  }
}
export async function writeKbOptions(t: Transport, o: KbOptions) {
  await t.send(frame([0x09, OS.indexOf(o.os), o.fnIndex, Number(o.antiMistouch), o.rtStabiliserMs / 25, Number(o.wasdSwap)]))
  await vendorSleep()
}

/** Seconds. Bytes 8..15 = bt, 2.4g, bt deep, 2.4g deep (u16 LE each). */
export async function readSleepTimers(t: Transport): Promise<SleepTimers | undefined> {
  const r = await t.request(frame([0x91]))
  if (r[0] !== 0x91) return
  return { bt: readU16le(r, 8), rf: readU16le(r, 10), btDeep: readU16le(r, 12), rfDeep: readU16le(r, 14) }
}
export async function writeSleepTimers(t: Transport, s: SleepTimers) {
  await t.send(frame([0x11, 0, 0, 0, 0, 0, 0, 0, ...u16le(s.bt), ...u16le(s.rf), ...u16le(s.btDeep), ...u16le(s.rfDeep)]))
  await vendorSleep()
}
