import { decodeDpi, encodeDpi } from "./dpi"
import { fieldChecksum, readFlashRange, writeFlashRange } from "./frame"
import { oneOf } from "./oneOf"
import type { KeyFunction, Shortcut, Transport } from "./types"
import { KeyType, SHORTCUT_MAX_KEYS } from "./types"

const KEY_TYPES = Object.values(KeyType) as KeyType[]

/** KeyFunction record, 4 bytes (§3.11.1): `[type, paramHi/Lo, paramLo/Hi, checksum]`. DpiLock stores its
 * param little-endian (raw DPI value, dpiEx silently dropped — see ⚠ below); every other type stores it
 * big-endian, matching the default table's hex strings (`"0x0100"` -> byte1=0x01, byte2=0x00). */
export function encodeKeyFunction(fn: KeyFunction): Uint8Array {
  let b1: number
  let b2: number
  if (fn.type === KeyType.DpiLock) {
    // ⚠ dpiEx is dropped on the wire: a DpiLock target ≥10050 (sensor range R1/R2) round-trips wrong
    // (PROTOCOL.md §3.11.1, §7.B.2) — transcribed exactly as documented, not "fixed".
    const raw = encodeDpi(fn.param).raw & 0xffff
    b1 = raw & 0xff
    b2 = (raw >> 8) & 0xff
  } else {
    b1 = (fn.param >> 8) & 0xff
    b2 = fn.param & 0xff
  }
  return Uint8Array.of(fn.type, b1, b2, fieldChecksum([fn.type, b1, b2]))
}

export function decodeKeyFunction(bytes: ArrayLike<number>): KeyFunction {
  const type = oneOf(bytes[0], KEY_TYPES, KeyType.Disable)
  const param = type === KeyType.DpiLock ? decodeDpi(bytes[1] | (bytes[2] << 8), 0) : (bytes[1] << 8) | bytes[2]
  return { type, param }
}

export const MOUSE_BUTTON_MASK = { left: 0x0100, right: 0x0200, middle: 0x0400, back: 0x0800, forward: 0x1000 } as const
export type MouseButton = keyof typeof MOUSE_BUTTON_MASK

/** Picker list from §4.5's `KeyOptions`, minus DPI Shift (filtered from this SKU's own picker anyway,
 * per §3.11.1's `isX5Device()` note) and with the DPI Switch / Multimedia sub-menus flattened. */
export interface KeyOption {
  label: string
  type: KeyType
  param: number
  /** Set for a "Media: ..." row — assigning it also means writing a Shortcut with `media` at this
   * consumer-page usage (§3.11.2), not just the KeyFunction record (whose param is ignored for type 5). */
  media?: number
}
export const KEY_OPTIONS: KeyOption[] = [
  { label: "Left Click", type: KeyType.MouseKey, param: MOUSE_BUTTON_MASK.left },
  { label: "Right Click", type: KeyType.MouseKey, param: MOUSE_BUTTON_MASK.right },
  { label: "Wheel Click", type: KeyType.MouseKey, param: MOUSE_BUTTON_MASK.middle },
  { label: "Forward", type: KeyType.MouseKey, param: MOUSE_BUTTON_MASK.forward },
  { label: "Back", type: KeyType.MouseKey, param: MOUSE_BUTTON_MASK.back },
  { label: "DPI Switch: Cycle", type: KeyType.DpiSwitch, param: 0x0100 },
  { label: "DPI Switch: Up", type: KeyType.DpiSwitch, param: 0x0200 },
  { label: "DPI Switch: Down", type: KeyType.DpiSwitch, param: 0x0300 },
  { label: "Scroll Up", type: KeyType.UpDownRoll, param: 0x0100 },
  { label: "Scroll Down", type: KeyType.UpDownRoll, param: 0x0200 },
  { label: "Keyboard Shortcut", type: KeyType.ShortcutKey, param: 0 },
  { label: "Media: Media Player", type: KeyType.ShortcutKey, param: 0, media: 0x0183 },
  { label: "Media: Play/Pause", type: KeyType.ShortcutKey, param: 0, media: 0x00cd },
  { label: "Media: Next Track", type: KeyType.ShortcutKey, param: 0, media: 0x00b5 },
  { label: "Media: Previous Track", type: KeyType.ShortcutKey, param: 0, media: 0x00b6 },
  { label: "Media: Stop", type: KeyType.ShortcutKey, param: 0, media: 0x00b7 },
  { label: "Media: Mute", type: KeyType.ShortcutKey, param: 0, media: 0x00e2 },
  { label: "Media: Volume Up", type: KeyType.ShortcutKey, param: 0, media: 0x00e9 },
  { label: "Media: Volume Down", type: KeyType.ShortcutKey, param: 0, media: 0x00ea },
  { label: "Media: Email", type: KeyType.ShortcutKey, param: 0, media: 0x018a },
  { label: "Media: Calculator", type: KeyType.ShortcutKey, param: 0, media: 0x0192 },
  { label: "Media: My Computer", type: KeyType.ShortcutKey, param: 0, media: 0x0194 },
  { label: "Media: Homepage", type: KeyType.ShortcutKey, param: 0, media: 0x0223 },
  { label: "Media: Search", type: KeyType.ShortcutKey, param: 0, media: 0x0221 },
  { label: "Media: Stop Page", type: KeyType.ShortcutKey, param: 0, media: 0x0226 },
  { label: "Media: Refresh Page", type: KeyType.ShortcutKey, param: 0, media: 0x0227 },
  { label: "Media: Favorites", type: KeyType.ShortcutKey, param: 0, media: 0x022a },
  { label: "Macro", type: KeyType.Macro, param: 0 },
  { label: "Polling Rate", type: KeyType.ReportRateSwitch, param: 0 },
  { label: "Profile", type: KeyType.ProfileSwitch, param: 0 },
  { label: "Disable", type: KeyType.Disable, param: 0 },
]

/** §4.4's keyboard scancode table, DOM `code` -> HID usage/modifier bit. `type: 1` normal HID keyboard-page
 * usage, `type: 0` modifier bit, `type: 7` seen once (ContextMenu) with unresolved meaning (§7). Also used
 * by §3.11.2's ShortcutKey event `type` nibble (0/1 here; `type: 2` there is consumer/media, not a DOM key). */
export interface ScancodeEntry {
  code: string
  usage: number
  type: 0 | 1 | 7
}
export const SCANCODES: ScancodeEntry[] = [
  { code: "Escape", usage: 41, type: 1 },
  ...Array.from({ length: 12 }, (_, i) => ({ code: `F${i + 1}`, usage: 58 + i, type: 1 as const })),
  { code: "Backquote", usage: 53, type: 1 },
  ...Array.from({ length: 9 }, (_, i) => ({ code: `Digit${i + 1}`, usage: 30 + i, type: 1 as const })),
  { code: "Digit0", usage: 39, type: 1 },
  { code: "Minus", usage: 45, type: 1 },
  { code: "Equal", usage: 46, type: 1 },
  { code: "Backspace", usage: 42, type: 1 },
  { code: "Tab", usage: 43, type: 1 },
  ...(["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"] as const).map((k, i) => ({
    code: `Key${k}`,
    usage: [20, 26, 8, 21, 23, 28, 24, 12, 18, 19][i],
    type: 1 as const,
  })),
  { code: "BracketLeft", usage: 47, type: 1 },
  { code: "BracketRight", usage: 48, type: 1 },
  { code: "Backslash", usage: 49, type: 1 },
  { code: "CapsLock", usage: 57, type: 1 },
  ...(["A", "S", "D", "F", "G", "H", "J", "K", "L"] as const).map((k, i) => ({
    code: `Key${k}`,
    usage: [4, 22, 7, 9, 10, 11, 13, 14, 15][i],
    type: 1 as const,
  })),
  { code: "Semicolon", usage: 51, type: 1 },
  { code: "Quote", usage: 52, type: 1 },
  { code: "Enter", usage: 40, type: 1 },
  { code: "ShiftLeft", usage: 2, type: 0 },
  ...(["Z", "X", "C", "V", "B", "N", "M"] as const).map((k, i) => ({
    code: `Key${k}`,
    usage: [29, 27, 6, 25, 5, 17, 16][i],
    type: 1 as const,
  })),
  { code: "Comma", usage: 54, type: 1 },
  { code: "Period", usage: 55, type: 1 },
  { code: "Slash", usage: 56, type: 1 },
  { code: "ShiftRight", usage: 32, type: 0 },
  { code: "ControlLeft", usage: 1, type: 0 },
  { code: "MetaLeft", usage: 8, type: 0 },
  { code: "AltLeft", usage: 4, type: 0 },
  { code: "Space", usage: 44, type: 1 },
  { code: "AltRight", usage: 64, type: 0 },
  { code: "MetaRight", usage: 128, type: 0 },
  { code: "ContextMenu", usage: 1, type: 7 },
  { code: "ControlRight", usage: 16, type: 0 },
  { code: "PrintScreen", usage: 70, type: 1 },
  { code: "ScrollLock", usage: 71, type: 1 },
  { code: "Pause", usage: 72, type: 1 },
  { code: "Insert", usage: 73, type: 1 },
  { code: "Home", usage: 74, type: 1 },
  { code: "PageUp", usage: 75, type: 1 },
  { code: "Delete", usage: 76, type: 1 },
  { code: "End", usage: 77, type: 1 },
  { code: "PageDown", usage: 78, type: 1 },
  { code: "ArrowUp", usage: 82, type: 1 },
  { code: "ArrowLeft", usage: 80, type: 1 },
  { code: "ArrowDown", usage: 81, type: 1 },
  { code: "ArrowRight", usage: 79, type: 1 },
  { code: "NumLock", usage: 83, type: 1 },
  { code: "NumpadDivide", usage: 84, type: 1 },
  { code: "NumpadMultiply", usage: 85, type: 1 },
  { code: "NumpadSubtract", usage: 86, type: 1 },
  { code: "NumpadAdd", usage: 87, type: 1 },
  { code: "NumpadDecimal", usage: 99, type: 1 },
  { code: "NumpadEnter", usage: 88, type: 1 },
  ...Array.from({ length: 9 }, (_, i) => ({ code: `Numpad${i + 1}`, usage: 89 + i, type: 1 as const })),
  { code: "Numpad0", usage: 98, type: 1 },
  { code: "Apps", usage: 101, type: 1 },
  { code: "IntlYen", usage: 137, type: 1 },
  { code: "IntlRo", usage: 135, type: 1 },
  { code: "Convert", usage: 138, type: 1 },
  { code: "NonConvert", usage: 139, type: 1 },
  { code: "KanaMode", usage: 136, type: 1 },
  { code: "IntlBackslash", usage: 100, type: 1 },
  // ⚠ "Backslash2" is transcribed verbatim from PROTOCOL.md §4.4 (source display text "K42"); it isn't
  // a real DOM KeyboardEvent.code, just how the vendor table names a second backslash-position key.
  { code: "Backslash2", usage: 50, type: 1 },
  { code: "HangulHanja", usage: 145, type: 1 },
  { code: "Hangul", usage: 144, type: 1 },
]
const SCANCODE_BY_CODE = new Map(SCANCODES.map((e) => [e.code, e]))
const SCANCODE_BY_USAGE_TYPE = new Map(SCANCODES.map((e) => [`${e.usage}:${e.type}`, e]))
export const codeToScancode = (code: string): ScancodeEntry | undefined => SCANCODE_BY_CODE.get(code)
export const scancodeToCode = (usage: number, type: 0 | 1 | 7): string | undefined =>
  SCANCODE_BY_USAGE_TYPE.get(`${usage}:${type}`)?.code

export const SHORTCUT_SIZE = 32
const CONSUMER_TYPE = 2

/**
 * ShortcutKey record, 32 bytes (§3.11.2): byte0 event count, then 3-byte events, final byte checksum.
 * A keyboard combo is `keys.length*2` events — press (flag 0x80) for each key in order, then release
 * (flag 0x40) in reverse order. A media key (`media` set) is the single-media-key path (`qi()`) instead.
 * ⚠ §3.11.2 only "assumes" `qi()`'s wire shape from the decoder's `isMedia` special-case, since no
 * multi-byte example is given for it; this encodes it as a single count=1 press event (type 2, consumer
 * usage LE) — the simplest reading consistent with "decode special-cases a single event with type===2".
 */
export function encodeShortcut(s: Shortcut): Uint8Array {
  const buf = new Uint8Array(SHORTCUT_SIZE)
  if (s.media !== undefined) {
    buf[0] = 1
    buf[1] = 0x80 | CONSUMER_TYPE
    buf[2] = s.media & 0xff
    buf[3] = (s.media >> 8) & 0xff
    buf[SHORTCUT_SIZE - 1] = fieldChecksum(buf.subarray(0, SHORTCUT_SIZE - 1))
    return buf
  }
  if (s.keys.length > SHORTCUT_MAX_KEYS) throw new Error(`shortcut supports at most ${SHORTCUT_MAX_KEYS} keys`)
  const entries = s.keys.map((code) => {
    const e = codeToScancode(code)
    if (!e) throw new Error(`unknown key code ${code}`)
    return e
  })
  buf[0] = entries.length * 2
  let o = 1
  for (const e of entries) {
    buf[o] = 0x80 | e.type
    buf[o + 1] = e.usage & 0xff
    buf[o + 2] = (e.usage >> 8) & 0xff
    o += 3
  }
  for (const e of [...entries].reverse()) {
    buf[o] = 0x40 | e.type
    buf[o + 1] = e.usage & 0xff
    buf[o + 2] = (e.usage >> 8) & 0xff
    o += 3
  }
  buf[SHORTCUT_SIZE - 1] = fieldChecksum(buf.subarray(0, SHORTCUT_SIZE - 1))
  return buf
}

export function decodeShortcut(bytes: ArrayLike<number>): Shortcut {
  const count = bytes[0]
  // Blank flash (never configured) reads back as 0xFF for every byte, count included — decode that as
  // "no combo" outright rather than the `Math.min` clamp below turning it into SHORTCUT_MAX_KEYS worth
  // of fake `Usage65535` entries (still a real risk for a genuinely corrupt, non-blank record, so the
  // clamp stays as defense in depth).
  if (count === 0xff) return { keys: [] }
  if (count === 1) {
    const type = bytes[1] & 0x0f
    if (type === CONSUMER_TYPE) return { keys: [], media: bytes[2] | (bytes[3] << 8) }
  }
  // A blank-flash record reads back as 0xFF (count 255) — clamp so a never-written record decodes to
  // empty instead of reading 127 fabricated "press" events past the 32-byte record.
  const pressCount = Math.min(SHORTCUT_MAX_KEYS, count >> 1)
  const keys: string[] = []
  for (let i = 0; i < pressCount; i++) {
    const o = 1 + i * 3
    const type = (bytes[o] & 0x0f) as 0 | 1 | 7
    const usage = bytes[o + 1] | (bytes[o + 2] << 8)
    keys.push(scancodeToCode(usage, type) ?? `Usage${usage}`)
  }
  return { keys }
}

export async function readShortcut(t: Transport, addr: number): Promise<Shortcut> {
  return decodeShortcut(await readFlashRange(t, addr, SHORTCUT_SIZE))
}
export async function writeShortcut(t: Transport, addr: number, shortcut: Shortcut): Promise<void> {
  await writeFlashRange(t, addr, encodeShortcut(shortcut))
}
