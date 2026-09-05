import { frame, readU16le, pages, sleep, u16le } from "./frame"
import type { DeviceInfo, KeyHallSettings, KeyMode, MatrixEntry, Transport } from "./types"

const SLOTS = 128
const CMD_SET = 0x65
const CMD_GET = 0xe5

// ponytail: past this many changed keys a single bulk writeHall beats per-key round-trips; the
// number is a guess, not a measurement — revisit once real hardware timing is known.
const BULK_THRESHOLD = 24

const MODE_NUM: Record<KeyMode, number> = { normal: 0, dks: 2, mt: 3, tgl_hold: 4, tgl_dots: 5, snap: 7 }
const MODE_BY_NUM: Record<number, KeyMode> = { 0: "normal", 2: "dks", 3: "mt", 4: "tgl_hold", 5: "tgl_dots", 7: "snap" }

function modeToWire(mode: KeyMode, rapidTrigger: boolean): number {
  return MODE_NUM[mode] | (rapidTrigger ? 0x80 : 0)
}
function wireToMode(byte: number): { mode: KeyMode; rapidTrigger: boolean } {
  return { mode: MODE_BY_NUM[byte & 0x7f] ?? "normal", rapidTrigger: (byte & 0x80) !== 0 }
}

/**
 * GET 0xE5 pages are raw data with no per-page command echo (unlike the single-report getters) — confirmed
 * against research/vendor/gearhub-main-bundle.js's NP.getFeature (report id 0 → nothing is stripped) and the
 * driver's own decoders, which index straight from byte 0 of the concatenated pages.
 */
function concatPages(raw: Uint8Array[]): Uint8Array {
  const flat = new Uint8Array(raw.length * 64)
  raw.forEach((p, i) => flat.set(p.subarray(0, 64), i * 64))
  return flat
}

export function decodeU16Pages(raw: Uint8Array[], count: number): number[] {
  const flat = concatPages(raw)
  return Array.from({ length: count }, (_, i) => readU16le(flat, i * 2))
}

export function decodeU8Pages(raw: Uint8Array[], count: number): number[] {
  return Array.from(concatPages(raw).subarray(0, count))
}

/** op10 GET: 8 pages laid out as 4 x 128-byte planes, plane[g][slot]. */
export function decodeDksPlanes(raw: Uint8Array[], count: number): [number, number, number, number][] {
  const flat = concatPages(raw)
  return Array.from({ length: count }, (_, slot) => [0, 1, 2, 3].map((g) => flat[g * count + slot]) as [number, number, number, number])
}

/** Bulk SET 0x65 frames for one op: `values[slot] ?? fill`, split into 56-byte pages. `commit` marks the
 * last page's isLast byte, which is what makes the firmware apply/save (PROTOCOL.md § Hall-effect). */
export function encodeBulk(op: number, values: (number | undefined)[], fill: number, size: 1 | 2 = 2, commit = false): Uint8Array[] {
  const bytes: number[] = []
  for (const v of values) {
    const n = v ?? fill
    if (size === 2) bytes.push(...u16le(n))
    else bytes.push(n & 0xff)
  }
  const ps = pages(bytes)
  return ps.map((p, i) => frame([CMD_SET, op, 1, i, commit && i === ps.length - 1 ? 1 : 0, 0, 0, 0, ...p]))
}

async function getPages(t: Transport, op: number, count: number): Promise<Uint8Array[]> {
  const out: Uint8Array[] = []
  for (let page = 0; page < count; page++) out.push(await t.request(frame([CMD_GET, op, 1, page])))
  return out
}

export async function readHall(t: Transport, info: DeviceInfo, matrix: MatrixEntry[]): Promise<KeyHallSettings[]> {
  const mult = info.travelMultiplier
  // ponytail: always fetch every op instead of conditionally skipping ones no key uses — a few extra HID round
  // trips beats replicating the site's "only if some key needs it" branching.
  const modes = decodeU8Pages(await getPages(t, 7, 2), SLOTS)
  const travel = decodeU16Pages(await getPages(t, 0, 4), SLOTS)
  const liftTravel = decodeU16Pages(await getPages(t, 1, 4), SLOTS)
  const rtPressTravel = decodeU16Pages(await getPages(t, 2, 4), SLOTS)
  const rtLiftTravel = decodeU16Pages(await getPages(t, 3, 4), SLOTS)
  const deadZone = decodeU16Pages(await getPages(t, 6, 4), SLOTS)
  const dksStartTravel = decodeU16Pages(await getPages(t, 4, 4), SLOTS)
  const mtHoldMs = decodeU8Pages(await getPages(t, 5, 2), SLOTS)
  const snapPartner = decodeU8Pages(await getPages(t, 9, 2), SLOTS)
  const dksTriggerModes = decodeDksPlanes(await getPages(t, 10, 8), SLOTS)
  const topDeadZone = info.supportsTopDeadZone ? decodeU8Pages(await getPages(t, 251, 2), SLOTS) : undefined
  const switchType = decodeU8Pages(await getPages(t, 252, 2), SLOTS)

  const out: KeyHallSettings[] = []
  for (let slot = 0; slot < matrix.length; slot++) {
    const [a, b, c, d] = matrix[slot]
    if (a === 0 && b === 0 && c === 0 && d === 0) continue
    const { mode, rapidTrigger } = wireToMode(modes[slot])
    out.push({
      slot,
      mode,
      rapidTrigger,
      travel: travel[slot] / mult,
      liftTravel: liftTravel[slot] / mult,
      rtPressTravel: rtPressTravel[slot] / mult,
      rtLiftTravel: rtLiftTravel[slot] / mult,
      deadZone: deadZone[slot] / mult,
      topDeadZone: topDeadZone ? topDeadZone[slot] / mult : undefined,
      dksStartTravel: dksStartTravel[slot] / mult,
      dksTriggerModes: dksTriggerModes[slot],
      mtHoldMs: mtHoldMs[slot] * 10,
      snapPartnerSlot: mode === "snap" ? snapPartner[slot] : undefined,
      switchType: switchType[slot],
    })
  }
  return out
}

function sparseValues<T>(keys: KeyHallSettings[], pick: (k: KeyHallSettings) => T | undefined): (T | undefined)[] {
  const arr = new Array<T | undefined>(SLOTS).fill(undefined)
  for (const k of keys) arr[k.slot] = pick(k)
  return arr
}

/** Bulk write, following the site's op order: modes, travel ops, u8 ops, per-key DKS singles, then switch type
 * last with the commit flag (see PROTOCOL.md § Hall-effect "Order used by the site"). ponytail: unlike the
 * vendor driver we don't diff against the previous write and skip unchanged ops — always send everything, and
 * always commit on the final op252 frame. Simpler, at the cost of a few redundant 64-byte writes. */
export async function writeHall(t: Transport, info: DeviceInfo, keys: KeyHallSettings[]): Promise<void> {
  const mult = info.travelMultiplier
  const send = async (op: number, values: (number | undefined)[], fill: number, size: 1 | 2 = 2, commit = false) => {
    for (const f of encodeBulk(op, values, fill, size, commit)) await t.send(f)
  }
  await send(7, sparseValues(keys, (k) => modeToWire(k.mode, k.rapidTrigger)), 0, 1)
  await send(0, sparseValues(keys, (k) => Math.round(k.travel * mult)), 200)
  await send(1, sparseValues(keys, (k) => Math.round(k.liftTravel * mult)), 280)
  await send(2, sparseValues(keys, (k) => Math.round(k.rtPressTravel * mult)), 0)
  await send(3, sparseValues(keys, (k) => Math.round(k.rtLiftTravel * mult)), 0)
  await send(6, sparseValues(keys, (k) => Math.round(k.deadZone * mult)), 30)
  await send(4, sparseValues(keys, (k) => Math.round(k.dksStartTravel * mult)), 0)
  await send(5, sparseValues(keys, (k) => Math.round(k.mtHoldMs / 10)), 0, 1)
  await send(9, sparseValues(keys, (k) => k.snapPartnerSlot), 0, 1)
  if (info.supportsTopDeadZone) await send(251, sparseValues(keys, (k) => Math.round((k.topDeadZone ?? 0) * mult)), 30, 1)
  for (const k of keys.filter((k) => k.mode === "dks"))
    await t.send(frame([CMD_SET, 8, 0, k.slot, 0, 0, 0, 0, ...k.dksTriggerModes]))
  await sleep(500)
  await send(252, sparseValues(keys, (k) => k.switchType), 0, 1, true)
}

/** Single-slot write. Same field set as writeHall's per-key path, always committing on the final op252 frame. */
export async function writeHallKey(t: Transport, info: DeviceInfo, key: KeyHallSettings): Promise<void> {
  const mult = info.travelMultiplier
  const single = (op: number, value: number, size: 1 | 2, commit = false) => {
    const v = size === 2 ? u16le(Math.round(value)) : [Math.round(value) & 0xff]
    return t.send(frame([CMD_SET, op, 0, key.slot, commit ? 1 : 0, 0, 0, 0, ...v]))
  }
  await single(7, modeToWire(key.mode, key.rapidTrigger), 1)
  await single(0, key.travel * mult, 2)
  await single(1, key.liftTravel * mult, 2)
  await single(2, key.rtPressTravel * mult, 2)
  await single(3, key.rtLiftTravel * mult, 2)
  await single(6, key.deadZone * mult, 2)
  await single(4, key.dksStartTravel * mult, 2)
  await single(5, key.mtHoldMs / 10, 1)
  await t.send(frame([CMD_SET, 8, 0, key.slot, 0, 0, 0, 0, ...key.dksTriggerModes]))
  if (key.snapPartnerSlot !== undefined) await single(9, key.snapPartnerSlot, 1)
  if (info.supportsTopDeadZone && key.topDeadZone !== undefined) await single(251, key.topDeadZone * mult, 1)
  await single(252, key.switchType, 1, true)
}

/** Write only `changed` keys, picking the cheaper of a bulk write (all of `all`) or per-key writes
 * once past BULK_THRESHOLD — the transport round-trip tradeoff, so it lives beside writeHall/writeHallKey
 * rather than in the UI that computed the diff. */
export async function writeHallChanges(
  t: Transport,
  info: DeviceInfo,
  changed: KeyHallSettings[],
  all: KeyHallSettings[],
): Promise<void> {
  if (changed.length > BULK_THRESHOLD) await writeHall(t, info, all)
  else for (const key of changed) await writeHallKey(t, info, key)
}

export async function readLiveTravel(t: Transport, info: DeviceInfo): Promise<number[]> {
  const raw = decodeU16Pages(await getPages(t, 254, 4), SLOTS)
  return raw.map((v) => v / info.travelMultiplier)
}
