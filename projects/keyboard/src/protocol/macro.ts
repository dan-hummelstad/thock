import type { Transport, Macro, MacroEvent } from "./types"
import { frame, pages, readU16le, vendorSleep } from "./frame"

const CMD_GET_MACRO = 0x8b
const CMD_SET_MACRO = 0x0b
const MOUSE_MOVE = 249

const toInt8 = (b: number) => (b << 24) >> 24

type ActionEvent = Exclude<MacroEvent, { type: "delay" }>

/**
 * 4-byte event `[hid|249|240..244, flags, delayLo, delayHi]`. When the delay fits in 7 bits it is
 * packed into the low bits of `flags` (bit7 = down for keyboard/mouse_button) and the delay-word
 * bytes are omitted — the next event starts 2 bytes earlier. Mouse-move has no down/up bit, so its
 * `flags` byte is the short delay directly, 0 meaning "read the next 2 bytes instead".
 */
function eventToBytes(action: ActionEvent, delay: number): number[] {
  if (action.type === "mouse_move") {
    const short = delay > 0 && delay <= 127
    const out = [MOUSE_MOVE, short ? delay : 0, action.dx & 0xff, action.dy & 0xff]
    if (!short) out.push(delay & 0xff, delay >> 8)
    return out
  }
  const down = action.action === "down"
  const out = [action.value]
  // delay 0 goes long-form: a zero low-7 flags byte is the long-form sentinel, so the short form
  // would desync the stream (the vendor has this collision; we avoid it).
  if (delay > 0 && delay <= 127) out.push(down ? delay + 128 : delay)
  else out.push(down ? 128 : 0, delay & 0xff, delay >> 8)
  return out
}

export function encodeMacro(m: Macro): Uint8Array {
  const buf = new Uint8Array(256)
  buf[0] = m.repeatCount & 0xff
  buf[1] = (m.repeatCount >> 8) & 0xff
  let n = 2
  // Each action carries the delay that follows it (0 when the list ends on an action or two actions
  // are adjacent); a delay with no action before it has nothing to attach to and is dropped. buf stays
  // zero-filled past the last event, which doubles as the [0,0,0,0] terminator.
  for (const [i, action] of m.events.entries()) {
    if (action.type === "delay") continue
    const next = m.events[i + 1]
    const bytes = eventToBytes(action, next?.type === "delay" ? next.value : 0)
    if (n + bytes.length > buf.length) throw new Error("macro exceeds 256 bytes")
    buf.set(bytes, n)
    n += bytes.length
  }
  return buf
}

// ponytail: keeps delay=0 events (vendor's buffToMacroEvents drops them) so every action stays
// paired with exactly one delay, which encodeMacro's fixed pairing needs for a lossless round trip.
export function decodeMacro(bytes: Uint8Array): Macro {
  const repeatCount = readU16le(bytes, 0)
  const events: MacroEvent[] = []
  let s = 2
  while (s + 4 <= bytes.length) {
    const b0 = bytes[s],
      b1 = bytes[s + 1],
      b2 = bytes[s + 2],
      b3 = bytes[s + 3]
    if (b0 === 0 && b1 === 0 && b2 === 0 && b3 === 0) break
    if (b0 === MOUSE_MOVE) {
      events.push({ type: "mouse_move", dx: toInt8(b2), dy: toInt8(b3) })
      if (b1 !== 0) {
        events.push({ type: "delay", value: b1 })
        s += 4
      } else {
        events.push({ type: "delay", value: readU16le(bytes, s + 4) })
        s += 6
      }
    } else {
      const down = (b1 & 128) !== 0
      const short = (b1 & 127) !== 0
      events.push({ type: b0 <= 239 ? "keyboard" : "mouse_button", action: down ? "down" : "up", value: b0 })
      if (short) {
        events.push({ type: "delay", value: b1 & 127 })
        s += 2
      } else {
        events.push({ type: "delay", value: readU16le(bytes, s + 2) })
        s += 4
      }
    }
  }
  return { repeatCount, events }
}

function hasZeroWindow(page: Uint8Array): boolean {
  for (let i = 0; i <= page.length - 4; i++) {
    if (page[i] === 0 && page[i + 1] === 0 && page[i + 2] === 0 && page[i + 3] === 0) return true
  }
  return false
}

export async function readMacro(t: Transport, index: number): Promise<Macro> {
  const bytes: number[] = []
  for (let page = 0; page < 4; page++) {
    const resp = await t.request(frame([CMD_GET_MACRO, index, page]))
    bytes.push(...resp)
    if (hasZeroWindow(resp)) break
  }
  return decodeMacro(new Uint8Array(bytes))
}

export async function writeMacro(t: Transport, index: number, macro: Macro): Promise<void> {
  const chunks = pages(encodeMacro(macro))
  let pageCount = 0
  for (const c of chunks) if (c.some((b) => b !== 0)) pageCount++
  for (let n = 0; n < pageCount; n++) {
    const isLast = n === pageCount - 1 ? 1 : 0
    await t.send(frame([CMD_SET_MACRO, index, n, 56, isLast, 0, 0, 0, ...chunks[n]]))
  }
  await vendorSleep()
}
