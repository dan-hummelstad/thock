import type { Transport } from "./types"

/** PROTOCOL.md §2.1: every frame, both directions, is 16 bytes on output report id 8. */
export const REPORT_ID = 8
export const FRAME_SIZE = 16
export const READ_FLASH = 8
export const WRITE_FLASH = 7
export const DEVICE_ONLINE = 3
/** ReadFlashData/WriteFlashData carry at most 10 data bytes per frame (§2.4). */
export const FLASH_PAGE_SIZE = 10

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * `ns()` in PROTOCOL.md §2.2: `0x55 - sum(bytes)`. This is the one checksum formula the whole protocol
 * reuses — for the outer command frame (see `frameChecksum` below) and, verbatim, for every fixed-size
 * record's trailing checksum byte (DPI value/colour, Light, KeyFunction, ShortcutKey, Macro).
 */
export function fieldChecksum(bytes: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < bytes.length; i++) sum += bytes[i]
  return (0x55 - sum) & 0xff
}

/**
 * Outer 16-byte frame checksum (§2.2): `frame[15] = ns(frame[0..14]) - reportId`. The `-8` folds the
 * report-id byte (invisible to the JS array the frame lives in, present on the real wire) into the same
 * running sum. `head` is `frame[0..14]` (15 bytes, i.e. everything except the checksum byte itself).
 */
export function frameChecksum(head: ArrayLike<number>): number {
  return (fieldChecksum(head) - REPORT_ID) & 0xff
}

/** Generic "SET"/"GET"-shaped frame (`os()`/`rs()`, §2.1): byte0 cmd, byte4 payload length, byte5.. payload. */
export function buildFrame(cmd: number, payload: number[] = []): Uint8Array {
  const f = new Uint8Array(FRAME_SIZE)
  f[0] = cmd
  f[4] = payload.length
  f.set(payload, 5)
  f[15] = frameChecksum(f.subarray(0, 15))
  return f
}

/** WriteFlashData(7)/ReadFlashData(8) frame (§2.4): byte2-3 address (u16 BE), byte4 length, byte5.. data. */
export function buildFlashFrame(
  cmd: typeof READ_FLASH | typeof WRITE_FLASH,
  addr: number,
  len: number,
  data: number[] = [],
): Uint8Array {
  const f = new Uint8Array(FRAME_SIZE)
  f[0] = cmd
  f[2] = (addr >> 8) & 0xff
  f[3] = addr & 0xff
  f[4] = len
  f.set(data, 5)
  f[15] = frameChecksum(f.subarray(0, 15))
  return f
}

/** The 2-byte "paired field" convention (§2.4/§2.7): `[value, 0x55-value]`. Presence of the pair is how
 * the client detects firmware support for a handful of fields (AngleTune, PowerSaveBattery, FanMode). */
export function pairedBytes(value: number): [number, number] {
  const v = value & 0xff
  return [v, fieldChecksum([v])]
}
export function pairedPresent(lo: number, hi: number): boolean {
  return ((lo + hi) & 0xff) === 0x55
}

function echoMatches(req: Uint8Array, resp: Uint8Array, len: number): boolean {
  for (let i = 0; i < len; i++) if (resp[i] !== req[i]) return false
  return true
}

/**
 * Request/response matching + retry (§2.3's `as()`). `Transport.exchange` already waits for a reply;
 * this layer only re-sends when the reply doesn't echo the request (up to 5 attempts, 10ms apart) —
 * unless `resp[1] === 1` (device signalled error/unsupported), which is accepted immediately regardless
 * of echo. ReadFlashData(8) matches on 5 bytes (cmd+addr+len); everything else matches on 3. A rejected
 * `exchange` (hid.ts's response-timeout watchdog) counts as a failed attempt like an echo mismatch —
 * rethrown once every attempt has failed; a reply that never echoes the request is an error too, never
 * handed back to be decoded as data.
 */
export async function sendFrame(t: Transport, req: Uint8Array): Promise<Uint8Array> {
  const matchLen = req[0] === READ_FLASH ? 5 : 3
  let resp: Uint8Array | undefined
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(10)
    try {
      resp = await t.exchange(req)
    } catch (err) {
      lastErr = err
      continue
    }
    if (resp[1] === 1 || echoMatches(req, resp, matchLen)) return resp
  }
  if (resp === undefined) throw lastErr
  throw new Error("the mouse's reply didn't match the request")
}

const WAIT_ONLINE_MAX_POLLS = 20

/** `ps()` (§2.3): poll DeviceOnLine until not-busy, then report online/offline. Capped at
 * `WAIT_ONLINE_MAX_POLLS` polls — a device that never stops reporting busy throws rather than hanging. */
export async function waitOnline(t: Transport): Promise<boolean> {
  for (let i = 0; i < WAIT_ONLINE_MAX_POLLS; i++) {
    const resp = await sendFrame(t, buildFrame(DEVICE_ONLINE))
    if (resp[9] !== 1) return resp[5] === 1
    await sleep(10)
  }
  throw new Error("the mouse stayed busy — timed out waiting for it to go idle")
}

/** Throws when the device signalled status 1 (§2.1: rejected/unsupported) instead of silently handing
 * back a response the caller would otherwise decode as if it were real data (e.g. a rejected ReadFlash
 * decoding as all-zero config). */
export function ok(resp: Uint8Array): Uint8Array {
  if (resp[1] === 1) throw new Error("the mouse rejected that command")
  return resp
}

/** `ps()`, as a precondition check: throws instead of returning false, since every caller that gates
 * treats "device offline" as a hard failure, not a value to branch on. One gate per logical write —
 * callers that write several flash pages for one user action gate once, not once per page. */
export async function gate(t: Transport): Promise<void> {
  if (!(await waitOnline(t))) throw new Error("the mouse is offline — wake it or re-pair the dongle")
}

/** GET-shaped opcode call — reads are free, no online gate. */
export async function get(t: Transport, cmd: number, payload: number[] = []): Promise<Uint8Array> {
  return ok(await sendFrame(t, buildFrame(cmd, payload)))
}
/** SET-shaped opcode call, gated like every vendor setter. */
export async function set(t: Transport, cmd: number, payload: number[] = []): Promise<Uint8Array> {
  await gate(t)
  return ok(await sendFrame(t, buildFrame(cmd, payload)))
}

/** Single ReadFlashData request, `length` ≤ `FLASH_PAGE_SIZE`. Returns just the data bytes. */
export async function readFlash(t: Transport, addr: number, length: number): Promise<Uint8Array> {
  const resp = ok(await sendFrame(t, buildFlashFrame(READ_FLASH, addr, length)))
  return resp.slice(5, 5 + length)
}
/** Single WriteFlashData request, `data.length` ≤ `FLASH_PAGE_SIZE`. NOT gated — callers that write one
 * logical value across several pages/fields (writeFlashRange, device.ts's writeConfig) gate once up
 * front instead, so a multi-page write costs exactly one online poll, not one per page. */
export async function writeFlash(t: Transport, addr: number, data: ArrayLike<number>): Promise<void> {
  const arr = Array.from(data)
  ok(await sendFrame(t, buildFlashFrame(WRITE_FLASH, addr, arr.length, arr)))
}

/** Paged bulk read (`ti()`, §2.4), any length, sequential ≤10-byte pages. */
export async function readFlashRange(t: Transport, addr: number, length: number): Promise<Uint8Array> {
  const out = new Uint8Array(length)
  for (let off = 0; off < length; off += FLASH_PAGE_SIZE) {
    const n = Math.min(FLASH_PAGE_SIZE, length - off)
    out.set(await readFlash(t, addr + off, n), off)
  }
  return out
}
/** Paged bulk write (`js()`, §2.4), any length, sequential ≤10-byte pages — gated once for the whole
 * range, not per page (§2.3: one online poll per logical write). */
export async function writeFlashRange(t: Transport, addr: number, data: ArrayLike<number>): Promise<void> {
  await gate(t)
  const arr = Array.from(data)
  for (let off = 0; off < arr.length; off += FLASH_PAGE_SIZE) {
    await writeFlash(t, addr + off, arr.slice(off, off + FLASH_PAGE_SIZE))
  }
}
